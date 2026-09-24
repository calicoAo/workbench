import { and, eq, isNull } from "drizzle-orm";
import { type DatabaseClient } from "./db/index.js";
import { taskCompletionEvents, tasks, users } from "./db/schema.js";
import { CompletionEventSource, TaskStatus, canTransitTaskStatus, type TaskStatusValue } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { lockExecutionSlot, requireEmptySlot } from "./execution-slot.js";
import { runMutation } from "./mutation-receipt.js";
import { grantTaskDoneRewardInClient } from "./rewards.js";
import { closePendingContinuationsInClient } from "./task-assignments.js";
import { businessDateAt, formatUtcDateTime } from "./time.js";
import { completeLinkedHabitFromTaskInClient } from "./habits.js";

export type CompleteTaskCommand = {
  userId: number;
  operationId: string;
  taskId: number;
  expectedVersion: number;
  completionNote?: string;
  completedAt?: Date;
};

export async function lockTaskInClient(client: DatabaseClient, userId: number, taskId: number) {
  const [task] = await client
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .for("update");
  if (!task) throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
  return task;
}

export async function completeLockedTaskInClient(client: DatabaseClient, command: {
  userId: number;
  operationId: string;
  completedAt: Date;
  recordTimezone: string;
  completionNote?: string;
}, task: Awaited<ReturnType<typeof lockTaskInClient>>) {
  const current = task.status as TaskStatusValue;
  if (current === TaskStatus.DONE) return { id: task.id, status: TaskStatus.DONE, completed: false, completionEventId: null, reward: null };
  if (!canTransitTaskStatus(current, TaskStatus.DONE)) throw new BusinessError(ErrorCode.CONFLICT, "task cannot be completed", 409);

  const lifecycleVersion = task.completionSequence + 1;
  const now = command.completedAt;
  await client.update(tasks).set({
    status: TaskStatus.DONE,
    progressPercent: 100,
    completedAt: now,
    completionSequence: lifecycleVersion,
    completionNote: command.completionNote?.trim() || task.completionNote,
    version: task.version + 1,
    updatedAt: now
  }).where(eq(tasks.id, task.id));
  const [eventResult] = await client.insert(taskCompletionEvents).values({
    userId: command.userId,
    taskId: task.id,
    categoryIdAtOccurrence: task.categoryId,
    occurredAt: formatUtcDateTime(now),
    recordTimezone: command.recordTimezone,
    businessDate: businessDateAt(now, command.recordTimezone),
    lifecycleVersion,
    operationId: command.operationId,
    source: CompletionEventSource.VNEXT_COMMAND,
    createdAt: new Date()
  });
  await closePendingContinuationsInClient(client, command.userId, task.id, "task_completed", now);
  const reward = await grantTaskDoneRewardInClient(client, command.userId, task);
  const habitOccurrence = await completeLinkedHabitFromTaskInClient(client, { userId: command.userId, taskId: task.id, completedAt: now, recordTimezone: command.recordTimezone });
  return { id: task.id, status: TaskStatus.DONE, completed: true, completionEventId: eventResult.insertId, reward, habitOccurrence };
}

export function completeTask(command: CompleteTaskCommand) {
  const completedAt = command.completedAt ?? new Date();
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "COMPLETE_TASK",
    request: {
      taskId: command.taskId,
      expectedVersion: command.expectedVersion,
      completionNote: command.completionNote?.trim() || null,
      completedAt: command.completedAt?.toISOString() ?? null
    }
  }, async (tx) => {
    const slot = await lockExecutionSlot(tx, command.userId);
    requireEmptySlot(slot);
    const task = await lockTaskInClient(tx, command.userId, command.taskId);
    if (task.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "task version conflict", 409);
    const [user] = await tx.select({ timezone: users.timezone }).from(users).where(eq(users.id, command.userId));
    if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
    return completeLockedTaskInClient(tx, { ...command, completedAt, recordTimezone: user.timezone }, task);
  });
}

export function reopenTask(command: { userId: number; operationId: string; taskId: number; expectedVersion: number; progressPercent?: number }) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "REOPEN_TASK",
    request: { taskId: command.taskId, expectedVersion: command.expectedVersion, progressPercent: command.progressPercent ?? 0 }
  }, async (tx) => {
    const slot = await lockExecutionSlot(tx, command.userId);
    requireEmptySlot(slot);
    const task = await lockTaskInClient(tx, command.userId, command.taskId);
    if (task.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "task version conflict", 409);
    if (task.status !== TaskStatus.DONE) throw new BusinessError(ErrorCode.CONFLICT, "task is not complete", 409);
    await tx.update(tasks).set({ status: TaskStatus.TODO, progressPercent: command.progressPercent ?? 0, completedAt: null, version: task.version + 1, updatedAt: new Date() }).where(eq(tasks.id, task.id));
    return { id: task.id, status: TaskStatus.TODO, version: task.version + 1 };
  });
}

async function finalizeTask(command: { userId: number; operationId: string; taskId: number; expectedVersion: number }, remove: boolean) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: remove ? "REMOVE_TASK" : "ARCHIVE_TASK",
    request: { taskId: command.taskId, expectedVersion: command.expectedVersion }
  }, async (tx) => {
    const slot = await lockExecutionSlot(tx, command.userId);
    requireEmptySlot(slot);
    const task = await lockTaskInClient(tx, command.userId, command.taskId);
    if (task.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "task version conflict", 409);
    const now = new Date();
    await closePendingContinuationsInClient(tx, command.userId, task.id, remove ? "task_removed" : "task_archived", now);
    await tx.update(tasks).set({ status: remove ? task.status : TaskStatus.ARCHIVED, deletedAt: remove ? now : null, version: task.version + 1, updatedAt: now }).where(eq(tasks.id, task.id));
    return { id: task.id, status: remove ? task.status : TaskStatus.ARCHIVED, deleted: remove, version: task.version + 1 };
  });
}

export function archiveTask(command: { userId: number; operationId: string; taskId: number; expectedVersion: number }) {
  return finalizeTask(command, false);
}

export function removeTask(command: { userId: number; operationId: string; taskId: number; expectedVersion: number }) {
  return finalizeTask(command, true);
}

export async function completeTaskInClient(client: DatabaseClient, command: {
  userId: number;
  operationId: string;
  taskId: number;
  completedAt: Date;
  recordTimezone: string;
  completionNote?: string;
}, lockedTask?: Awaited<ReturnType<typeof lockTaskInClient>>) {
  return completeLockedTaskInClient(client, command, lockedTask ?? await lockTaskInClient(client, command.userId, command.taskId));
}
