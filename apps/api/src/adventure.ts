import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "./db/index.js";
import {
  dailyAdventureSnapshots,
  growthDimensions,
  habitDefinitions,
  habitOccurrences,
  heroDailyStatuses,
  journals,
  morningWritings,
  periodReviews,
  rewardEvents,
  sleepRecords,
  taskCategories,
  taskCompletionEvents,
  taskDailyAssignments,
  tasks,
  users,
  waterRecords
} from "./db/schema.js";
import { AssignmentStatus, HabitOccurrenceStatus, TaskStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { actualTimeForUser } from "./execution-read-model.js";

type PeriodType = "WEEK" | "MONTH";

function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function buildDailyAdventureFacts(userId: number, businessDate: string) {
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
  const [actual, completions, assignments, habits, sleep, water, morning, journal, rewards, dailyStatus, categories, dimensions] = await Promise.all([
    actualTimeForUser(userId, businessDate, user.timezone),
    db.select({ id: taskCompletionEvents.id, taskId: taskCompletionEvents.taskId, title: tasks.title, categoryId: taskCompletionEvents.categoryIdAtOccurrence, lifecycleVersion: taskCompletionEvents.lifecycleVersion, occurredAt: taskCompletionEvents.occurredAt })
      .from(taskCompletionEvents).innerJoin(tasks, and(eq(tasks.id, taskCompletionEvents.taskId), eq(tasks.userId, taskCompletionEvents.userId)))
      .where(and(eq(taskCompletionEvents.userId, userId), eq(taskCompletionEvents.businessDate, businessDate))).orderBy(asc(taskCompletionEvents.id)),
    db.select({ id: taskDailyAssignments.id, taskId: tasks.id, title: tasks.title, taskStatus: tasks.status, focusRank: taskDailyAssignments.focusRank, assignmentStatus: taskDailyAssignments.assignmentStatus, version: taskDailyAssignments.version })
      .from(taskDailyAssignments).innerJoin(tasks, and(eq(tasks.id, taskDailyAssignments.taskId), eq(tasks.userId, taskDailyAssignments.userId)))
      .where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.taskDate, businessDate))).orderBy(asc(taskDailyAssignments.sortOrder)),
    db.select({ id: habitOccurrences.id, habitId: habitOccurrences.habitId, name: habitDefinitions.name, status: habitOccurrences.status, actualValue: habitOccurrences.actualValue, version: habitOccurrences.version })
      .from(habitOccurrences).innerJoin(habitDefinitions, and(eq(habitDefinitions.id, habitOccurrences.habitId), eq(habitDefinitions.userId, habitOccurrences.userId)))
      .where(and(eq(habitOccurrences.userId, userId), eq(habitOccurrences.occurrenceDate, businessDate))).orderBy(asc(habitOccurrences.id)),
    db.select({ id: sleepRecords.id, durationMinutes: sleepRecords.durationMinutes, qualityScore: sleepRecords.qualityScore, updatedAt: sleepRecords.updatedAt }).from(sleepRecords).where(and(eq(sleepRecords.userId, userId), eq(sleepRecords.sleepDate, businessDate), isNull(sleepRecords.deletedAt))),
    db.select({ id: waterRecords.id, cups: waterRecords.cups, targetCups: waterRecords.targetCups, updatedAt: waterRecords.updatedAt }).from(waterRecords).where(and(eq(waterRecords.userId, userId), eq(waterRecords.waterDate, businessDate), isNull(waterRecords.deletedAt))),
    db.select({ id: morningWritings.id, updatedAt: morningWritings.updatedAt }).from(morningWritings).where(and(eq(morningWritings.userId, userId), eq(morningWritings.writingDate, businessDate), isNull(morningWritings.deletedAt))),
    db.select({ id: journals.id, updatedAt: journals.updatedAt }).from(journals).where(and(eq(journals.userId, userId), eq(journals.journalDate, businessDate), isNull(journals.deletedAt))),
    db.select({ id: rewardEvents.id, sourceType: rewardEvents.sourceType, sourceId: rewardEvents.sourceId, xpDelta: rewardEvents.xpDelta, coinDelta: rewardEvents.coinDelta, reason: rewardEvents.reason }).from(rewardEvents).where(and(eq(rewardEvents.userId, userId), eq(rewardEvents.eventDate, businessDate))).orderBy(asc(rewardEvents.id)),
    db.select().from(heroDailyStatuses).where(and(eq(heroDailyStatuses.userId, userId), eq(heroDailyStatuses.businessDate, businessDate))),
    db.select({ id: taskCategories.id, dimensionKey: taskCategories.dimensionKey }).from(taskCategories).where(and(eq(taskCategories.userId, userId), isNull(taskCategories.deletedAt))),
    db.select({ dimensionKey: growthDimensions.dimensionKey, name: growthDimensions.name, color: growthDimensions.color, enabled: growthDimensions.enabled }).from(growthDimensions).where(eq(growthDimensions.userId, userId))
  ]);
  const categoryMap = new Map(categories.map((item) => [item.id, item.dimensionKey]));
  const dimensionMap = new Map(dimensions.filter((item) => item.enabled).map((item) => [item.dimensionKey, item]));
  const investment = new Map<string, number>();
  let unmappedSeconds = 0;
  for (const entry of actual) {
    const key = entry.categoryIdAtOccurrence ? categoryMap.get(entry.categoryIdAtOccurrence) : null;
    if (key && dimensionMap.has(key)) investment.set(key, (investment.get(key) ?? 0) + entry.durationSeconds);
    else unmappedSeconds += entry.durationSeconds;
  }
  const payload = {
    businessDate,
    periodTimezone: user.timezone,
    tasks: {
      completed: completions.map((item) => ({ id: item.taskId, title: item.title, categoryId: item.categoryId, lifecycleVersion: item.lifecycleVersion })),
      assignments: assignments.filter((item) => item.assignmentStatus === AssignmentStatus.ACCEPTED).map((item) => ({ id: item.taskId, title: item.title, completed: item.taskStatus === TaskStatus.DONE, focusRank: item.focusRank, version: item.version }))
    },
    actualTime: {
      totalMinutes: Math.floor(actual.reduce((sum, item) => sum + item.durationSeconds, 0) / 60),
      sourceCount: actual.length,
      investment: [...investment.entries()].map(([dimensionKey, seconds]) => ({ dimensionKey, name: dimensionMap.get(dimensionKey)?.name ?? dimensionKey, color: dimensionMap.get(dimensionKey)?.color ?? "#64748B", minutes: Math.floor(seconds / 60) })),
      unmappedMinutes: Math.floor(unmappedSeconds / 60)
    },
    habits: { completed: habits.filter((item) => item.status === HabitOccurrenceStatus.COMPLETED).length, items: habits },
    life: { sleep: sleep[0] ?? null, water: water[0] ?? null, dailyStatus: dailyStatus[0] ?? null },
    writing: { morningWritingSaved: Boolean(morning[0]), journalSaved: Boolean(journal[0]) },
    rewards: { xpDelta: rewards.reduce((sum, item) => sum + item.xpDelta, 0), coinDelta: rewards.reduce((sum, item) => sum + item.coinDelta, 0), events: rewards }
  };
  return { timezone: user.timezone, payload, sourceFingerprint: fingerprint(payload) };
}

