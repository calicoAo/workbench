import { and, eq, isNull } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { schedules, tasks, timerSessions } from "./db/schema.js";
import { ScheduleKind, ScheduleSource, TimerStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import {
  grantTaskPartialRewardInClient,
  grantTimerRewardInClient,
  rewardGrantByEventKeyInClient
} from "./rewards.js";
import { completeTaskInClient } from "./task-completion.js";

type FinishOptions = {
  scheduleDate?: string;
  startTime?: string;
  endTime?: string;
};

type WorkSessionCommand = FinishOptions & {
  userId: number;
  sessionId: number;
  now?: Date;
};

export type FinishWorkSessionCommand = WorkSessionCommand & {
  completeTask: boolean;
};

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

function timeMatches(actual: string, requested?: string) {
  return !requested || actual.slice(0, 5) === requested;
}

async function lockSession(client: DatabaseClient, userId: number, sessionId: number) {
  const [session] = await client
    .select()
    .from(timerSessions)
    .where(and(eq(timerSessions.id, sessionId), eq(timerSessions.userId, userId), isNull(timerSessions.deletedAt)))
    .for("update");
  if (!session) throw new BusinessError(ErrorCode.NOT_FOUND, "timer session not found", 404);
  return session;
}

async function loadTerminalResult(
  client: DatabaseClient,
  session: Awaited<ReturnType<typeof lockSession>>,
  expectedStatus: typeof TimerStatus.PAUSED | typeof TimerStatus.FINISHED,
  command: WorkSessionCommand & { completeTask: boolean }
) {
  if (session.status !== expectedStatus || Boolean(session.completionRequested) !== command.completeTask) {
    throw new BusinessError(ErrorCode.CONFLICT, "timer session already has a different terminal result", 409);
  }

  const [schedule] = await client
    .select()
    .from(schedules)
    .where(and(eq(schedules.userId, command.userId), eq(schedules.source, ScheduleSource.TIMER), eq(schedules.sourceId, String(session.id))));
  if (!schedule) throw new BusinessError(ErrorCode.CONFLICT, "timer terminal result is incomplete", 409);
  if (
    (command.scheduleDate && schedule.scheduleDate !== command.scheduleDate) ||
    !timeMatches(schedule.startTime, command.startTime) ||
    !timeMatches(schedule.endTime, command.endTime)
  ) {
    throw new BusinessError(ErrorCode.CONFLICT, "timer session already has different recorded time", 409);
  }

  const rewardKeys = [
    expectedStatus === TimerStatus.FINISHED ? `timer:${command.userId}:${session.id}` : `task_partial:${command.userId}:${session.id}`,
    ...(session.taskCompleted ? [`task_done:${command.userId}:${session.taskId}`] : [])
  ];
  const rewards = (await Promise.all(rewardKeys.map((key) => rewardGrantByEventKeyInClient(client, key)))).filter(
    (reward): reward is NonNullable<typeof reward> => reward !== null
  );
  return {
    id: session.id,
    status: expectedStatus,
    durationMinutes: session.durationMinutes,
    scheduleId: schedule.id,
    taskCompleted: Boolean(session.taskCompleted),
    rewards
  };
}

async function finalizeWorkSession(
  client: DatabaseClient,
  command: WorkSessionCommand & { completeTask: boolean },
  status: typeof TimerStatus.PAUSED | typeof TimerStatus.FINISHED
) {
  const session = await lockSession(client, command.userId, command.sessionId);
  if (session.status !== TimerStatus.RUNNING) {
    return loadTerminalResult(client, session, status, command);
  }

  const now = command.now ?? new Date();
  const scheduleDate = command.scheduleDate ?? localDate(session.startTime);
  const timerStart = command.startTime ? localDateTime(scheduleDate, command.startTime) : session.startTime;
  const timerEnd = command.endTime ? localDateTime(scheduleDate, command.endTime) : now;
  const durationMinutes = minutesBetween(timerStart, timerEnd);
  if (command.startTime && durationMinutes <= 0) {
    throw new BusinessError(ErrorCode.PARAM_ERROR, "end time must be later than start time", 400);
  }

  const [task] = await client
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, session.taskId), eq(tasks.userId, command.userId), isNull(tasks.deletedAt)))
    .for("update");
  if (!task) throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);

  await client
    .update(timerSessions)
    .set({
      startTime: timerStart,
      endTime: timerEnd,
      durationMinutes,
      status,
      completionRequested: command.completeTask ? 1 : 0,
      taskCompleted: 0,
      updatedAt: now
    })
    .where(and(eq(timerSessions.id, session.id), eq(timerSessions.userId, command.userId), eq(timerSessions.status, TimerStatus.RUNNING)));

  const [scheduleResult] = await client.insert(schedules).values({
    userId: command.userId,
    taskId: task.id,
    categoryId: task.categoryId,
    scheduleDate,
    startTime: command.startTime ? `${command.startTime}:00` : localTime(timerStart),
    endTime: command.endTime ? `${command.endTime}:00` : localTime(timerEnd),
    title: task.title,
    completed: 1,
    kind: ScheduleKind.ACTUAL,
    source: ScheduleSource.TIMER,
    sourceId: String(session.id),
    createdAt: now,
    updatedAt: now
  });

  const rewards = [];
  const timerReward =
    status === TimerStatus.FINISHED
      ? await grantTimerRewardInClient(client, command.userId, session.id, scheduleDate, durationMinutes)
      : await grantTaskPartialRewardInClient(client, command.userId, session.id, scheduleDate, durationMinutes, task);
  if (timerReward) rewards.push(timerReward);

  let taskCompleted = false;
  if (status === TimerStatus.FINISHED && command.completeTask) {
    const completion = await completeTaskInClient(client, {
      userId: command.userId,
      taskId: task.id,
      completedAt: now
    });
    taskCompleted = completion.completed;
    if (completion.reward) rewards.push(completion.reward);
    await client
      .update(timerSessions)
      .set({ taskCompleted: taskCompleted ? 1 : 0 })
      .where(and(eq(timerSessions.id, session.id), eq(timerSessions.userId, command.userId)));
  }

  return {
    id: session.id,
    status,
    durationMinutes,
    scheduleId: scheduleResult.insertId,
    taskCompleted,
    rewards
  };
}

export async function pauseWorkSession(command: WorkSessionCommand) {
  return db.transaction((tx) => finalizeWorkSession(tx, { ...command, completeTask: false }, TimerStatus.PAUSED));
}

export async function finishWorkSession(command: FinishWorkSessionCommand) {
  return db.transaction((tx) => finalizeWorkSession(tx, command, TimerStatus.FINISHED));
}
