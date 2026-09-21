import { and, asc, eq, isNull } from "drizzle-orm";
import { type DatabaseClient } from "./db/index.js";
import { schedules, taskDailyAssignments, tasks, timerSegments, timerSessions, userExecutionSlots, users } from "./db/schema.js";
import { ActualTimeClass, AssignmentStatus, AttributionStatus, ScheduleKind, ScheduleLifecycle, ScheduleSource, TaskStatus, TimerSegmentStatus, TimerSessionModel, TimerStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { lockExecutionSlot, requireEmptySlot, requireSlotSession } from "./execution-slot.js";
import { runMutation } from "./mutation-receipt.js";
import { grantTimerRewardInClient } from "./rewards.js";
import { acceptLockedTaskForDateInClient } from "./task-assignments.js";
import { completeLockedTaskInClient, lockTaskInClient } from "./task-completion.js";
import { businessDateAt, formatUtcDateTime, localTimeAt, parseUtcDateTime, splitByBusinessDay } from "./time.js";

type OperationCommand = { userId: number; operationId: string; now?: Date };
type SessionCommand = OperationCommand & { sessionId: number; expectedVersion: number };

function operationTime(command: OperationCommand) {
  return command.now ?? new Date();
}

async function createProjection(client: DatabaseClient, session: typeof timerSessions.$inferSelect, segment: typeof timerSegments.$inferSelect, task: typeof tasks.$inferSelect) {
  if (!segment.endedAt) throw new BusinessError(ErrorCode.CONFLICT, "closed segment has no end", 409);
  const start = parseUtcDateTime(segment.startedAt);
  const end = parseUtcDateTime(segment.endedAt);
  const ids: number[] = [];
  for (const slice of splitByBusinessDay(start, end, segment.recordTimezone)) {
    const now = new Date();
    const [result] = await client.insert(schedules).values({
      userId: session.userId,
      taskId: task.id,
      categoryId: segment.categoryIdAtOccurrence,
      scheduleDate: slice.businessDate,
      recordTimezone: segment.recordTimezone,
      startTime: localTimeAt(slice.start, segment.recordTimezone),
      endTime: localTimeAt(slice.end, segment.recordTimezone),
      actualStartedAt: formatUtcDateTime(slice.start),
      actualEndedAt: formatUtcDateTime(slice.end),
      title: segment.taskTitleSnapshot,
      completed: 1,
      lifecycleState: ScheduleLifecycle.EXECUTED,
      kind: ScheduleKind.ACTUAL,
      source: ScheduleSource.TIMER,
      sourceId: `segment:${segment.id}:${slice.businessDate}`,
      actualTimeClass: ActualTimeClass.TIMER_PROJECTION,
      includeInActualTime: 0,
      timerSessionId: session.id,
      timerSegmentId: segment.id,
      sliceDate: slice.businessDate,
      projectIdAtOccurrence: segment.projectIdAtOccurrence,
      projectAttributionStatus: segment.projectAttributionStatus,
      categoryIdAtOccurrence: segment.categoryIdAtOccurrence,
      categoryAttributionStatus: segment.categoryAttributionStatus,
      createdAt: now,
      updatedAt: now
    }).onDuplicateKeyUpdate({ set: {
      startTime: localTimeAt(slice.start, segment.recordTimezone),
      endTime: localTimeAt(slice.end, segment.recordTimezone),
      actualStartedAt: formatUtcDateTime(slice.start),
      actualEndedAt: formatUtcDateTime(slice.end),
      lifecycleState: ScheduleLifecycle.EXECUTED,
      deletedAt: null,
      updatedAt: now
    } });
    if (result.insertId) ids.push(result.insertId);
  }
  return ids;
}

async function lockSessionAfterTask(client: DatabaseClient, userId: number, sessionId: number) {
  const [session] = await client
    .select()
    .from(timerSessions)
    .where(and(eq(timerSessions.id, sessionId), eq(timerSessions.userId, userId), isNull(timerSessions.deletedAt)))
    .for("update");
  if (!session) throw new BusinessError(ErrorCode.NOT_FOUND, "timer session not found", 404);
  if (session.sessionModel !== TimerSessionModel.VNEXT) throw new BusinessError(ErrorCode.CONFLICT, "legacy session is frozen", 409);
  return session;
}

async function lockedExecutionContext(client: DatabaseClient, command: SessionCommand) {
  const slot = await lockExecutionSlot(client, command.userId);
  requireSlotSession(slot, command.sessionId);
  const [identity] = await client
    .select({ taskId: timerSessions.taskId })
    .from(timerSessions)
    .where(and(eq(timerSessions.id, command.sessionId), eq(timerSessions.userId, command.userId), isNull(timerSessions.deletedAt)));
  if (!identity) throw new BusinessError(ErrorCode.NOT_FOUND, "timer session not found", 404);
  const task = await lockTaskInClient(client, command.userId, identity.taskId);
  const session = await lockSessionAfterTask(client, command.userId, command.sessionId);
  if (session.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "session version conflict", 409);
  return { slot, task, session };
}

async function closeOpenSegment(client: DatabaseClient, session: typeof timerSessions.$inferSelect, task: typeof tasks.$inferSelect, endedAt: Date) {
  const [segment] = await client
    .select()
    .from(timerSegments)
    .where(and(eq(timerSegments.timerSessionId, session.id), eq(timerSegments.status, TimerSegmentStatus.OPEN), isNull(timerSegments.deletedAt)))
    .for("update");
  if (!segment) throw new BusinessError(ErrorCode.CONFLICT, "running session has no open segment", 409);
  if (endedAt < parseUtcDateTime(segment.startedAt)) throw new BusinessError(ErrorCode.PARAM_ERROR, "segment end precedes start");
  const endedAtText = formatUtcDateTime(endedAt);
  await client.update(timerSegments).set({ status: TimerSegmentStatus.CLOSED, endedAt: endedAtText, version: segment.version + 1, updatedAt: endedAt }).where(eq(timerSegments.id, segment.id));
  const closed = { ...segment, status: TimerSegmentStatus.CLOSED, endedAt: endedAtText, version: segment.version + 1 };
  const projectionIds = parseUtcDateTime(endedAtText) > parseUtcDateTime(segment.startedAt)
    ? await createProjection(client, session, closed, task)
    : [];
  return { segment: closed, projectionIds };
}

async function sessionDurationSeconds(client: DatabaseClient, sessionId: number) {
  const rows = await client
    .select({ startedAt: timerSegments.startedAt, endedAt: timerSegments.endedAt })
    .from(timerSegments)
    .where(and(eq(timerSegments.timerSessionId, sessionId), eq(timerSegments.status, TimerSegmentStatus.CLOSED), isNull(timerSegments.deletedAt)));
  return rows.reduce((total, row) => total + (row.endedAt ? Math.max(0, (parseUtcDateTime(row.endedAt).getTime() - parseUtcDateTime(row.startedAt).getTime()) / 1000) : 0), 0);
}

async function start(command: OperationCommand & { taskId: number; expectedTaskVersion: number; taskDate?: string; recordTimezone?: string }, accept: boolean) {
  const now = operationTime(command);
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: accept ? "ACCEPT_AND_START_TASK" : "START_TASK_SESSION",
    request: { taskId: command.taskId, expectedTaskVersion: command.expectedTaskVersion, taskDate: command.taskDate ?? null, recordTimezone: command.recordTimezone ?? null, now: command.now?.toISOString() ?? null }
  }, async (tx) => {
    const slot = await lockExecutionSlot(tx, command.userId);
    requireEmptySlot(slot);
    const task = await lockTaskInClient(tx, command.userId, command.taskId);
    if (task.version !== command.expectedTaskVersion) throw new BusinessError(ErrorCode.CONFLICT, "task version conflict", 409);
    if (task.status === TaskStatus.DONE || task.status === TaskStatus.ARCHIVED) throw new BusinessError(ErrorCode.CONFLICT, "task cannot be started", 409);
    const [user] = await tx.select({ timezone: users.timezone }).from(users).where(eq(users.id, command.userId));
    if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
    const recordTimezone = user.timezone;
    const assignmentTimezone = command.recordTimezone ?? user.timezone;
    const taskDate = command.taskDate ?? businessDateAt(now, recordTimezone);
    const nextTaskVersion = task.status === TaskStatus.TODO ? task.version + 1 : task.version;
    if (task.status === TaskStatus.TODO) {
      await tx.update(tasks).set({ status: TaskStatus.IN_PROGRESS, version: nextTaskVersion, updatedAt: now }).where(eq(tasks.id, task.id));
    }
    const [sessionResult] = await tx.insert(timerSessions).values({
      userId: command.userId,
      taskId: task.id,
      sessionModel: TimerSessionModel.VNEXT,
      recordTimezone,
      categoryId: task.categoryId,
      startTime: now,
      durationMinutes: 0,
      status: TimerStatus.RUNNING,
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    const [segmentResult] = await tx.insert(timerSegments).values({
      userId: command.userId,
      timerSessionId: sessionResult.insertId,
      taskId: task.id,
      status: TimerSegmentStatus.OPEN,
      startedAt: formatUtcDateTime(now),
      businessDate: businessDateAt(now, recordTimezone),
      recordTimezone,
      projectAttributionStatus: AttributionStatus.NONE,
      categoryIdAtOccurrence: task.categoryId,
      categoryAttributionStatus: task.categoryId ? AttributionStatus.ATTRIBUTED : AttributionStatus.NONE,
      taskTitleSnapshot: task.title,
      version: 1,
      createdAt: now,
      updatedAt: now
    });

    let assignment;
    if (accept) {
      assignment = await acceptLockedTaskForDateInClient(tx, { userId: command.userId, taskId: task.id, taskDate, recordTimezone: assignmentTimezone });
    } else {
      [assignment] = await tx
        .select()
        .from(taskDailyAssignments)
        .where(and(eq(taskDailyAssignments.userId, command.userId), eq(taskDailyAssignments.taskId, task.id), eq(taskDailyAssignments.taskDate, taskDate)))
        .for("update");
      if (!assignment || assignment.assignmentStatus !== AssignmentStatus.ACCEPTED) throw new BusinessError(ErrorCode.CONFLICT, "task is not accepted for this date", 409);
    }
    await tx.update(userExecutionSlots).set({ activeSessionId: sessionResult.insertId, version: slot.version + 1, updatedAt: now }).where(eq(userExecutionSlots.userId, command.userId));
    return { id: sessionResult.insertId, sessionId: sessionResult.insertId, segmentId: segmentResult.insertId, assignmentId: assignment!.id, status: TimerStatus.RUNNING, version: 1, taskVersion: nextTaskVersion, recordTimezone };
  });
}

export function startTaskSession(command: OperationCommand & { taskId: number; expectedTaskVersion: number; taskDate?: string }) {
  return start(command, false);
}

export function acceptAndStartTask(command: OperationCommand & { taskId: number; expectedTaskVersion: number; taskDate: string; recordTimezone?: string }) {
  return start(command, true);
}

export function pauseWorkSession(command: SessionCommand) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "PAUSE_SESSION",
    request: { sessionId: command.sessionId, expectedVersion: command.expectedVersion, now: command.now?.toISOString() ?? null }
  }, async (tx) => {
    const now = operationTime(command);
    const { session, task } = await lockedExecutionContext(tx, command);
    if (session.status !== TimerStatus.RUNNING) throw new BusinessError(ErrorCode.CONFLICT, "session is not running", 409);
    const closed = await closeOpenSegment(tx, session, task, now);
    const durationSeconds = await sessionDurationSeconds(tx, session.id);
    await tx.update(timerSessions).set({ status: TimerStatus.PAUSED, durationMinutes: Math.floor(durationSeconds / 60), version: session.version + 1, updatedAt: now }).where(eq(timerSessions.id, session.id));
    return { id: session.id, status: TimerStatus.PAUSED, version: session.version + 1, durationSeconds, closedSegmentId: closed.segment.id, projectionIds: closed.projectionIds, rewards: [] };
  });
}