export async function adventureSnapshot(userId: number, businessDate: string) {
  const source = await buildDailyAdventureFacts(userId, businessDate);
  const [stored] = await db.select().from(dailyAdventureSnapshots).where(and(eq(dailyAdventureSnapshots.userId, userId), eq(dailyAdventureSnapshots.businessDate, businessDate)));
  if (!stored) return { snapshot: null, stale: false, sourceFingerprint: source.sourceFingerprint };
  const stale = stored.sourceFingerprint !== source.sourceFingerprint;
  if (stale && stored.status !== "STALE") await db.update(dailyAdventureSnapshots).set({ status: "STALE", updatedAt: new Date() }).where(eq(dailyAdventureSnapshots.id, stored.id));
  return { snapshot: { ...stored, status: stale ? "STALE" : stored.status }, stale, sourceFingerprint: source.sourceFingerprint };
}

export async function regenerateAdventureSnapshot(userId: number, businessDate: string) {
  const source = await buildDailyAdventureFacts(userId, businessDate);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(dailyAdventureSnapshots).where(and(eq(dailyAdventureSnapshots.userId, userId), eq(dailyAdventureSnapshots.businessDate, businessDate))).for("update");
    if (current?.sourceFingerprint === source.sourceFingerprint && current.status === "CURRENT") return current;
    const now = new Date();
    if (!current) {
      const [result] = await tx.insert(dailyAdventureSnapshots).values({ userId, businessDate, periodTimezone: source.timezone, sourceFingerprint: source.sourceFingerprint, status: "CURRENT", snapshotPayload: source.payload, version: 1, generatedAt: now, updatedAt: now });
      return { id: result.insertId, userId, businessDate, periodTimezone: source.timezone, sourceFingerprint: source.sourceFingerprint, status: "CURRENT", snapshotPayload: source.payload, version: 1, generatedAt: now, updatedAt: now };
    }
    await tx.update(dailyAdventureSnapshots).set({ periodTimezone: source.timezone, sourceFingerprint: source.sourceFingerprint, status: "CURRENT", snapshotPayload: source.payload, version: current.version + 1, generatedAt: now, updatedAt: now }).where(eq(dailyAdventureSnapshots.id, current.id));
    return { ...current, periodTimezone: source.timezone, sourceFingerprint: source.sourceFingerprint, status: "CURRENT", snapshotPayload: source.payload, version: current.version + 1, generatedAt: now, updatedAt: now };
  });
}

