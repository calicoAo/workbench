import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db/index.js";
import { schedules, timerSegments, timerSessions, userExecutionSlots } from "./db/schema.js";
import { ActualTimeClass, TimerSegmentStatus, TimerSessionModel, TimerStatus } from "./enums.js";
import { businessDayBoundsUtc, parseUtcDateTime } from "./time.js";

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

function clippedEntry(entry: Omit<ActualTimeEntry, "durationSeconds">, queryDate: string, queryTimezone: string): ActualTimeEntry | null {
  const bounds = businessDayBoundsUtc(queryDate, queryTimezone);
  const startedAt = new Date(Math.max(entry.startedAt.getTime(), bounds.start.getTime()));
  const endedAt = new Date(Math.min(entry.endedAt.getTime(), bounds.end.getTime()));
  if (endedAt <= startedAt) return null;
  return { ...entry, startedAt, endedAt, durationSeconds: (endedAt.getTime() - startedAt.getTime()) / 1000 };
}

export async function actualTimeForUser(userId: number, businessDate: string, queryTimezone: string) {
  const segmentRows = await db
    .select()
    .from(timerSegments)
    .where(and(eq(timerSegments.userId, userId), eq(timerSegments.status, TimerSegmentStatus.CLOSED), isNull(timerSegments.deletedAt)));
  const scheduleRows = await db
    .select()
    .from(schedules)
    .where(and(
      eq(schedules.userId, userId),
      inArray(schedules.actualTimeClass, [ActualTimeClass.MANUAL_ACTUAL, ActualTimeClass.LEGACY_ACTUAL]),
      eq(schedules.includeInActualTime, 1),
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
      }, businessDate, queryTimezone);
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
      }, businessDate, queryTimezone);
      return entry ? [entry] : [];
    })
  ].sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
}
