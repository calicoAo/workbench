import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { taskDailyAssignments, tasks } from "../db/schema.js";
import { TaskStatus } from "../enums.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";

const dateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const updateDailyTasksSchema = z.object({
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskIds: z.array(z.number().int().positive()).max(30)
});

export const taskDaysRoute = new Hono()
  .get("/", async (c) => {
    const query = dateSchema.parse(c.req.query());
    const rows = await db
      .select({ taskId: taskDailyAssignments.taskId })
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, getCurrentUserId(c)), eq(taskDailyAssignments.taskDate, query.date)))
      .orderBy(asc(taskDailyAssignments.sortOrder), asc(taskDailyAssignments.id));
    return ok(c, { taskDate: query.date, taskIds: rows.map((row) => row.taskId) });
  })
  .put("/", async (c) => {
    const body = updateDailyTasksSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const uniqueTaskIds = [...new Set(body.taskIds)];
    if (uniqueTaskIds.length) {
      const rows = await db
        .select({ id: tasks.id, status: tasks.status })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));
      const validTasks = new Map(rows.map((row) => [row.id, row.status]));
      if (uniqueTaskIds.some((taskId) => !validTasks.has(taskId) || validTasks.get(taskId) === TaskStatus.DONE || validTasks.get(taskId) === TaskStatus.ARCHIVED)) {
        throw new BusinessError(ErrorCode.NOT_FOUND, "one or more tasks not found", 404);
      }
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.delete(taskDailyAssignments).where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.taskDate, body.taskDate)));
      if (uniqueTaskIds.length) {
        await tx.insert(taskDailyAssignments).values(
          uniqueTaskIds.map((taskId, index) => ({
            userId,
            taskId,
            taskDate: body.taskDate,
            sortOrder: index + 1,
            createdAt: now,
            updatedAt: now
          }))
        );
      }
    });

    log.info({ userId, taskDate: body.taskDate, taskCount: uniqueTaskIds.length }, "[daily_tasks_updated]");
    return ok(c, { taskDate: body.taskDate, taskIds: uniqueTaskIds });
  });
