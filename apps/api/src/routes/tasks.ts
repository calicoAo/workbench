import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { schedules, taskCategories, taskDailyAssignments, tasks, timerSessions } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { canTransitTaskStatus, ScheduleKind, ScheduleSource, TaskStatus, type TaskStatusValue } from "../enums.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { grantTaskDoneReward, grantTaskDoneRewardInClient } from "../rewards.js";


const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  categoryId: z.number().int().positive(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(2),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  plannedStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional()
});

const updateStatusSchema = z.object({
  status: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  completionNote: z.string().max(1000).optional()
});

const completeTaskSchema = z.object({
  scheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  completionNote: z.string().max(1000).optional()
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  progressPercent: z.number().int().min(0).max(100).optional()
}).refine((value) => value.title !== undefined || value.description !== undefined || value.categoryId !== undefined || value.dueAt !== undefined || value.difficulty !== undefined || value.progressPercent !== undefined, {
  message: "title, description, categoryId, dueAt, difficulty or progressPercent is required"
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
    const dueAt = body.dueAt === undefined ? task.dueAt : body.dueAt ? localDateTime(body.dueAt) : null;
    const dueDate = body.dueAt === undefined ? task.dueDate : body.dueAt ? body.dueAt.slice(0, 10) : null;
    const progressPercent = body.progressPercent ?? task.progressPercent;
    await Promise.all([
      db.update(tasks).set({ title, description, categoryId, dueDate, dueAt, difficulty, progressPercent, updatedAt: now }).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt))),
      db.update(schedules).set({ title, categoryId, updatedAt: now }).where(and(eq(schedules.taskId, id), eq(schedules.userId, getCurrentUserId(c)), isNull(schedules.deletedAt))),
      db.update(timerSessions).set({ categoryId, updatedAt: now }).where(and(eq(timerSessions.taskId, id), eq(timerSessions.userId, getCurrentUserId(c)), isNull(timerSessions.deletedAt)))
    ]);

    log.info({ userId: getCurrentUserId(c), taskId: id, categoryId, titleChanged: body.title !== undefined }, "[task_updated]");
    return ok(c, { id, title, description, categoryId, dueAt, difficulty, progressPercent });
  })
  .delete("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    if (!task) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    }

    await Promise.all([
      db.delete(taskDailyAssignments).where(and(eq(taskDailyAssignments.taskId, id), eq(taskDailyAssignments.userId, getCurrentUserId(c)))),
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

    const reward =
      body.status === TaskStatus.DONE && task.status !== TaskStatus.DONE
        ? await grantTaskDoneReward(getCurrentUserId(c), task)
        : null;

    log.info({ userId: getCurrentUserId(c), taskId: id, from: current, to: body.status }, "[task_status_changed]");
    return ok(c, { id, status: body.status, reward });
  })
  .put("/:id/complete", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = completeTaskSchema.parse(await c.req.json());
    if (body.endTime <= body.startTime) {
      throw new BusinessError(ErrorCode.PARAM_ERROR, "end time must be later than start time", 400);
    }

    const userId = getCurrentUserId(c);
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
      if (!task) throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);

      const current = task.status as TaskStatusValue;
      if (current !== TaskStatus.DONE && !canTransitTaskStatus(current, TaskStatus.DONE)) {
        throw new BusinessError(ErrorCode.PARAM_ERROR, "invalid task status transition");
      }

      await tx
        .update(tasks)
        .set({
          status: TaskStatus.DONE,
          completedAt: current !== TaskStatus.DONE ? now : task.completedAt,
          completionNote: body.completionNote?.trim() ? body.completionNote.trim() : task.completionNote,
          updatedAt: now
        })
        .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)));

      const [scheduleResult] = await tx.insert(schedules).values({
        userId,
        taskId: task.id,
        categoryId: task.categoryId,
        scheduleDate: body.scheduleDate,
        startTime: `${body.startTime}:00`,
        endTime: `${body.endTime}:00`,
        title: task.title,
        note: body.completionNote?.trim() || undefined,
        completed: 1,
        kind: ScheduleKind.ACTUAL,
        source: ScheduleSource.MANUAL,
        createdAt: now,
        updatedAt: now
      });

      const reward = current !== TaskStatus.DONE ? await grantTaskDoneRewardInClient(tx, userId, task) : null;
      return { id, status: TaskStatus.DONE, scheduleId: scheduleResult.insertId, reward };
    });

    log.info({ userId, taskId: id, scheduleId: result.scheduleId }, "[task_completed]");
    return ok(c, result);
  })
  .put("/:id/pinned", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = updatePinnedSchema.parse(await c.req.json());
    await db.update(tasks).set({ pinned: body.pinned ? 1 : 0, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    log.info({ userId: getCurrentUserId(c), taskId: id, pinned: body.pinned }, "[task_pinned_changed]");
    return ok(c, { id, pinned: body.pinned });
  });

