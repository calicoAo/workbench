import { and, eq, inArray, isNull } from "drizzle-orm";
import { type DatabaseClient } from "./db/index.js";
import { schedules, tasks, timerSegments, users } from "./db/schema.js";
import { ActualTimeClass, AttributionStatus, ScheduleKind, ScheduleSource, TaskStatus, TimerSegmentStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { lockExecutionSlot, requireEmptySlot } from "./execution-slot.js";
import { runMutation } from "./mutation-receipt.js";
import { grantRewardInClient } from "./rewards.js";
import { completeLockedTaskInClient, lockTaskInClient } from "./task-completion.js";
import { businessDateAt, formatUtcDateTime, localTimeAt, parseUtcDateTime } from "./time.js";

type ManualActualValues = {
  taskId?: number;
  title?: string;
  note?: string;
  startedAt: Date;
  endedAt: Date;
  recordTimezone: string;
  includeInActualTime: boolean;
};

async function overlapsActualTime(client: DatabaseClient, userId: number, start: Date, end: Date, exceptScheduleId?: number) {
  const [segments, scheduleRows] = await Promise.all([
    client.select({ startedAt: timerSegments.startedAt, endedAt: timerSegments.endedAt }).from(timerSegments).where(and(
      eq(timerSegments.userId, userId),
      inArray(timerSegments.status, [TimerSegmentStatus.OPEN, TimerSegmentStatus.CLOSED]),
      isNull(timerSegments.deletedAt)
    )),
    client.select({ id: schedules.id, startedAt: schedules.actualStartedAt, endedAt: schedules.actualEndedAt }).from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.includeInActualTime, 1), isNull(schedules.deletedAt)))
  ]);
  return segments.some((row) => parseUtcDateTime(row.startedAt) < end && (!row.endedAt || parseUtcDateTime(row.endedAt) > start)) ||
    scheduleRows.some((row) => row.id !== exceptScheduleId && row.startedAt && row.endedAt && parseUtcDateTime(row.startedAt) < end && parseUtcDateTime(row.endedAt) > start);
}

async function validateManualInterval(client: DatabaseClient, userId: number, values: ManualActualValues, exceptScheduleId?: number) {
  if (values.endedAt <= values.startedAt) throw new BusinessError(ErrorCode.PARAM_ERROR, "actual end must be after start");
  if (values.includeInActualTime && await overlapsActualTime(client, userId, values.startedAt, values.endedAt, exceptScheduleId)) {
    throw new BusinessError(ErrorCode.CONFLICT, "actual time overlaps an existing included interval", 409);
  }
}

export function recordManualActual(command: {
  userId: number;
  operationId: string;
  expectedTaskVersion?: number;
  completeTask?: boolean;
  completionNote?: string;
} & ManualActualValues) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: command.completeTask ? "RECORD_MANUAL_ACTUAL_AND_COMPLETE" : "RECORD_MANUAL_ACTUAL",
    request: {
      taskId: command.taskId ?? null,
      title: command.title?.trim() || null,
      note: command.note?.trim() || null,
      startedAt: command.startedAt.toISOString(),
      endedAt: command.endedAt.toISOString(),
      recordTimezone: command.recordTimezone,
      includeInActualTime: command.includeInActualTime,
      completeTask: command.completeTask ?? false,
      expectedTaskVersion: command.expectedTaskVersion ?? null,
      completionNote: command.completionNote?.trim() || null
    }
  }, async (tx) => {
    const slot = await lockExecutionSlot(tx, command.userId);
    if (command.completeTask) requireEmptySlot(slot);
    let task: typeof tasks.$inferSelect | undefined;
    if (command.taskId) {
      task = await lockTaskInClient(tx, command.userId, command.taskId);
      if (command.expectedTaskVersion !== undefined && task.version !== command.expectedTaskVersion) throw new BusinessError(ErrorCode.CONFLICT, "task version conflict", 409);
    }
    if (!task && !command.title?.trim()) throw new BusinessError(ErrorCode.PARAM_ERROR, "title is required without a task");
    if (command.completeTask && task?.status === TaskStatus.DONE) throw new BusinessError(ErrorCode.CONFLICT, "task is already complete", 409);
    await validateManualInterval(tx, command.userId, command);
    const now = new Date();
    const [result] = await tx.insert(schedules).values({
      userId: command.userId,
      taskId: task?.id,
      categoryId: task?.categoryId,
      scheduleDate: businessDateAt(command.startedAt, command.recordTimezone),
      recordTimezone: command.recordTimezone,
      startTime: localTimeAt(command.startedAt, command.recordTimezone),
      endTime: localTimeAt(command.endedAt, command.recordTimezone),
      actualStartedAt: formatUtcDateTime(command.startedAt),
      actualEndedAt: formatUtcDateTime(command.endedAt),
      title: command.title?.trim() || task!.title,
      note: command.note?.trim() || null,
      completed: 1,
      kind: ScheduleKind.ACTUAL,
      source: ScheduleSource.MANUAL,
      sourceId: `manual:${command.operationId}`,
      actualTimeClass: ActualTimeClass.MANUAL_ACTUAL,
      includeInActualTime: command.includeInActualTime ? 1 : 0,
      projectAttributionStatus: AttributionStatus.NONE,
      categoryIdAtOccurrence: task?.categoryId,
      categoryAttributionStatus: task?.categoryId ? AttributionStatus.ATTRIBUTED : AttributionStatus.NONE,
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    const rewards = [];
    let completionEventId: number | null = null;
    if (command.completeTask) {
      if (!task || command.expectedTaskVersion === undefined) throw new BusinessError(ErrorCode.PARAM_ERROR, "task and expectedTaskVersion are required for completion");
      const completion = await completeLockedTaskInClient(tx, {
        userId: command.userId,
        operationId: command.operationId,
        completedAt: command.endedAt,
        recordTimezone: command.recordTimezone,
        completionNote: command.completionNote
      }, task);
      completionEventId = completion.completionEventId;
      if (completion.reward) rewards.push(completion.reward);
    }
    const minutes = Math.floor((command.endedAt.getTime() - command.startedAt.getTime()) / 60000);
    if (command.includeInActualTime && minutes >= 30) {
      const reward = await grantRewardInClient(tx, {
        userId: command.userId,
        eventKey: `schedule_actual:${command.userId}:${result.insertId}`,
        sourceType: "schedule",
        sourceId: String(result.insertId),
        eventDate: businessDateAt(command.startedAt, command.recordTimezone),
        xp: Math.min(10, Math.floor(minutes / 60) * 2),
        coins: 0,
        reason: "补充小时记录"
      });
      if (reward) rewards.push(reward);
    }
    return { id: result.insertId, version: 1, taskCompleted: Boolean(command.completeTask), completionEventId, rewards };
  });
}

