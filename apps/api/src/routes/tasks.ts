import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { quickNoteTaskLinks, schedules, taskCategories, taskDailyAssignments, tasks, timerSegments } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ActualTimeClass, canTransitTaskStatus, ScheduleKind, ScheduleSource, TaskStatus, TimerSegmentStatus, type TaskStatusValue } from "../enums.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { archiveTask, completeTask, removeTask, reopenTask } from "../task-completion.js";
import { publishTask } from "../task-publishing.js";
import { isValidTimezone, localDateTimeToUtc } from "../time.js";


const createTaskSchema = z.object({
  operationId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  categoryId: z.number().int().positive().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(2),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  acceptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  recordTimezone: z.string().refine(isValidTimezone).optional(),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  plannedStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional()
});

const updateStatusSchema = z.object({
  status: z.union([z.literal(0), z.literal(1)])
});

const completeTaskSchema = z.object({
  operationId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  completionNote: z.string().max(1000).optional()
});

const versionedCommandSchema = z.object({ operationId: z.string().uuid(), expectedVersion: z.number().int().positive() });
const reopenTaskSchema = versionedCommandSchema.extend({ progressPercent: z.number().int().min(0).max(99).default(0) });

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  progressPercent: z.number().int().min(0).max(100).optional()
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "at least one editable field is required"
});

const updatePinnedSchema = z.object({
  pinned: z.boolean()
});

const reorderSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1)
});

function localDateTime(value: string) {
  return new Date(`${value}:00+08:00`);
}

