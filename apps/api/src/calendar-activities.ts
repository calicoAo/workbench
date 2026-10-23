import { and, between, eq, isNull } from "drizzle-orm";
import { db } from "./db/index.js";
import { schedules, taskCategories } from "./db/schema.js";
import { ScheduleKind } from "./enums.js";
import { actualTimeForRange } from "./execution-read-model.js";
import { localTimeAt, parseUtcDateTime } from "./time.js";
import { completionEventsForRange } from "./task-completion.js";

// Read composition only: Execution and Tasks retain their canonical facts.
export async function calendarActivities(userId: number, from: string, to: string, timezone: string) {
  const [actual, completions, planned, categories] = await Promise.all([
    actualTimeForRange(userId, from, to, timezone),
    completionEventsForRange(userId, from, to),
    db.select().from(schedules).where(and(eq(schedules.userId, userId), between(schedules.scheduleDate, from, to), eq(schedules.kind, ScheduleKind.PLANNED), isNull(schedules.deletedAt))),
    db.select({ id: taskCategories.id, color: taskCategories.color }).from(taskCategories).where(eq(taskCategories.userId, userId))
  ]);
  const color = (id: number | null) => categories.find((item) => item.id === id)?.color ?? "#35C99A";
  const executed = new Set(actual.filter((item) => item.taskId !== null).map((item) => `${item.businessDate}:${item.taskId}`));
  const sortTime = (item: { startedAt: Date | null; startTime?: string }) => item.startedAt ? localTimeAt(item.startedAt, timezone) : item.startTime ?? "";
  return [
    ...actual.map((item) => ({ id: `${item.source}:${item.sourceId}:${item.businessDate}`, kind: "ACTUAL" as const, businessDate: item.businessDate, title: item.title, taskId: item.taskId, startedAt: item.startedAt, endedAt: item.endedAt, durationSeconds: item.durationSeconds, completed: completions.some((event) => event.taskId === item.taskId && event.businessDate === item.businessDate), color: color(item.categoryIdAtOccurrence) })),
    ...completions.filter((item) => !executed.has(`${item.businessDate}:${item.taskId}`)).map((item) => ({ id: `COMPLETION:${item.id}`, kind: "COMPLETION" as const, businessDate: item.businessDate, title: item.title, taskId: item.taskId, startedAt: parseUtcDateTime(item.occurredAt), endedAt: parseUtcDateTime(item.occurredAt), durationSeconds: 0, completed: true, color: color(item.categoryIdAtOccurrence) })),
    ...planned.filter((item) => item.lifecycleState === 0).map((item) => ({ id: `PLANNED:${item.id}`, kind: "PLANNED" as const, businessDate: item.scheduleDate, title: item.title, taskId: item.taskId, startTime: item.startTime, endTime: item.endTime, startedAt: null, endedAt: null, durationSeconds: 0, completed: false, color: color(item.categoryId) }))
  ].sort((a, b) => a.businessDate.localeCompare(b.businessDate) || sortTime(a).localeCompare(sortTime(b)) || a.id.localeCompare(b.id));
}
