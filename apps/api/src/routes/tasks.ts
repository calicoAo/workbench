import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { schedules, taskCategories, tasks, timerSessions } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { canTransitTaskStatus, ScheduleKind, ScheduleSource, TaskStatus, type TaskStatusValue } from "../enums.js";
import { ok } from "../http.js";
import { log } from "../logger.js";


const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  categoryId: z.number().int().positive(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  plannedStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional()
});

const updateStatusSchema = z.object({
  status: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  completionNote: z.string().max(1000).optional()
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  categoryId: z.number().int().positive().nullable().optional()
}).refine((value) => value.title !== undefined || value.categoryId !== undefined, {
  message: "title or categoryId is required"
});

const updatePinnedSchema = z.object({
  pinned: z.boolean()
});

const reorderSchema = z.object({
  taskIds: z.array(z.number().int().positive()).min(1)
});

export const tasksRoute = new Hono()
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.sortOrder), desc(tasks.updatedAt));

    return ok(c, rows);
  })
  .post("/", async (c) => {
    const body = createTaskSchema.parse(await c.req.json());
    if (body.plannedStartTime && body.plannedEndTime && body.plannedEndTime <= body.plannedStartTime) {
      throw new BusinessError(ErrorCode.PARAM_ERROR, "planned end time must be later than start time");
    }

    const now = new Date();
    const existingTasks = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    const [result] = await db.insert(tasks).values({
      userId: getCurrentUserId(c),
      categoryId: body.categoryId,
      title: body.title,
      priority: body.priority,
      status: TaskStatus.TODO,
      estimatedMinutes: body.estimatedMinutes,
      dueDate: body.dueDate,
      pinned: 0,
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
    await Promise.all([
      db.update(tasks).set({ title, categoryId, updatedAt: now }).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt))),
      db.update(schedules).set({ title, categoryId, updatedAt: now }).where(and(eq(schedules.taskId, id), eq(schedules.userId, getCurrentUserId(c)), isNull(schedules.deletedAt))),
      db.update(timerSessions).set({ categoryId, updatedAt: now }).where(and(eq(timerSessions.taskId, id), eq(timerSessions.userId, getCurrentUserId(c)), isNull(timerSessions.deletedAt)))
    ]);

    log.info({ userId: getCurrentUserId(c), taskId: id, categoryId, titleChanged: body.title !== undefined }, "[task_updated]");
    return ok(c, { id, title, categoryId });
  })
  .delete("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    if (!task) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    }

    await Promise.all([
      db.delete(schedules).where(and(eq(schedules.taskId, id), eq(schedules.userId, getCurrentUserId(c)))),
      db.delete(timerSessions).where(and(eq(timerSessions.taskId, id), eq(timerSessions.userId, getCurrentUserId(c)))),
      db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c))))
    ]);

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
    if (current !== body.status && !canTransitTaskStatus(current, body.status)) {
      throw new BusinessError(ErrorCode.PARAM_ERROR, "invalid task status transition");
    }

    await db
      .update(tasks)
      .set({
        status: body.status,
        completedAt: body.status === TaskStatus.DONE && task.status !== TaskStatus.DONE ? new Date() : body.status !== TaskStatus.DONE ? null : task.completedAt,
        completionNote: body.completionNote?.trim() ? body.completionNote.trim() : task.completionNote,
        updatedAt: new Date()
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));

    log.info({ userId: getCurrentUserId(c), taskId: id, from: current, to: body.status }, "[task_status_changed]");
    return ok(c, { id, status: body.status });
  })
  .put("/:id/pinned", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = updatePinnedSchema.parse(await c.req.json());
    await db.update(tasks).set({ pinned: body.pinned ? 1 : 0, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    log.info({ userId: getCurrentUserId(c), taskId: id, pinned: body.pinned }, "[task_pinned_changed]");
    return ok(c, { id, pinned: body.pinned });
  });

