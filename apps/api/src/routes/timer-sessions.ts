import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { tasks, timerSessions } from "../db/schema.js";
import { TimerStatus } from "../enums.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { finishWorkSession, pauseWorkSession } from "../work-session.js";

const startTimerSchema = z.object({
  taskId: z.number().int().positive()
});

const finishTimerSchema = z
  .object({
    scheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    completeTask: z.boolean().default(false)
  })
  .refine((body) => (!body.startTime && !body.endTime) || Boolean(body.startTime && body.endTime), "startTime and endTime must be provided together");

export const timerSessionsRoute = new Hono()
  .post("/start", async (c) => {
    const body = startTimerSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const [running] = await db
      .select()
      .from(timerSessions)
      .where(and(eq(timerSessions.userId, userId), eq(timerSessions.taskId, body.taskId), eq(timerSessions.status, TimerStatus.RUNNING), isNull(timerSessions.deletedAt)));

    if (running) {
      throw new BusinessError(ErrorCode.CONFLICT, "timer is already running for this task", 409);
    }

    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, body.taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)));
    if (!task) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    }

    const now = new Date();
    const [result] = await db.insert(timerSessions).values({
      userId,
      taskId: task.id,
      categoryId: task.categoryId,
      startTime: now,
      durationMinutes: 0,
      status: TimerStatus.RUNNING,
      createdAt: now,
      updatedAt: now
    });

    log.info({ userId, taskId: task.id, timerSessionId: result.insertId }, "[timer_started]");
    return ok(c, { id: result.insertId });
  })
  .put("/:id/pause", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const result = await pauseWorkSession({ userId, sessionId: id });
    log.info({ userId, timerSessionId: id, durationMinutes: result.durationMinutes }, "[timer_paused]");
    return ok(c, result);
  })
  .put("/:id/finish", async (c) => {
    const rawBody = await c.req.json().catch(() => ({}));
    const body = finishTimerSchema.parse(rawBody);
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const result = await finishWorkSession({ userId, sessionId: id, ...body });
    log.info({ userId, timerSessionId: id, durationMinutes: result.durationMinutes, taskCompleted: result.taskCompleted }, "[timer_finished]");
    return ok(c, result);
  });