export function resumeWorkSession(command: SessionCommand) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "RESUME_SESSION",
    request: { sessionId: command.sessionId, expectedVersion: command.expectedVersion, now: command.now?.toISOString() ?? null }
  }, async (tx) => {
    const now = operationTime(command);
    const { session, task } = await lockedExecutionContext(tx, command);
    if (session.status !== TimerStatus.PAUSED) throw new BusinessError(ErrorCode.CONFLICT, "session is not paused", 409);
    const [segmentResult] = await tx.insert(timerSegments).values({
      userId: command.userId,
      timerSessionId: session.id,
      taskId: task.id,
      status: TimerSegmentStatus.OPEN,
      startedAt: formatUtcDateTime(now),
      businessDate: businessDateAt(now, session.recordTimezone),
      recordTimezone: session.recordTimezone,
      projectAttributionStatus: AttributionStatus.NONE,
      categoryIdAtOccurrence: task.categoryId,
      categoryAttributionStatus: task.categoryId ? AttributionStatus.ATTRIBUTED : AttributionStatus.NONE,
      taskTitleSnapshot: task.title,
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    await tx.update(timerSessions).set({ status: TimerStatus.RUNNING, version: session.version + 1, updatedAt: now }).where(eq(timerSessions.id, session.id));
    return { id: session.id, status: TimerStatus.RUNNING, version: session.version + 1, segmentId: segmentResult.insertId };
  });
}

