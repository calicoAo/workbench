import { and, asc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { schedules, taskDailyAssignments, tasks } from "./db/schema.js";
import { AssignmentStatus, ContinuationState, ScheduleKind, ScheduleSource, TaskStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { runMutation } from "./mutation-receipt.js";

type AssignmentCommand = { userId: number; operationId: string };

export async function acceptTaskForDateInClient(client: DatabaseClient, input: {
  userId: number;
  taskId: number;
  taskDate: string;
  recordTimezone: string;
}) {
  const [task] = await client
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, input.userId), isNull(tasks.deletedAt)))
    .for("update");
  if (!task || task.status === TaskStatus.DONE || task.status === TaskStatus.ARCHIVED) {
    throw new BusinessError(ErrorCode.CONFLICT, "task cannot be accepted", 409);
  }
  return acceptLockedTaskForDateInClient(client, input);
}

export async function acceptLockedTaskForDateInClient(client: DatabaseClient, input: {
  userId: number;
  taskId: number;
  taskDate: string;
  recordTimezone: string;
}) {
  const [existing] = await client
    .select()
    .from(taskDailyAssignments)
    .where(and(
      eq(taskDailyAssignments.userId, input.userId),
      eq(taskDailyAssignments.taskId, input.taskId),
      eq(taskDailyAssignments.taskDate, input.taskDate)
    ))
    .for("update");
  if (existing) {
    if (existing.assignmentStatus === AssignmentStatus.RELEASED) {
      await client
        .update(taskDailyAssignments)
        .set({ assignmentStatus: AssignmentStatus.ACCEPTED, version: existing.version + 1, updatedAt: new Date() })
        .where(eq(taskDailyAssignments.id, existing.id));
      return { ...existing, assignmentStatus: AssignmentStatus.ACCEPTED, version: existing.version + 1 };
    }
    return existing;
  }

  const [position] = await client
    .select({ value: max(taskDailyAssignments.sortOrder) })
    .from(taskDailyAssignments)
    .where(and(eq(taskDailyAssignments.userId, input.userId), eq(taskDailyAssignments.taskDate, input.taskDate)));
  const now = new Date();
  const [result] = await client.insert(taskDailyAssignments).values({
    userId: input.userId,
    taskId: input.taskId,
    taskDate: input.taskDate,
    assignmentStatus: AssignmentStatus.ACCEPTED,
    recordTimezone: input.recordTimezone,
    sortOrder: (position?.value ?? 0) + 1,
    continuationState: ContinuationState.PENDING,
    version: 1,
    createdAt: now,
    updatedAt: now
  });
  const [created] = await client.select().from(taskDailyAssignments).where(eq(taskDailyAssignments.id, result.insertId));
  return created;
}

export function acceptTaskForDate(command: AssignmentCommand & { taskId: number; taskDate: string; recordTimezone: string }) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "ACCEPT_TASK_FOR_DATE",
    request: { taskId: command.taskId, taskDate: command.taskDate, recordTimezone: command.recordTimezone }
  }, async (tx) => {
    const assignment = await acceptTaskForDateInClient(tx, command);
    return { id: assignment!.id, taskId: command.taskId, taskDate: command.taskDate, version: assignment!.version };
  });
}

export function releaseAssignment(command: AssignmentCommand & { assignmentId: number; expectedVersion: number }) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "RELEASE_ASSIGNMENT",
    request: { assignmentId: command.assignmentId, expectedVersion: command.expectedVersion }
  }, async (tx) => {
    const [identity] = await tx
      .select({ taskId: taskDailyAssignments.taskId })
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.id, command.assignmentId), eq(taskDailyAssignments.userId, command.userId)));
    if (!identity) throw new BusinessError(ErrorCode.NOT_FOUND, "assignment not found", 404);
    const [task] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, identity.taskId), eq(tasks.userId, command.userId)))
      .for("update");
    if (!task) throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    const [assignment] = await tx
      .select()
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.id, command.assignmentId), eq(taskDailyAssignments.userId, command.userId)))
      .for("update");
    if (!assignment) throw new BusinessError(ErrorCode.NOT_FOUND, "assignment not found", 404);
    if (assignment.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "assignment version conflict", 409);
    if (assignment.assignmentStatus === AssignmentStatus.RELEASED) return { id: assignment.id, version: assignment.version };
    await tx.update(taskDailyAssignments).set({ assignmentStatus: AssignmentStatus.RELEASED, version: assignment.version + 1, updatedAt: new Date() }).where(eq(taskDailyAssignments.id, assignment.id));
    return { id: assignment.id, version: assignment.version + 1 };
  });
}

export type ResolveContinuationCommand = AssignmentCommand & {
  sources: Array<{ id: number; expectedVersion: number }>;
  resolution: typeof ContinuationState.CARRIED_FORWARD | typeof ContinuationState.DEFERRED | typeof ContinuationState.DISMISSED | typeof ContinuationState.RESCHEDULED;
  targetDate?: string;
  targetTimezone?: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
};

