import { and, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { schedules, taskDailyAssignments, tasks, timerSegments, timerSessions, userExecutionSlots } from "./db/schema.js";
import { ActualTimeClass, AssignmentStatus, ScheduleKind, ScheduleLifecycle, TimerSegmentStatus, TimerSessionModel, TimerStatus } from "./enums.js";
import { businessDayBoundsUtc, formatUtcDateTime, parseUtcDateTime } from "./time.js";

export async function currentSessionForUser(userId: number) {
  const [session] = await db
    .select({ session: timerSessions })
    .from(userExecutionSlots)
    .innerJoin(timerSessions, eq(userExecutionSlots.activeSessionId, timerSessions.id))
    .where(and(
      eq(userExecutionSlots.userId, userId),
      eq(timerSessions.userId, userId),
      eq(timerSessions.sessionModel, TimerSessionModel.VNEXT),
      inArray(timerSessions.status, [TimerStatus.RUNNING, TimerStatus.PAUSED]),
      isNull(timerSessions.deletedAt)
    ));
  if (!session) return null;

  const segments = await db
    .select()
    .from(timerSegments)
    .where(and(eq(timerSegments.userId, userId), eq(timerSegments.timerSessionId, session.session.id), isNull(timerSegments.deletedAt)));
  return { ...session.session, segments };
}

export type ActualTimeEntry = {
  source: "TIMER_SEGMENT" | "MANUAL_ACTUAL" | "LEGACY_ACTUAL";
  sourceId: number;
  taskId: number | null;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  recordTimezone: string;
  businessDate: string;
  projectIdAtOccurrence: number | null;
  projectAttributionStatus: number;
  categoryIdAtOccurrence: number | null;
  categoryAttributionStatus: number;
};

function clippedEntry(entry: Omit<ActualTimeEntry, "durationSeconds">, start: Date, end: Date): ActualTimeEntry | null {
  const startedAt = new Date(Math.max(entry.startedAt.getTime(), start.getTime()));
  const endedAt = new Date(Math.min(entry.endedAt.getTime(), end.getTime()));
  if (endedAt <= startedAt) return null;
  return { ...entry, startedAt, endedAt, durationSeconds: (endedAt.getTime() - startedAt.getTime()) / 1000 };
}

export async function actualTimeForRange(userId: number, fromDate: string, toDate: string, queryTimezone: string, client: DatabaseClient = db) {
  const start = businessDayBoundsUtc(fromDate, queryTimezone).start;
  const end = businessDayBoundsUtc(toDate, queryTimezone).end;
  const segmentRows = await client
    .select()
    .from(timerSegments)
    .where(and(
      eq(timerSegments.userId, userId),
      eq(timerSegments.status, TimerSegmentStatus.CLOSED),
      lt(timerSegments.startedAt, formatUtcDateTime(end)),
      gt(timerSegments.endedAt, formatUtcDateTime(start)),
      isNull(timerSegments.deletedAt)
    ));
  const scheduleRows = await client
    .select()
    .from(schedules)
    .where(and(
      eq(schedules.userId, userId),
      inArray(schedules.actualTimeClass, [ActualTimeClass.MANUAL_ACTUAL, ActualTimeClass.LEGACY_ACTUAL]),
      eq(schedules.includeInActualTime, 1),
      lt(schedules.actualStartedAt, formatUtcDateTime(end)),
      gt(schedules.actualEndedAt, formatUtcDateTime(start)),
      isNull(schedules.deletedAt)
    ));

  return [
    ...segmentRows.flatMap((row) => {
      if (!row.endedAt) return [];
      const entry = clippedEntry({
        source: "TIMER_SEGMENT",
        sourceId: row.id,
        taskId: row.taskId,
        startedAt: parseUtcDateTime(row.startedAt),
        endedAt: parseUtcDateTime(row.endedAt),
        recordTimezone: row.recordTimezone,
        businessDate: row.businessDate,
        projectIdAtOccurrence: row.projectIdAtOccurrence,
        projectAttributionStatus: row.projectAttributionStatus,
        categoryIdAtOccurrence: row.categoryIdAtOccurrence,
        categoryAttributionStatus: row.categoryAttributionStatus
      }, start, end);
      return entry ? [entry] : [];
    }),
    ...scheduleRows.flatMap((row) => {
      if (!row.actualStartedAt || !row.actualEndedAt) return [];
      const entry = clippedEntry({
        source: row.actualTimeClass === ActualTimeClass.MANUAL_ACTUAL ? "MANUAL_ACTUAL" : "LEGACY_ACTUAL",
        sourceId: row.id,
        taskId: row.taskId,
        startedAt: parseUtcDateTime(row.actualStartedAt),
        endedAt: parseUtcDateTime(row.actualEndedAt),
        recordTimezone: row.recordTimezone,
        businessDate: row.scheduleDate,
        projectIdAtOccurrence: row.projectIdAtOccurrence,
        projectAttributionStatus: row.projectAttributionStatus,
        categoryIdAtOccurrence: row.categoryIdAtOccurrence,
        categoryAttributionStatus: row.categoryAttributionStatus
      }, start, end);
      return entry ? [entry] : [];
    })
  ].sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
}

export function actualTimeForUser(userId: number, businessDate: string, queryTimezone: string) {
  return actualTimeForRange(userId, businessDate, businessDate, queryTimezone);
}

export async function dailyExecutionForUser(userId: number, businessDate: string, queryTimezone: string) {
  const [entries, plannedRows, assignmentRows] = await Promise.all([
    actualTimeForUser(userId, businessDate, queryTimezone),
    db.select({ startTime: schedules.startTime, endTime: schedules.endTime }).from(schedules).where(and(
      eq(schedules.userId, userId),
      eq(schedules.scheduleDate, businessDate),
      eq(schedules.kind, ScheduleKind.PLANNED),
      inArray(schedules.lifecycleState, [ScheduleLifecycle.PENDING, ScheduleLifecycle.EXECUTED]),
      isNull(schedules.deletedAt)
    )),
    db.select({ status: tasks.status }).from(taskDailyAssignments).innerJoin(tasks, eq(taskDailyAssignments.taskId, tasks.id)).where(and(
      eq(taskDailyAssignments.userId, userId),
      eq(taskDailyAssignments.taskDate, businessDate),
      eq(taskDailyAssignments.assignmentStatus, AssignmentStatus.ACCEPTED),
      isNull(tasks.deletedAt)
    ))
  ]);
  return {
    entries,
    summary: {
      completedAssignments: assignmentRows.filter((row) => row.status === 2).length,
      totalAssignments: assignmentRows.length,
      focusedSeconds: entries.filter((entry) => entry.source === "TIMER_SEGMENT").reduce((sum, entry) => sum + entry.durationSeconds, 0),
      actualSeconds: entries.reduce((sum, entry) => sum + entry.durationSeconds, 0),
      plannedSeconds: plannedRows.reduce((sum, row) => sum + Math.max(0, timeSeconds(row.endTime) - timeSeconds(row.startTime)), 0)
    }
  };
}

function timeSeconds(value: string) {
  const [hours, minutes, seconds = 0] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}