export function finishWorkSession(command: SessionCommand & { completeTask?: boolean; expectedTaskVersion?: number; completionNote?: string; progressPercent?: number; note?: string }) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: command.completeTask ? "COMPLETE_TASK_AND_FINISH_SESSION" : "FINISH_SESSION",
    request: { sessionId: command.sessionId, expectedVersion: command.expectedVersion, completeTask: command.completeTask ?? false, expectedTaskVersion: command.expectedTaskVersion ?? null, completionNote: command.completionNote?.trim() || null, progressPercent: command.progressPercent ?? null, note: command.note?.trim() || null, now: command.now?.toISOString() ?? null }
  }, async (tx) => {
    const now = operationTime(command);
    const { slot, session, task } = await lockedExecutionContext(tx, command);
    if (session.status !== TimerStatus.RUNNING && session.status !== TimerStatus.PAUSED) throw new BusinessError(ErrorCode.CONFLICT, "session is not active", 409);
    if ((command.completeTask || command.progressPercent !== undefined) && command.expectedTaskVersion !== task.version) throw new BusinessError(ErrorCode.CONFLICT, "task version conflict", 409);
    if (command.completeTask && task.status === TaskStatus.DONE) throw new BusinessError(ErrorCode.CONFLICT, "task is already complete", 409);
    if (session.status === TimerStatus.RUNNING) await closeOpenSegment(tx, session, task, now);
    const durationSeconds = await sessionDurationSeconds(tx, session.id);
    await tx.update(timerSessions).set({
      endTime: now,
      durationMinutes: Math.floor(durationSeconds / 60),
      status: TimerStatus.FINISHED,
      completionRequested: command.completeTask ? 1 : 0,
      taskCompleted: command.completeTask ? 1 : 0,
      note: command.note?.trim() || null,
      version: session.version + 1,
      updatedAt: now
    }).where(eq(timerSessions.id, session.id));
    await tx.update(userExecutionSlots).set({ activeSessionId: null, version: slot.version + 1, updatedAt: now }).where(eq(userExecutionSlots.userId, command.userId));

    const rewards = [];
    let completionEventId: number | null = null;
    if (command.completeTask) {
      const completion = await completeLockedTaskInClient(tx, {
        userId: command.userId,
        operationId: command.operationId,
        completedAt: now,
        recordTimezone: session.recordTimezone,
        completionNote: command.completionNote
      }, task);
      completionEventId = completion.completionEventId;
      if (completion.reward) rewards.push(completion.reward);
    } else if (command.progressPercent !== undefined) {
      await tx.update(tasks).set({ progressPercent: command.progressPercent, version: task.version + 1, updatedAt: now }).where(eq(tasks.id, task.id));
    }
    const timerReward = await grantTimerRewardInClient(tx, command.userId, session.id, businessDateAt(now, session.recordTimezone), Math.floor(durationSeconds / 60));
    if (timerReward) rewards.push(timerReward);
    const projectionRows = await tx
      .select({ id: schedules.id })
      .from(schedules)
      .where(and(eq(schedules.userId, command.userId), eq(schedules.timerSessionId, session.id), eq(schedules.actualTimeClass, ActualTimeClass.TIMER_PROJECTION), isNull(schedules.deletedAt)))
      .orderBy(asc(schedules.id));
    const projectionIds = projectionRows.map((row) => row.id);
    return { id: session.id, status: TimerStatus.FINISHED, version: session.version + 1, durationSeconds, projectionIds, taskCompleted: Boolean(command.completeTask), taskVersion: command.completeTask || command.progressPercent !== undefined ? task.version + 1 : task.version, completionEventId, rewards };
  });
}

