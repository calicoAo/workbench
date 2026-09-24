import { and, between, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db, type DatabaseClient } from "../db/index.js";
import { schedules, tasks, users } from "../db/schema.js";
import { ActualTimeClass, ScheduleKind, ScheduleLifecycle, ScheduleSource } from "../enums.js";
import { dailyExecutionForUser } from "../execution-read-model.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { cancelManualActual, correctManualActual, recordManualActual } from "../manual-actual.js";
import { runMutation } from "../mutation-receipt.js";
import { isValidTimezone, localDateTimeToUtc } from "../time.js";

const operationId = z.string().uuid();
const time = z.string().regex(/^\d{2}:\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createScheduleSchema = z.object({
  operationId: operationId.optional(),
  scheduleDate: date,
  startDate: date.optional(),
  endDate: date.optional(),
  startTime: time,
  endTime: time,
  recordTimezone: z.string().refine(isValidTimezone).optional(),
  kind: z.union([z.literal(ScheduleKind.PLANNED), z.literal(ScheduleKind.ACTUAL)]),
  taskId: z.number().int().positive().optional(),
  expectedTaskVersion: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  projectIdAtOccurrence: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(500).optional(),
  includeInActualTime: z.boolean().default(true),
  completeTask: z.boolean().default(false),
  completionNote: z.string().trim().max(1000).optional()
});
const correctSchema = z.object({
  operationId,
  expectedVersion: z.number().int().positive(),
  scheduleDate: date,
  startDate: date.optional(),
  endDate: date.optional(),
  startTime: time,
  endTime: time,
  recordTimezone: z.string().refine(isValidTimezone),
  title: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(500).optional(),
  includeInActualTime: z.boolean(),
  projectIdAtOccurrence: z.number().int().positive().nullable().optional()
});
const cancelSchema = z.object({ operationId, expectedVersion: z.number().int().positive() });
const rangeSchema = z.object({ from: date, to: date, timezone: z.string().refine(isValidTimezone) });
const plannedUpdateSchema = z.object({
  operationId,
  expectedVersion: z.number().int().positive(),
  scheduleDate: date,
  startTime: time,
  endTime: time,
  recordTimezone: z.string().refine(isValidTimezone),
  taskId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(500).optional()
});

async function insertPlannedSchedule(client: DatabaseClient, userId: number, body: z.infer<typeof createScheduleSchema>, recordTimezone: string, sourceId?: string, rescheduledFromScheduleId?: number) {
  const [task] = body.taskId ? await client.select().from(tasks).where(and(eq(tasks.id, body.taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt))) : [];
  if (body.taskId && !task) throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
  if (!task && !body.title) throw new BusinessError(ErrorCode.PARAM_ERROR, "title is required without a task");
  const now = new Date();
  const [result] = await client.insert(schedules).values({
    userId,
    taskId: task?.id,
    categoryId: task?.categoryId ?? body.categoryId,
    scheduleDate: body.scheduleDate,
    recordTimezone,
    startTime: `${body.startTime}:00`,
    endTime: `${body.endTime}:00`,
    title: body.title ?? task!.title,
    note: body.note,
    completed: 0,
    lifecycleState: ScheduleLifecycle.PENDING,
    kind: ScheduleKind.PLANNED,
    source: ScheduleSource.MANUAL,
    sourceId,
    rescheduledFromScheduleId,
    createdAt: now,
    updatedAt: now
  });
  return { id: result.insertId, version: 1, lifecycleState: ScheduleLifecycle.PENDING };
}

function rangeDates(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days < 0 || days > 6) throw new BusinessError(ErrorCode.PARAM_ERROR, "calendar range must contain 1-7 days");
  return Array.from({ length: days + 1 }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
}

export const schedulesRoute = new Hono()
  .get("/", async (c) => {
    const query = rangeSchema.parse(c.req.query());
    const dates = rangeDates(query.from, query.to);
    const userId = getCurrentUserId(c);
    const [scheduleRows, days] = await Promise.all([
      db.select().from(schedules).where(and(eq(schedules.userId, userId), between(schedules.scheduleDate, query.from, query.to), isNull(schedules.deletedAt))),
      Promise.all(dates.map(async (businessDate) => ({ businessDate, ...await dailyExecutionForUser(userId, businessDate, query.timezone) })))
    ]);
    return ok(c, { from: query.from, to: query.to, timezone: query.timezone, schedules: scheduleRows, days });
  })
  .post("/", async (c) => {
    const body = createScheduleSchema.parse(await c.req.json());
    const startDate = body.startDate ?? body.scheduleDate;
    const endDate = body.endDate ?? body.scheduleDate;
    if (body.kind === ScheduleKind.PLANNED && (startDate !== body.scheduleDate || endDate !== body.scheduleDate)) throw new BusinessError(ErrorCode.PARAM_ERROR, "planned blocks must stay within their schedule date");
    if (body.kind === ScheduleKind.PLANNED && body.endTime <= body.startTime) throw new BusinessError(ErrorCode.PARAM_ERROR, "end time must be later than start time");
    const userId = getCurrentUserId(c);
    const [user] = await db.select({ timezone: users.timezone }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
    const recordTimezone = body.recordTimezone ?? user.timezone;
    if (body.kind === ScheduleKind.ACTUAL) {
      if (!body.operationId) throw new BusinessError(ErrorCode.PARAM_ERROR, "operationId is required for Manual Actual");
      return ok(c, await recordManualActual({
        userId,
        operationId: body.operationId,
        taskId: body.taskId,
        expectedTaskVersion: body.expectedTaskVersion,
        title: body.title,
        projectIdAtOccurrence: body.projectIdAtOccurrence,
        note: body.note,
        startedAt: localDateTimeToUtc(startDate, body.startTime, recordTimezone),
        endedAt: localDateTimeToUtc(endDate, body.endTime, recordTimezone),
        recordTimezone,
        includeInActualTime: body.includeInActualTime,
        completeTask: body.completeTask,
        completionNote: body.completionNote
      }));
    }

    if (!body.operationId) return ok(c, await insertPlannedSchedule(db, userId, body, recordTimezone));
    return ok(c, await runMutation({
      userId,
      operationId: body.operationId,
      commandType: "CREATE_PLANNED_SCHEDULE",
      request: { scheduleDate: body.scheduleDate, startTime: body.startTime, endTime: body.endTime, recordTimezone, taskId: body.taskId ?? null, categoryId: body.categoryId ?? null, title: body.title ?? null, note: body.note ?? null }
    }, (tx) => insertPlannedSchedule(tx, userId, body, recordTimezone, `planned:${body.operationId}`)));
  })
  .put("/:id", async (c) => {
    const scheduleId = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const [existing] = await db.select().from(schedules).where(and(eq(schedules.id, scheduleId), eq(schedules.userId, userId), isNull(schedules.deletedAt)));
    if (!existing) throw new BusinessError(ErrorCode.NOT_FOUND, "schedule not found", 404);
    const input = await c.req.json();
    if (existing.kind === ScheduleKind.PLANNED) {
      const body = plannedUpdateSchema.parse(input);
      if (body.endTime <= body.startTime) throw new BusinessError(ErrorCode.PARAM_ERROR, "end time must be later than start time");
      return ok(c, await runMutation({ userId, operationId: body.operationId, commandType: "UPDATE_PLANNED_SCHEDULE", request: { scheduleId, ...body } }, async (tx) => {
        const [schedule] = await tx.select().from(schedules).where(and(eq(schedules.id, scheduleId), eq(schedules.userId, userId), isNull(schedules.deletedAt))).for("update");
        if (!schedule || schedule.kind !== ScheduleKind.PLANNED) throw new BusinessError(ErrorCode.CONFLICT, "only Planned schedules can use this editor", 409);
        if (schedule.version !== body.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "schedule version conflict", 409);
        await tx.update(schedules).set({ scheduleDate: body.scheduleDate, startTime: `${body.startTime}:00`, endTime: `${body.endTime}:00`, recordTimezone: body.recordTimezone, taskId: body.taskId, categoryId: body.categoryId, title: body.title, note: body.note?.trim() || null, version: schedule.version + 1, updatedAt: new Date() }).where(eq(schedules.id, scheduleId));
        return { id: scheduleId, version: schedule.version + 1, lifecycleState: schedule.lifecycleState };
      }));
    }
    const body = correctSchema.parse(input);
    return ok(c, await correctManualActual({
      userId,
      scheduleId,
      ...body,
      startedAt: localDateTimeToUtc(body.startDate ?? body.scheduleDate, body.startTime, body.recordTimezone),
      endedAt: localDateTimeToUtc(body.endDate ?? body.scheduleDate, body.endTime, body.recordTimezone)
    }));
  })
  .delete("/:id", async (c) => {
    const scheduleId = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const [schedule] = await db.select().from(schedules).where(and(eq(schedules.id, scheduleId), eq(schedules.userId, userId), isNull(schedules.deletedAt)));
    if (!schedule) throw new BusinessError(ErrorCode.NOT_FOUND, "schedule not found", 404);
    if (schedule.actualTimeClass === ActualTimeClass.TIMER_PROJECTION || schedule.source === ScheduleSource.TIMER) {
      throw new BusinessError(ErrorCode.CONFLICT, "TIMER projections can only be changed by their Session", 409);
    }
    if (schedule.actualTimeClass === ActualTimeClass.MANUAL_ACTUAL) {
      return ok(c, await cancelManualActual({ userId, scheduleId, ...cancelSchema.parse(await c.req.json()) }));
    }
    if (schedule.actualTimeClass === ActualTimeClass.LEGACY_ACTUAL) throw new BusinessError(ErrorCode.CONFLICT, "legacy Actual is read-only", 409);
    const body = cancelSchema.parse(await c.req.json());
    return ok(c, await runMutation({ userId, operationId: body.operationId, commandType: "CANCEL_PLANNED_SCHEDULE", request: { scheduleId, expectedVersion: body.expectedVersion } }, async (tx) => {
      const [locked] = await tx.select().from(schedules).where(and(eq(schedules.id, scheduleId), eq(schedules.userId, userId), isNull(schedules.deletedAt))).for("update");
      if (!locked || locked.kind !== ScheduleKind.PLANNED) throw new BusinessError(ErrorCode.CONFLICT, "only Planned schedules can be cancelled here", 409);
      if (locked.version !== body.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "schedule version conflict", 409);
      await tx.update(schedules).set({ lifecycleState: ScheduleLifecycle.CANCELLED, deletedAt: new Date(), version: locked.version + 1, updatedAt: new Date() }).where(eq(schedules.id, scheduleId));
      return { id: scheduleId, version: locked.version + 1, lifecycleState: ScheduleLifecycle.CANCELLED };
    }));
  })
  .post("/:id/reschedule", async (c) => {
    const scheduleId = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const body = plannedUpdateSchema.parse(await c.req.json());
    if (body.endTime <= body.startTime) throw new BusinessError(ErrorCode.PARAM_ERROR, "end time must be later than start time");
    return ok(c, await runMutation({ userId, operationId: body.operationId, commandType: "RESCHEDULE_PLANNED_SCHEDULE", request: { scheduleId, ...body } }, async (tx) => {
      const [source] = await tx.select().from(schedules).where(and(eq(schedules.id, scheduleId), eq(schedules.userId, userId), isNull(schedules.deletedAt))).for("update");
      if (!source || source.kind !== ScheduleKind.PLANNED) throw new BusinessError(ErrorCode.CONFLICT, "only Planned schedules can be rescheduled", 409);
      if (source.version !== body.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "schedule version conflict", 409);
      const created = await insertPlannedSchedule(tx, userId, {
        scheduleDate: body.scheduleDate,
        startTime: body.startTime,
        endTime: body.endTime,
        recordTimezone: body.recordTimezone,
        kind: ScheduleKind.PLANNED,
        taskId: body.taskId ?? undefined,
        categoryId: body.categoryId ?? undefined,
        title: body.title,
        note: body.note,
        includeInActualTime: true,
        completeTask: false
      }, body.recordTimezone, `reschedule:${body.operationId}`, source.id);
      await tx.update(schedules).set({ lifecycleState: ScheduleLifecycle.RESCHEDULED, version: source.version + 1, updatedAt: new Date() }).where(eq(schedules.id, source.id));
      return { id: created.id, sourceId: source.id, sourceVersion: source.version + 1, lifecycleState: ScheduleLifecycle.PENDING };
    }));
  });