export function correctManualActual(command: {
  userId: number;
  operationId: string;
  scheduleId: number;
  expectedVersion: number;
} & ManualActualValues) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "CORRECT_MANUAL_ACTUAL",
    request: { scheduleId: command.scheduleId, expectedVersion: command.expectedVersion, startedAt: command.startedAt.toISOString(), endedAt: command.endedAt.toISOString(), recordTimezone: command.recordTimezone, includeInActualTime: command.includeInActualTime, title: command.title?.trim() || null, note: command.note?.trim() || null }
  }, async (tx) => {
    await lockExecutionSlot(tx, command.userId);
    const [identity] = await tx.select({ taskId: schedules.taskId }).from(schedules).where(and(eq(schedules.id, command.scheduleId), eq(schedules.userId, command.userId), isNull(schedules.deletedAt)));
    if (!identity) throw new BusinessError(ErrorCode.NOT_FOUND, "manual actual not found", 404);
    const task = identity.taskId ? await lockTaskInClient(tx, command.userId, identity.taskId) : undefined;
    const [schedule] = await tx.select().from(schedules).where(and(eq(schedules.id, command.scheduleId), eq(schedules.userId, command.userId), isNull(schedules.deletedAt))).for("update");
    if (!schedule || schedule.actualTimeClass !== ActualTimeClass.MANUAL_ACTUAL || schedule.source !== ScheduleSource.MANUAL) throw new BusinessError(ErrorCode.CONFLICT, "only Manual Actual can be corrected", 409);
    if (schedule.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "schedule version conflict", 409);
    await validateManualInterval(tx, command.userId, command, schedule.id);
    await tx.update(schedules).set({
      scheduleDate: businessDateAt(command.startedAt, command.recordTimezone),
      recordTimezone: command.recordTimezone,
      startTime: localTimeAt(command.startedAt, command.recordTimezone),
      endTime: localTimeAt(command.endedAt, command.recordTimezone),
      actualStartedAt: formatUtcDateTime(command.startedAt),
      actualEndedAt: formatUtcDateTime(command.endedAt),
      title: command.title?.trim() || task?.title || schedule.title,
      note: command.note?.trim() || null,
      includeInActualTime: command.includeInActualTime ? 1 : 0,
      categoryId: task?.categoryId ?? schedule.categoryId,
      categoryIdAtOccurrence: task?.categoryId ?? schedule.categoryIdAtOccurrence,
      categoryAttributionStatus: task?.categoryId ? AttributionStatus.ATTRIBUTED : schedule.categoryAttributionStatus,
      version: schedule.version + 1,
      updatedAt: new Date()
    }).where(eq(schedules.id, schedule.id));
    return { id: schedule.id, version: schedule.version + 1 };
  });
}

export function cancelManualActual(command: { userId: number; operationId: string; scheduleId: number; expectedVersion: number }) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "CANCEL_MANUAL_ACTUAL",
    request: { scheduleId: command.scheduleId, expectedVersion: command.expectedVersion }
  }, async (tx) => {
    await lockExecutionSlot(tx, command.userId);
    const [identity] = await tx.select({ taskId: schedules.taskId }).from(schedules).where(and(eq(schedules.id, command.scheduleId), eq(schedules.userId, command.userId), isNull(schedules.deletedAt)));
    if (!identity) throw new BusinessError(ErrorCode.NOT_FOUND, "manual actual not found", 404);
    if (identity.taskId) await lockTaskInClient(tx, command.userId, identity.taskId);
    const [schedule] = await tx.select().from(schedules).where(and(eq(schedules.id, command.scheduleId), eq(schedules.userId, command.userId), isNull(schedules.deletedAt))).for("update");
    if (!schedule || schedule.actualTimeClass !== ActualTimeClass.MANUAL_ACTUAL || schedule.source !== ScheduleSource.MANUAL) throw new BusinessError(ErrorCode.CONFLICT, "only Manual Actual can be cancelled", 409);
    if (schedule.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "schedule version conflict", 409);
    await tx.update(schedules).set({ deletedAt: new Date(), version: schedule.version + 1, updatedAt: new Date() }).where(eq(schedules.id, schedule.id));
    return { id: schedule.id, version: schedule.version + 1, cancelled: true };
  });
}

export async function userTimezone(client: DatabaseClient, userId: number) {
  const [user] = await client.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
  return user.timezone;
}