export async function listAdventureSnapshots(userId: number, from?: string, to?: string) {
  const conditions = [eq(dailyAdventureSnapshots.userId, userId)];
  if (from) conditions.push(gte(dailyAdventureSnapshots.businessDate, from));
  if (to) conditions.push(lte(dailyAdventureSnapshots.businessDate, to));
  return db.select().from(dailyAdventureSnapshots).where(and(...conditions)).orderBy(desc(dailyAdventureSnapshots.businessDate)).limit(120);
}

export function periodRange(type: PeriodType, anchor: string) {
  const [year, month, day] = anchor.split("-").map(Number);
  if (type === "MONTH") {
    const end = new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
    return { start: `${year}-${String(month).padStart(2, "0")}-01`, end };
  }
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  const start = value.toISOString().slice(0, 10);
  value.setUTCDate(value.getUTCDate() + 6);
  return { start, end: value.toISOString().slice(0, 10) };
}

function datesInRange(start: string, end: string) {
  const dates: string[] = [];
  const current = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (current <= last) { dates.push(current.toISOString().slice(0, 10)); current.setUTCDate(current.getUTCDate() + 1); }
  return dates;
}

async function buildPeriodFacts(userId: number, type: PeriodType, anchor: string) {
  const range = periodRange(type, anchor);
  const sources = await Promise.all(datesInRange(range.start, range.end).map((date) => buildDailyAdventureFacts(userId, date)));
  const days = sources.map((item) => item.payload);
  const dimensionMinutes = new Map<string, { name: string; color: string; minutes: number }>();
  for (const day of days) for (const item of day.actualTime.investment) {
    const current = dimensionMinutes.get(item.dimensionKey) ?? { name: item.name, color: item.color, minutes: 0 };
    current.minutes += item.minutes;
    dimensionMinutes.set(item.dimensionKey, current);
  }
  const facts = {
    periodType: type,
    periodStart: range.start,
    periodEnd: range.end,
    periodTimezone: sources[0]?.timezone ?? "Asia/Shanghai",
    summary: {
      actualMinutes: days.reduce((sum, item) => sum + item.actualTime.totalMinutes, 0),
      completedTasks: days.reduce((sum, item) => sum + item.tasks.completed.length, 0),
      completedHabits: days.reduce((sum, item) => sum + item.habits.completed, 0),
      sleepDays: days.filter((item) => item.life.sleep).length,
      waterCups: days.reduce((sum, item) => sum + (item.life.water?.cups ?? 0), 0),
      xpDelta: days.reduce((sum, item) => sum + item.rewards.xpDelta, 0)
    },
    growthDistribution: [...dimensionMinutes.entries()].map(([dimensionKey, item]) => ({ dimensionKey, ...item })),
    highlights: days.filter((item) => item.tasks.completed.length || item.actualTime.totalMinutes || item.habits.completed).map((item) => ({ businessDate: item.businessDate, completedTasks: item.tasks.completed.map((task) => task.title), actualMinutes: item.actualTime.totalMinutes, completedHabits: item.habits.completed }))
  };
  return { range, facts, sourceFingerprint: fingerprint(sources.map((item) => item.sourceFingerprint)) };
}