export function resolveContinuation(command: ResolveContinuationCommand) {
  const sources = [...command.sources].sort((left, right) => left.id - right.id);
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "RESOLVE_CONTINUATION",
    request: { ...command, userId: undefined, operationId: undefined, sources }
  }, async (tx) => {
    if (!sources.length) throw new BusinessError(ErrorCode.PARAM_ERROR, "at least one source assignment is required");
    const sourceIdentities = await tx
      .select({ id: taskDailyAssignments.id, taskId: taskDailyAssignments.taskId })
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, command.userId), inArray(taskDailyAssignments.id, sources.map((source) => source.id))))
      .orderBy(asc(taskDailyAssignments.id));
    if (sourceIdentities.length !== sources.length) throw new BusinessError(ErrorCode.NOT_FOUND, "one or more source assignments were not found", 404);
    const taskIds = [...new Set(sourceIdentities.map((row) => row.taskId))];
    if (taskIds.length !== 1) throw new BusinessError(ErrorCode.PARAM_ERROR, "continuation sources must belong to one task");
    const [task] = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskIds[0]), eq(tasks.userId, command.userId), isNull(tasks.deletedAt)))
      .for("update");
    if (!task || task.status === TaskStatus.DONE || task.status === TaskStatus.ARCHIVED) throw new BusinessError(ErrorCode.CONFLICT, "task is not continuable", 409);

    const sourceRows = await tx
      .select()
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, command.userId), inArray(taskDailyAssignments.id, sources.map((source) => source.id))))
      .orderBy(asc(taskDailyAssignments.id))
      .for("update");
    for (const [index, row] of sourceRows.entries()) {
      if (row.version !== sources[index].expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "continuation version conflict", 409);
      if (![ContinuationState.PENDING, ContinuationState.DEFERRED].includes(row.continuationState as 1 | 3)) {
        throw new BusinessError(ErrorCode.CONFLICT, "continuation is already resolved", 409);
      }
    }
    const needsTarget = command.resolution === ContinuationState.CARRIED_FORWARD || command.resolution === ContinuationState.DEFERRED || command.resolution === ContinuationState.RESCHEDULED;
    if (needsTarget && (!command.targetDate || !command.targetTimezone)) throw new BusinessError(ErrorCode.PARAM_ERROR, "targetDate and targetTimezone are required");

    let targetAssignmentId: number | null = null;
    let targetScheduleId: number | null = null;
    if (command.resolution === ContinuationState.CARRIED_FORWARD || command.resolution === ContinuationState.RESCHEDULED) {
      const target = await acceptLockedTaskForDateInClient(tx, {
        userId: command.userId,
        taskId: task.id,
        taskDate: command.targetDate!,
        recordTimezone: command.targetTimezone!
      });
      targetAssignmentId = target!.id;
    }
    if (command.resolution === ContinuationState.RESCHEDULED) {
      if (!command.startTime || !command.endTime || command.endTime <= command.startTime) {
        throw new BusinessError(ErrorCode.PARAM_ERROR, "a valid planned interval is required");
      }
      const now = new Date();
      const [scheduleResult] = await tx.insert(schedules).values({
        userId: command.userId,
        taskId: task.id,
        categoryId: task.categoryId,
        scheduleDate: command.targetDate!,
        recordTimezone: command.targetTimezone!,
        startTime: `${command.startTime}:00`,
        endTime: `${command.endTime}:00`,
        title: task.title,
        completed: 0,
        kind: ScheduleKind.PLANNED,
        source: ScheduleSource.PLANNED_TASK,
        sourceId: `continuation:${command.operationId}`,
        createdAt: now,
        updatedAt: now
      });
      targetScheduleId = scheduleResult.insertId;
    }

    const handledAt = new Date();
    for (const row of sourceRows) {
      await tx.update(taskDailyAssignments).set({
        continuationState: command.resolution,
        continuationHandledAt: handledAt,
        continuationTargetDate: command.targetDate ?? null,
        continuationTargetTimezone: command.targetTimezone ?? null,
        continuationTargetAssignmentId: targetAssignmentId,
        continuationTargetScheduleId: targetScheduleId,
        continuationReason: command.reason?.trim() || null,
        version: row.version + 1,
        updatedAt: handledAt
      }).where(eq(taskDailyAssignments.id, row.id));
    }
    return { id: sourceRows[0].id, sourceAssignmentIds: sourceRows.map((row) => row.id), resolution: command.resolution, targetAssignmentId, targetScheduleId };
  });
}

export function carryOverAssignment(command: Omit<ResolveContinuationCommand, "resolution">) {
  return resolveContinuation({ ...command, resolution: ContinuationState.CARRIED_FORWARD });
}

