import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { schedules, tasks, users } from "../db/schema.js";
import { ActualTimeClass, ScheduleKind, ScheduleSource } from "../enums.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { cancelManualActual, correctManualActual, recordManualActual } from "../manual-actual.js";
import { isValidTimezone, localDateTimeToUtc } from "../time.js";

const operationId = z.string().uuid();
const time = z.string().regex(/^\d{2}:\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createScheduleSchema = z.object({
  operationId: operationId.optional(),
  scheduleDate: date,
  startTime: time,
  endTime: time,
  recordTimezone: z.string().refine(isValidTimezone).optional(),
  kind: z.union([z.literal(ScheduleKind.PLANNED), z.literal(ScheduleKind.ACTUAL)]),
  taskId: z.number().int().positive().optional(),
  expectedTaskVersion: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
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
  startTime: time,
  endTime: time,
  recordTimezone: z.string().refine(isValidTimezone),
  title: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(500).optional(),
  includeInActualTime: z.boolean()
});
const cancelSchema = z.object({ operationId, expectedVersion: z.number().int().positive() });

export const schedulesRoute = new Hono()
  .post("/", async (c) => {
    const body = createScheduleSchema.parse(await c.req.json());
    if (body.endTime <= body.startTime) throw new BusinessError(ErrorCode.PARAM_ERROR, "end time must be later than start time");
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
        note: body.note,
        startedAt: localDateTimeToUtc(body.scheduleDate, body.startTime, recordTimezone),
        endedAt: localDateTimeToUtc(body.scheduleDate, body.endTime, recordTimezone),
        recordTimezone,
        includeInActualTime: body.includeInActualTime,
        completeTask: body.completeTask,
        completionNote: body.completionNote
      }));
    }

    const [task] = body.taskId ? await db.select().from(tasks).where(and(eq(tasks.id, body.taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt))) : [];
    if (body.taskId && !task) throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    if (!task && !body.title) throw new BusinessError(ErrorCode.PARAM_ERROR, "title is required without a task");
    const now = new Date();
    const [result] = await db.insert(schedules).values({
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
      kind: ScheduleKind.PLANNED,
      source: ScheduleSource.MANUAL,
      createdAt: now,
      updatedAt: now
    });
    return ok(c, { id: result.insertId });
  })
  .put("/:id", async (c) => {
    const scheduleId = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = correctSchema.parse(await c.req.json());
    return ok(c, await correctManualActual({
      userId: getCurrentUserId(c),
      scheduleId,
      ...body,
      startedAt: localDateTimeToUtc(body.scheduleDate, body.startTime, body.recordTimezone),
      endedAt: localDateTimeToUtc(body.scheduleDate, body.endTime, body.recordTimezone)
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
    await db.delete(schedules).where(eq(schedules.id, scheduleId));
    return ok(c, { id: scheduleId });
  });