export const tasksRoute = new Hono()
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.sortOrder), desc(tasks.updatedAt));

    return ok(c, rows);
  })
  .get("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
    if (!task) throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    const [assignments, plannedSchedules, segments, actualSchedules, sourceRows] = await Promise.all([
      db.select().from(taskDailyAssignments).where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.taskId, id))).orderBy(desc(taskDailyAssignments.taskDate)),
      db.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.taskId, id), eq(schedules.kind, ScheduleKind.PLANNED))).orderBy(desc(schedules.scheduleDate)),
      db.select().from(timerSegments).where(and(eq(timerSegments.userId, userId), eq(timerSegments.taskId, id), eq(timerSegments.status, TimerSegmentStatus.CLOSED), isNull(timerSegments.deletedAt))).orderBy(desc(timerSegments.startedAt)),
      db.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.taskId, id), inArray(schedules.actualTimeClass, [ActualTimeClass.MANUAL_ACTUAL, ActualTimeClass.LEGACY_ACTUAL]), isNull(schedules.deletedAt))).orderBy(desc(schedules.actualStartedAt)),
      db.select({ noteId: quickNoteTaskLinks.quickNoteId }).from(quickNoteTaskLinks).where(and(eq(quickNoteTaskLinks.userId, userId), eq(quickNoteTaskLinks.taskId, id)))
    ]);
    return ok(c, {
      task,
      source: sourceRows[0] ? { type: "QUICK_NOTE", id: sourceRows[0].noteId } : null,
      assignments,
      plannedSchedules,
      actualEntries: [
        ...segments.filter((row) => row.endedAt).map((row) => ({ source: "TIMER_SEGMENT", sourceId: row.id, startedAt: row.startedAt, endedAt: row.endedAt, businessDate: row.businessDate, recordTimezone: row.recordTimezone })),
        ...actualSchedules.map((row) => ({ source: row.actualTimeClass === ActualTimeClass.MANUAL_ACTUAL ? "MANUAL_ACTUAL" : "LEGACY_ACTUAL", sourceId: row.id, startedAt: row.actualStartedAt, endedAt: row.actualEndedAt, businessDate: row.scheduleDate, recordTimezone: row.recordTimezone }))
      ].sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))
    });
  })
  .post("/", async (c) => {
    const body = createTaskSchema.parse(await c.req.json());
    if (body.acceptDate && (!body.operationId || !body.recordTimezone)) {
      throw new BusinessError(ErrorCode.PARAM_ERROR, "operationId and recordTimezone are required when accepting the published task");
    }
    if (body.operationId && body.recordTimezone) {
      const dueAt = body.dueAt ? localDateTimeToUtc(body.dueAt.slice(0, 10), body.dueAt.slice(11), body.recordTimezone) : undefined;
      return ok(c, await publishTask({
        userId: getCurrentUserId(c),
        operationId: body.operationId,
        title: body.title,
        description: body.description,
        categoryId: body.categoryId,
        priority: body.priority,
        difficulty: body.difficulty,
        dueAt,
        estimatedMinutes: body.estimatedMinutes,
        progressPercent: body.progressPercent ?? 0,
        acceptDate: body.acceptDate,
        recordTimezone: body.recordTimezone
      }));
    }
    if (body.plannedStartTime && body.plannedEndTime && body.plannedEndTime <= body.plannedStartTime) {
      throw new BusinessError(ErrorCode.PARAM_ERROR, "planned end time must be later than start time");
    }

    const now = new Date();
    const existingTasks = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    const [result] = await db.insert(tasks).values({
      userId: getCurrentUserId(c),
      categoryId: body.categoryId,
      title: body.title,
      description: body.description?.trim() || null,
      priority: body.priority,
      difficulty: body.difficulty,
      status: TaskStatus.TODO,
      estimatedMinutes: body.estimatedMinutes,
      dueDate: body.dueAt ? body.dueAt.slice(0, 10) : body.dueDate,
      dueAt: body.dueAt ? localDateTime(body.dueAt) : null,
      pinned: 0,
      progressPercent: body.progressPercent ?? 0,
      sortOrder: existingTasks.length + 1,
      createdAt: now,
      updatedAt: now
    });

    if (body.plannedDate && body.plannedStartTime && body.plannedEndTime) {
      await db.insert(schedules).values({
        userId: getCurrentUserId(c),
        taskId: result.insertId,
        categoryId: body.categoryId,
        scheduleDate: body.plannedDate,
        startTime: `${body.plannedStartTime}:00`,
        endTime: `${body.plannedEndTime}:00`,
        title: body.title,
        completed: 0,
        kind: ScheduleKind.PLANNED,
        source: ScheduleSource.PLANNED_TASK,
        createdAt: now,
        updatedAt: now
      });
    }

    log.info({ userId: getCurrentUserId(c), taskId: result.insertId }, "[task_created]");
    return ok(c, { id: result.insertId });
  })
  .put("/reorder", async (c) => {
    const body = reorderSchema.parse(await c.req.json());
    await Promise.all(
      body.taskIds.map((id, index) =>
        db.update(tasks).set({ sortOrder: index + 1, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c))))
      )
    );
    log.info({ userId: getCurrentUserId(c), taskCount: body.taskIds.length }, "[tasks_reordered]");
    return ok(c, { taskIds: body.taskIds });
  })
  .put("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = updateTaskSchema.parse(await c.req.json());
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    if (!task) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    }

    if (body.categoryId) {
      const [category] = await db
        .select()
        .from(taskCategories)
        .where(and(eq(taskCategories.id, body.categoryId), eq(taskCategories.userId, getCurrentUserId(c)), eq(taskCategories.enabled, 1), isNull(taskCategories.deletedAt)));
      if (!category) {
        throw new BusinessError(ErrorCode.NOT_FOUND, "category not found", 404);
      }
    }

    const now = new Date();
    const categoryId = body.categoryId === undefined ? task.categoryId : body.categoryId;
    const title = body.title ?? task.title;
    const description = body.description === undefined ? task.description : body.description?.trim() || null;
    const difficulty = body.difficulty ?? task.difficulty;
    const priority = body.priority ?? task.priority;
    const estimatedMinutes = body.estimatedMinutes === undefined ? task.estimatedMinutes : body.estimatedMinutes;
    const dueAt = body.dueAt === undefined ? task.dueAt : body.dueAt ? localDateTime(body.dueAt) : null;
    const dueDate = body.dueAt === undefined ? task.dueDate : body.dueAt ? body.dueAt.slice(0, 10) : null;
    const progressPercent = body.progressPercent ?? task.progressPercent;
    await Promise.all([
      db.update(tasks).set({ title, description, categoryId, dueDate, dueAt, priority, difficulty, estimatedMinutes, progressPercent, updatedAt: now }).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt))),
      db.update(schedules).set({ title, categoryId, updatedAt: now }).where(and(eq(schedules.taskId, id), eq(schedules.userId, getCurrentUserId(c)), eq(schedules.kind, ScheduleKind.PLANNED), isNull(schedules.deletedAt)))
    ]);

    log.info({ userId: getCurrentUserId(c), taskId: id, categoryId, titleChanged: body.title !== undefined }, "[task_updated]");
    return ok(c, { id, title, description, categoryId, dueAt, priority, difficulty, estimatedMinutes, progressPercent });
  })
  .delete("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = versionedCommandSchema.parse(await c.req.json());
    await removeTask({ userId: getCurrentUserId(c), taskId: id, ...body });
    log.info({ userId: getCurrentUserId(c), taskId: id }, "[task_deleted]");
    return ok(c, { id });
  })
  .put("/:id/status", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = updateStatusSchema.parse(await c.req.json());
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));

    if (!task) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    }

    const current = task.status as TaskStatusValue;
    if (current === TaskStatus.DONE) throw new BusinessError(ErrorCode.CONFLICT, "use the reopen command", 409);
    if (current !== body.status && !canTransitTaskStatus(current, body.status)) {
      throw new BusinessError(ErrorCode.PARAM_ERROR, "invalid task status transition");
    }

    await db
      .update(tasks)
      .set({
        status: body.status,
        completedAt: null,
        updatedAt: new Date()
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));

    log.info({ userId: getCurrentUserId(c), taskId: id, from: current, to: body.status }, "[task_status_changed]");
    return ok(c, { id, status: body.status });
  })
  .put("/:id/complete", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = completeTaskSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const result = await completeTask({ userId, taskId: id, ...body });
    log.info({ userId, taskId: id, completionEventId: result.completionEventId }, "[task_completed]");
    return ok(c, result);
  })
  .put("/:id/reopen", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    return ok(c, await reopenTask({ userId: getCurrentUserId(c), taskId: id, ...reopenTaskSchema.parse(await c.req.json()) }));
  })
  .put("/:id/archive", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    return ok(c, await archiveTask({ userId: getCurrentUserId(c), taskId: id, ...versionedCommandSchema.parse(await c.req.json()) }));
  })
  .put("/:id/pinned", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = updatePinnedSchema.parse(await c.req.json());
    await db.update(tasks).set({ pinned: body.pinned ? 1 : 0, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    log.info({ userId: getCurrentUserId(c), taskId: id, pinned: body.pinned }, "[task_pinned_changed]");
    return ok(c, { id, pinned: body.pinned });
  });