export function cancelWorkSession(command: SessionCommand) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "CANCEL_SESSION",
    request: { sessionId: command.sessionId, expectedVersion: command.expectedVersion, now: command.now?.toISOString() ?? null }
  }, async (tx) => {
    const now = operationTime(command);
    const { slot, session } = await lockedExecutionContext(tx, command);
    if (session.status !== TimerStatus.RUNNING && session.status !== TimerStatus.PAUSED) throw new BusinessError(ErrorCode.CONFLICT, "session is not active", 409);
    const segments = await tx.select().from(timerSegments).where(and(eq(timerSegments.timerSessionId, session.id), isNull(timerSegments.deletedAt))).orderBy(asc(timerSegments.id)).for("update");
    for (const segment of segments) {
      await tx.update(timerSegments).set({
        status: TimerSegmentStatus.VOIDED,
        endedAt: segment.endedAt ?? formatUtcDateTime(now),
        version: segment.version + 1,
        updatedAt: now
      }).where(eq(timerSegments.id, segment.id));
    }
    await tx.update(schedules).set({ deletedAt: now, updatedAt: now }).where(and(eq(schedules.userId, command.userId), eq(schedules.timerSessionId, session.id), eq(schedules.actualTimeClass, ActualTimeClass.TIMER_PROJECTION), isNull(schedules.deletedAt)));
    await tx.update(timerSessions).set({ endTime: now, durationMinutes: 0, status: TimerStatus.CANCELLED, version: session.version + 1, updatedAt: now }).where(eq(timerSessions.id, session.id));
    await tx.update(userExecutionSlots).set({ activeSessionId: null, version: slot.version + 1, updatedAt: now }).where(eq(userExecutionSlots.userId, command.userId));
    return { id: session.id, status: TimerStatus.CANCELLED, version: session.version + 1, rewards: [] };
  });
}