export async function closePendingContinuationsInClient(client: DatabaseClient, userId: number, taskId: number, reason: string, now = new Date()) {
  await client
    .update(taskDailyAssignments)
    .set({
      continuationState: ContinuationState.DISMISSED,
      continuationHandledAt: now,
      continuationReason: reason,
      version: sql`${taskDailyAssignments.version} + 1`,
      updatedAt: now
    })
    .where(and(
      eq(taskDailyAssignments.userId, userId),
      eq(taskDailyAssignments.taskId, taskId),
      or(eq(taskDailyAssignments.continuationState, ContinuationState.PENDING), eq(taskDailyAssignments.continuationState, ContinuationState.DEFERRED))
    ));
}

export function replaceAssignmentsForDate(command: { userId: number; taskDate: string; taskIds: number[]; focusTaskIds?: number[]; recordTimezone: string }) {
  const taskIds = [...new Set(command.taskIds)];
  const focusTaskIds = command.focusTaskIds === undefined ? null : [...new Set(command.focusTaskIds)].filter((taskId) => taskIds.includes(taskId)).slice(0, 3);
  return db.transaction(async (tx) => {
    const existingIdentities = await tx
      .select({ taskId: taskDailyAssignments.taskId })
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, command.userId), eq(taskDailyAssignments.taskDate, command.taskDate)));
    const allTaskIds = [...new Set([...taskIds, ...existingIdentities.map((row) => row.taskId)])].sort((left, right) => left - right);
    const lockedTasks = allTaskIds.length
      ? await tx
          .select({ id: tasks.id, status: tasks.status, deletedAt: tasks.deletedAt })
          .from(tasks)
          .where(and(eq(tasks.userId, command.userId), inArray(tasks.id, allTaskIds)))
          .orderBy(asc(tasks.id))
          .for("update")
      : [];
    const selectedTasks = new Map(lockedTasks.map((task) => [task.id, task]));
    if (taskIds.some((taskId) => {
      const task = selectedTasks.get(taskId);
      return !task || task.deletedAt !== null || task.status === TaskStatus.DONE || task.status === TaskStatus.ARCHIVED;
    })) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "one or more tasks not found", 404);
    }

    const existing = await tx
      .select()
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, command.userId), eq(taskDailyAssignments.taskDate, command.taskDate)))
      .orderBy(asc(taskDailyAssignments.id))
      .for("update");
    const byTaskId = new Map(existing.map((assignment) => [assignment.taskId, assignment]));
    const now = new Date();
    if (focusTaskIds && existing.some((assignment) => assignment.focusRank !== null)) {
      await tx.update(taskDailyAssignments).set({ focusRank: null }).where(and(eq(taskDailyAssignments.userId, command.userId), eq(taskDailyAssignments.taskDate, command.taskDate)));
    }

    for (const assignment of existing) {
      const selectedIndex = taskIds.indexOf(assignment.taskId);
      const nextStatus = selectedIndex >= 0 ? AssignmentStatus.ACCEPTED : AssignmentStatus.RELEASED;
      const nextSortOrder = selectedIndex >= 0 ? selectedIndex + 1 : assignment.sortOrder;
      const focusIndex = focusTaskIds?.indexOf(assignment.taskId) ?? -1;
      const nextFocusRank = focusTaskIds === null ? assignment.focusRank : selectedIndex >= 0 && focusIndex >= 0 ? focusIndex + 1 : null;
      const focusRewritten = focusTaskIds !== null && (assignment.focusRank !== null || nextFocusRank !== null);
      if (!focusRewritten && assignment.assignmentStatus === nextStatus && assignment.sortOrder === nextSortOrder && assignment.focusRank === nextFocusRank) continue;
      await tx.update(taskDailyAssignments).set({
        assignmentStatus: nextStatus,
        sortOrder: nextSortOrder,
        focusRank: nextFocusRank,
        version: assignment.version + 1,
        updatedAt: now
      }).where(eq(taskDailyAssignments.id, assignment.id));
    }

    for (const [index, taskId] of taskIds.entries()) {
      if (byTaskId.has(taskId)) continue;
      await tx.insert(taskDailyAssignments).values({
        userId: command.userId,
        taskId,
        taskDate: command.taskDate,
        assignmentStatus: AssignmentStatus.ACCEPTED,
        recordTimezone: command.recordTimezone,
        sortOrder: index + 1,
        focusRank: focusTaskIds && focusTaskIds.indexOf(taskId) >= 0 ? focusTaskIds.indexOf(taskId) + 1 : null,
        continuationState: ContinuationState.PENDING,
        version: 1,
        createdAt: now,
        updatedAt: now
      });
    }
    return { taskDate: command.taskDate, taskIds, focusTaskIds: focusTaskIds ?? existing.filter((assignment) => assignment.focusRank !== null && taskIds.includes(assignment.taskId)).sort((left, right) => left.focusRank! - right.focusRank!).map((assignment) => assignment.taskId) };
  });
}
