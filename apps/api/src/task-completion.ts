import { and, eq, isNull } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { schedules, tasks } from "./db/schema.js";
import { canTransitTaskStatus, ScheduleKind, ScheduleSource, TaskStatus, type TaskStatusValue } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { grantTaskDoneRewardInClient, rewardGrantByEventKeyInClient } from "./rewards.js";

export type CompleteTaskCommand = {
  userId: number;
  taskId: number;
  completionNote?: string;
  completedAt?: Date;
};

export type CompleteTaskWithActualTimeCommand = CompleteTaskCommand & {
  completionKey: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
};

async function lockTask(client: DatabaseClient, userId: number, taskId: number) {
  const [task] = await client
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .for("update");
  if (!task) throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
  return task;
}

async function applyTaskCompletion(client: DatabaseClient, command: CompleteTaskCommand, task: Awaited<ReturnType<typeof lockTask>>) {
  const current = task.status as TaskStatusValue;
  if (current === TaskStatus.DONE) {
    return { id: task.id, status: TaskStatus.DONE, completed: false, reward: null };
  }
  if (!canTransitTaskStatus(current, TaskStatus.DONE)) {
    throw new BusinessError(ErrorCode.PARAM_ERROR, "invalid task status transition");
  }

  const completedAt = command.completedAt ?? new Date();
  await client
    .update(tasks)
    .set({
      status: TaskStatus.DONE,
      completedAt,
      completionNote: command.completionNote?.trim() || task.completionNote,
      updatedAt: completedAt
    })
    .where(and(eq(tasks.id, task.id), eq(tasks.userId, command.userId), isNull(tasks.deletedAt)));

  const reward = await grantTaskDoneRewardInClient(client, command.userId, task);
  return { id: task.id, status: TaskStatus.DONE, completed: true, reward };
}

export async function completeTask(command: CompleteTaskCommand) {
  return db.transaction((tx) => completeTaskInClient(tx, command));
}

export async function completeTaskInClient(client: DatabaseClient, command: CompleteTaskCommand) {
  const task = await lockTask(client, command.userId, command.taskId);
  return applyTaskCompletion(client, command, task);
}

export async function completeTaskWithActualTime(command: CompleteTaskWithActualTimeCommand) {
  return db.transaction(async (tx) => {
    const task = await lockTask(tx, command.userId, command.taskId);
    const sourceId = `task-completion:${command.completionKey}`;
    const [existingSchedule] = await tx
      .select()
      .from(schedules)
      .where(and(eq(schedules.userId, command.userId), eq(schedules.source, ScheduleSource.MANUAL), eq(schedules.sourceId, sourceId)));

    if (existingSchedule) {
      const requestedNote = command.completionNote?.trim() || null;
      const sameCommand =
        existingSchedule.taskId === task.id &&
        existingSchedule.scheduleDate === command.scheduleDate &&
        existingSchedule.startTime.slice(0, 5) === command.startTime &&
        existingSchedule.endTime.slice(0, 5) === command.endTime &&
        existingSchedule.note === requestedNote;
      if (task.status !== TaskStatus.DONE || !sameCommand) {
        throw new BusinessError(ErrorCode.CONFLICT, "completion key is already used", 409);
      }
      const reward = await rewardGrantByEventKeyInClient(tx, `task_done:${command.userId}:${task.id}`);
      return { id: task.id, status: TaskStatus.DONE, scheduleId: existingSchedule.id, reward };
    }
    if (task.status === TaskStatus.DONE) {
      throw new BusinessError(ErrorCode.CONFLICT, "task is already completed", 409);
    }

    const completion = await applyTaskCompletion(tx, command, task);
    const now = command.completedAt ?? new Date();
    const [scheduleResult] = await tx.insert(schedules).values({
      userId: command.userId,
      taskId: task.id,
      categoryId: task.categoryId,
      scheduleDate: command.scheduleDate,
      startTime: `${command.startTime}:00`,
      endTime: `${command.endTime}:00`,
      title: task.title,
      note: command.completionNote?.trim() || undefined,
      completed: 1,
      kind: ScheduleKind.ACTUAL,
      source: ScheduleSource.MANUAL,
      sourceId,
      createdAt: now,
      updatedAt: now
    });

    return { id: task.id, status: TaskStatus.DONE, scheduleId: scheduleResult.insertId, reward: completion.reward };
  });
}
