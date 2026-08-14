import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { schedules, tasks, timerSessions } from "../db/schema.js";
import { canTransitTaskStatus, ScheduleKind, ScheduleSource, TaskStatus, type TaskStatusValue, TimerStatus } from "../enums.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { grantTaskDoneReward, grantTaskPartialReward, grantTimerReward } from "../rewards.js";


const startTimerSchema = z.object({
  taskId: z.number().int().positive()
});

const finishTimerSchema = z
  .object({
    scheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional()
  })
  .refine((body) => (!body.startTime && !body.endTime) || Boolean(body.startTime && body.endTime), "startTime and endTime must be provided together");

function minutesBetween(start: Date, end: Date) {
  const diff = end.getTime() - start.getTime();
  return diff > 0 ? Math.max(1, Math.ceil(diff / 60000)) : 0;
}

function localDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

function localTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(date);
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`);
}

export const timerSessionsRoute = new Hono()
  .post("/start", async (c) => {
    const body = startTimerSchema.parse(await c.req.json());
    const [running] = await db
      .select()
      .from(timerSessions)
      .where(and(eq(timerSessions.userId, getCurrentUserId(c)), eq(timerSessions.taskId, body.taskId), eq(timerSessions.status, TimerStatus.RUNNING), isNull(timerSessions.deletedAt)));

    if (running) {
      throw new BusinessError(ErrorCode.CONFLICT, "timer is already running for this task", 409);
    }

    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, body.taskId), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
    if (!task) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    }

    const now = new Date();
    const [result] = await db.insert(timerSessions).values({
      userId: getCurrentUserId(c),
      taskId: task.id,
      categoryId: task.categoryId,
      startTime: now,
      durationMinutes: 0,
      status: TimerStatus.RUNNING,
      createdAt: now,
      updatedAt: now
    });

    log.info({ userId: getCurrentUserId(c), taskId: task.id, timerSessionId: result.insertId }, "[timer_started]");
    return ok(c, { id: result.insertId });
  })
  .put("/:id/pause", async (c) => stopTimer(c, TimerStatus.PAUSED, "[timer_paused]"))
  .put("/:id/finish", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return stopTimer(c, TimerStatus.FINISHED, "[timer_finished]", finishTimerSchema.parse(body));
  });

async function stopTimer(c: Context, status: typeof TimerStatus.PAUSED | typeof TimerStatus.FINISHED, event: string, finishOptions: z.infer<typeof finishTimerSchema> = {}) {
  const id = z.coerce.number().int().positive().parse(c.req.param("id"));
  const [session] = await db
    .select()
    .from(timerSessions)
    .where(and(eq(timerSessions.id, id), eq(timerSessions.userId, getCurrentUserId(c)), eq(timerSessions.status, TimerStatus.RUNNING), isNull(timerSessions.deletedAt)));

  if (!session) {
    throw new BusinessError(ErrorCode.NOT_FOUND, "running timer session not found", 404);
  }

  const now = new Date();
  const scheduleDate = finishOptions.scheduleDate ?? localDate(session.startTime);
  const timerStart = finishOptions.startTime ? localDateTime(scheduleDate, finishOptions.startTime) : session.startTime;
  const timerEnd = finishOptions.endTime ? localDateTime(scheduleDate, finishOptions.endTime) : now;
  const durationMinutes = minutesBetween(timerStart, timerEnd);
  if (finishOptions.startTime && durationMinutes <= 0) {
    throw new BusinessError(ErrorCode.PARAM_ERROR, "end time must be later than start time", 400);
  }

  await db.update(timerSessions).set({ startTime: timerStart, endTime: timerEnd, durationMinutes, status, updatedAt: now }).where(eq(timerSessions.id, id));
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, session.taskId), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
  const rewards = [];
  if (task) {
    await db.insert(schedules).values({
      userId: getCurrentUserId(c),
      taskId: task.id,
      categoryId: task.categoryId,
      scheduleDate,
      startTime: finishOptions.startTime ? `${finishOptions.startTime}:00` : localTime(timerStart),
      endTime: finishOptions.endTime ? `${finishOptions.endTime}:00` : localTime(timerEnd),
      title: task.title,
      completed: 1,
      kind: ScheduleKind.ACTUAL,
      source: ScheduleSource.TIMER,
      createdAt: now,
      updatedAt: now
    });
    const timerReward =
      status === TimerStatus.FINISHED
        ? await grantTimerReward(getCurrentUserId(c), id, scheduleDate, durationMinutes)
        : await grantTaskPartialReward(getCurrentUserId(c), id, scheduleDate, durationMinutes, task);
    if (timerReward) rewards.push(timerReward);

    const currentTaskStatus = task.status as TaskStatusValue;
    if (status === TimerStatus.FINISHED && currentTaskStatus !== TaskStatus.DONE && canTransitTaskStatus(currentTaskStatus, TaskStatus.DONE)) {
      await db
        .update(tasks)
        .set({
          status: TaskStatus.DONE,
          completedAt: now,
          updatedAt: now
        })
        .where(and(eq(tasks.id, task.id), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)));
      const taskReward = await grantTaskDoneReward(getCurrentUserId(c), task);
      if (taskReward) rewards.push(taskReward);
    }
  }
  log.info({ userId: getCurrentUserId(c), timerSessionId: id, durationMinutes }, event);
  return ok(c, { id, status, durationMinutes, rewards });
}