export async function periodReview(userId: number, type: PeriodType, anchor: string) {
  const source = await buildPeriodFacts(userId, type, anchor);
  const [stored] = await db.select().from(periodReviews).where(and(eq(periodReviews.userId, userId), eq(periodReviews.periodType, type), eq(periodReviews.periodStart, source.range.start)));
  if (!stored) return { review: null, stale: false, facts: source.facts, sourceFingerprint: source.sourceFingerprint };
  const stale = stored.sourceFingerprint !== source.sourceFingerprint;
  if (stale && stored.status !== "STALE") await db.update(periodReviews).set({ status: "STALE", updatedAt: new Date() }).where(eq(periodReviews.id, stored.id));
  return { review: { ...stored, status: stale ? "STALE" : stored.status }, stale, facts: source.facts, sourceFingerprint: source.sourceFingerprint };
}

export async function regeneratePeriodReview(userId: number, type: PeriodType, anchor: string) {
  const source = await buildPeriodFacts(userId, type, anchor);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(periodReviews).where(and(eq(periodReviews.userId, userId), eq(periodReviews.periodType, type), eq(periodReviews.periodStart, source.range.start))).for("update");
    if (current?.sourceFingerprint === source.sourceFingerprint && current.status === "CURRENT") return current;
    const now = new Date();
    if (!current) {
      const [result] = await tx.insert(periodReviews).values({ userId, periodType: type, periodStart: source.range.start, periodEnd: source.range.end, periodTimezone: source.facts.periodTimezone, sourceFingerprint: source.sourceFingerprint, status: "CURRENT", factsPayload: source.facts, userReviewBody: null, version: 1, generatedAt: now, updatedAt: now });
      return { id: result.insertId, userId, periodType: type, periodStart: source.range.start, periodEnd: source.range.end, periodTimezone: source.facts.periodTimezone, sourceFingerprint: source.sourceFingerprint, status: "CURRENT", factsPayload: source.facts, userReviewBody: null, version: 1, generatedAt: now, updatedAt: now };
    }
    await tx.update(periodReviews).set({ periodEnd: source.range.end, periodTimezone: source.facts.periodTimezone, sourceFingerprint: source.sourceFingerprint, status: "CURRENT", factsPayload: source.facts, version: current.version + 1, generatedAt: now, updatedAt: now }).where(eq(periodReviews.id, current.id));
    return { ...current, periodEnd: source.range.end, periodTimezone: source.facts.periodTimezone, sourceFingerprint: source.sourceFingerprint, status: "CURRENT", factsPayload: source.facts, version: current.version + 1, generatedAt: now, updatedAt: now };
  });
}

export async function updatePeriodReviewBody(userId: number, id: number, expectedVersion: number, userReviewBody: string) {
  const result = await db.update(periodReviews).set({ userReviewBody, version: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(periodReviews.id, id), eq(periodReviews.userId, userId), eq(periodReviews.version, expectedVersion)));
  if (!result[0].affectedRows) throw new BusinessError(ErrorCode.CONFLICT, "period review version conflict", 409);
  return { id, version: expectedVersion + 1 };
}

export async function adventureSnapshotReferenceAvailable(userId: number, id: number) {
  const [row] = await db.select({ id: dailyAdventureSnapshots.id }).from(dailyAdventureSnapshots).where(and(eq(dailyAdventureSnapshots.userId, userId), eq(dailyAdventureSnapshots.id, id)));
  return Boolean(row);
}
