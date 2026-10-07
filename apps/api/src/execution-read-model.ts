import { and, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { schedules, taskDailyAssignments, tasks, timerSegments, timerSessions, userExecutionSlots } from "./db/schema.js";
import { ActualTimeClass, AssignmentStatus, ScheduleKind, ScheduleLifecycle, TimerSegmentStatus, TimerSessionModel, TimerStatus } from "./enums.js";
import { businessDayBoundsUtc, formatUtcDateTime, parseUtcDateTime, splitByBusinessDay } from "./time.js";

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
  title: string;
  note: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  recordTimezone: string;
  businessDate: string;
  timerSessionId: number | null;
  sessionNote: string | null;
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  sessionDurationSeconds: number | null;
  isTerminalSlice: boolean;
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

export function splitActualTimeEntry(entry: Omit<ActualTimeEntry, "durationSeconds">): ActualTimeEntry[] {
  return splitByBusinessDay(entry.startedAt, entry.endedAt, entry.recordTimezone).map((slice) => ({
    ...entry,
    startedAt: slice.start,
    endedAt: slice.end,
    durationSeconds: (slice.end.getTime() - slice.start.getTime()) / 1000,
    businessDate: slice.businessDate,
    isTerminalSlice: Boolean(entry.sessionEndedAt && slice.end.getTime() === entry.sessionEndedAt.getTime())
  }));
}

export async function actualTimeForRange(userId: number, fromDate: string, toDate: string, queryTimezone: string, client: DatabaseClient = db) {
  const start = businessDayBoundsUtc(fromDate, queryTimezone).start;
  const end = businessDayBoundsUtc(toDate, queryTimezone).end;
  const segmentRows = await client
    .select({ segment: timerSegments, session: timerSessions })
    .from(timerSegments)
    .innerJoin(timerSessions, eq(timerSegments.timerSessionId, timerSessions.id))
    .where(and(
      eq(timerSegments.userId, userId),
      eq(timerSessions.userId, userId),
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
      if (!row.segment.endedAt) return [];
      const entry = splitActualTimeEntry({
        source: "TIMER_SEGMENT",
        sourceId: row.segment.id,
        taskId: row.segment.taskId,
        title: row.segment.taskTitleSnapshot,
        note: row.session.note,
        startedAt: parseUtcDateTime(row.segment.startedAt),
        endedAt: parseUtcDateTime(row.segment.endedAt),
        recordTimezone: row.segment.recordTimezone,
        businessDate: row.segment.businessDate,
        timerSessionId: row.session.id,
        sessionNote: row.session.note,
        sessionStartedAt: row.session.startTime instanceof Date ? row.session.startTime : parseUtcDateTime(row.session.startTime),
        sessionEndedAt: row.session.endTime ? (row.session.endTime instanceof Date ? row.session.endTime : parseUtcDateTime(row.session.endTime)) : null,
        sessionDurationSeconds: row.session.durationMinutes * 60,
        isTerminalSlice: false,
        projectIdAtOccurrence: row.segment.projectIdAtOccurrence,
        projectAttributionStatus: row.segment.projectAttributionStatus,
        categoryIdAtOccurrence: row.segment.categoryIdAtOccurrence,
        categoryAttributionStatus: row.segment.categoryAttributionStatus
      }).flatMap((slice) => {
        const entry = clippedEntry(slice, start, end);
        return entry ? [entry] : [];
      });
      return entry;
    }),
    ...scheduleRows.flatMap((row) => {
      if (!row.actualStartedAt || !row.actualEndedAt) return [];
      const entry = splitActualTimeEntry({
        source: row.actualTimeClass === ActualTimeClass.MANUAL_ACTUAL ? "MANUAL_ACTUAL" : "LEGACY_ACTUAL",
        sourceId: row.id,
        taskId: row.taskId,
        title: row.title,
        note: row.note,
        startedAt: parseUtcDateTime(row.actualStartedAt),
        endedAt: parseUtcDateTime(row.actualEndedAt),
        recordTimezone: row.recordTimezone,
        businessDate: row.scheduleDate,
        timerSessionId: null,
        sessionNote: null,
        sessionStartedAt: null,
        sessionEndedAt: null,
        sessionDurationSeconds: null,
        isTerminalSlice: false,
        projectIdAtOccurrence: row.projectIdAtOccurrence,
        projectAttributionStatus: row.projectAttributionStatus,
        categoryIdAtOccurrence: row.categoryIdAtOccurrence,
        categoryAttributionStatus: row.categoryAttributionStatus
      }).flatMap((slice) => {
        const entry = clippedEntry(slice, start, end);
        return entry ? [entry] : [];
      });
      return entry;
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
