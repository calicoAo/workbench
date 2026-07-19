import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { journals, mediaWatchRecords, morningWritings, schedules, sleepRecords, stockReviews, taskCategories, tasks, timerSessions, waterRecords } from "../db/schema.js";
import { ScheduleKind, TimerStatus } from "../enums.js";
import { ok } from "../http.js";


const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function minutesBetweenTime(startTime: string, endTime: string) {
  const [startHour, startMinute, startSecond = 0] = startTime.split(":").map(Number);
  const [endHour, endMinute, endSecond = 0] = endTime.split(":").map(Number);
  const seconds = endHour * 3600 + endMinute * 60 + endSecond - (startHour * 3600 + startMinute * 60 + startSecond);
  return seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0;
}

function weekRange(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  const mondayOffset = (value.getUTCDay() + 6) % 7;
  const start = new Date(value);
  start.setUTCDate(value.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function monthRange(date: string) {
  const [year, month] = date.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 12));
  const end = new Date(Date.UTC(year, month, 0, 12));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function weekDates(start: string, end: string) {
  const dates: string[] = [];
  const current = new Date(`${start}T12:00:00+08:00`);
  const last = new Date(`${end}T12:00:00+08:00`);
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function hasReviewContent(review: {
  marketSummary: string | null;
  operations: string | null;
  holdingsReview: string | null;
  goodPoints: string | null;
  mistakes: string | null;
  tomorrowPlan: string | null;
  tags: string | null;
} | null) {
  if (!review) return false;
  return [review.marketSummary, review.operations, review.holdingsReview, review.goodPoints, review.mistakes, review.tomorrowPlan, review.tags].some((value) => (value ?? "").trim());
}

export const dashboardRoute = new Hono().get("/", async (c) => {
  const query = querySchema.parse(c.req.query());
  const range = weekRange(query.date);
  const month = monthRange(query.date);
  const [
    taskRows,
    categoryRows,
    scheduleRows,
    sleepRows,
    sessionRows,
    journalRows,
    morningRows,
    waterRows,
    mediaWatchRows,
    weekJournalRows,
    reviewRows,
    weekReviewRows,
    weekSleepRows,
    monthSleepRows
  ] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.sortOrder), desc(tasks.updatedAt)),
    db.select().from(taskCategories).where(and(eq(taskCategories.userId, getCurrentUserId(c)), eq(taskCategories.enabled, 1), isNull(taskCategories.deletedAt))),
    db.select().from(schedules).where(and(eq(schedules.userId, getCurrentUserId(c)), eq(schedules.scheduleDate, query.date), isNull(schedules.deletedAt))).orderBy(asc(schedules.startTime)),
    db.select().from(sleepRecords).where(and(eq(sleepRecords.userId, getCurrentUserId(c)), eq(sleepRecords.sleepDate, query.date), isNull(sleepRecords.deletedAt))),
    db.select().from(timerSessions).where(and(eq(timerSessions.userId, getCurrentUserId(c)), isNull(timerSessions.deletedAt))),
    db.select().from(journals).where(and(eq(journals.userId, getCurrentUserId(c)), eq(journals.journalDate, query.date), isNull(journals.deletedAt))),
    db.select().from(morningWritings).where(and(eq(morningWritings.userId, getCurrentUserId(c)), eq(morningWritings.writingDate, query.date), isNull(morningWritings.deletedAt))),
    db.select().from(waterRecords).where(and(eq(waterRecords.userId, getCurrentUserId(c)), eq(waterRecords.waterDate, query.date), isNull(waterRecords.deletedAt))),
    db.select().from(mediaWatchRecords).where(and(eq(mediaWatchRecords.userId, getCurrentUserId(c)), eq(mediaWatchRecords.watchDate, query.date), isNull(mediaWatchRecords.deletedAt))),
    db.select().from(journals).where(and(eq(journals.userId, getCurrentUserId(c)), gte(journals.journalDate, range.start), lte(journals.journalDate, range.end), isNull(journals.deletedAt))),
    db.select().from(stockReviews).where(and(eq(stockReviews.userId, getCurrentUserId(c)), eq(stockReviews.reviewDate, query.date), isNull(stockReviews.deletedAt))),
    db.select().from(stockReviews).where(and(eq(stockReviews.userId, getCurrentUserId(c)), gte(stockReviews.reviewDate, range.start), lte(stockReviews.reviewDate, range.end), isNull(stockReviews.deletedAt))),
    db.select().from(sleepRecords).where(and(eq(sleepRecords.userId, getCurrentUserId(c)), gte(sleepRecords.sleepDate, range.start), lte(sleepRecords.sleepDate, range.end), isNull(sleepRecords.deletedAt))),
    db.select().from(sleepRecords).where(and(eq(sleepRecords.userId, getCurrentUserId(c)), gte(sleepRecords.sleepDate, month.start), lte(sleepRecords.sleepDate, month.end), isNull(sleepRecords.deletedAt)))
  ]);

  const activeTimer = sessionRows.find((session) => session.status === TimerStatus.RUNNING) ?? null;
  const minutesByCategory = new Map<number, number>();
  const actualSchedules = scheduleRows.filter((schedule) => schedule.kind === ScheduleKind.ACTUAL);
  for (const schedule of actualSchedules) {
    if (schedule.categoryId) {
      minutesByCategory.set(schedule.categoryId, (minutesByCategory.get(schedule.categoryId) ?? 0) + minutesBetweenTime(schedule.startTime, schedule.endTime));
    }
  }
  const categoryColorById = new Map(categoryRows.map((category) => [category.id, category.color]));
  const journalByDate = new Map(weekJournalRows.map((journal) => [journal.journalDate, journal]));
  const reviewByDate = new Map(weekReviewRows.map((review) => [review.reviewDate, review]));
  const sleepByDate = new Map(weekSleepRows.map((sleep) => [sleep.sleepDate, sleep]));

  return ok(c, {
    date: query.date,
    activeTimer,
    stockReviewRecord: reviewRows[0] ?? null,
    schedules: scheduleRows.map((schedule) => ({
      ...schedule,
      color: schedule.categoryId ? categoryColorById.get(schedule.categoryId) ?? "#35C99A" : "#35C99A"
    })),
    sleepRecord: sleepRows[0] ?? null,
    journalRecord: journalRows[0] ?? null,
    morningWritingRecord: morningRows[0] ?? null,
    waterRecord: waterRows[0] ?? { waterDate: query.date, cups: 0, targetCups: 8, lastDrinkAt: null, drinkTimes: "[]" },
    mediaWatchRecord: mediaWatchRows[0] ?? { watchDate: query.date, title: null, episode: null, note: null },
    tasks: taskRows,
    categories: categoryRows.map((category) => ({
      ...category,
      totalMinutes: minutesByCategory.get(category.id) ?? 0
    })),
    weeklySeries: weekDates(range.start, range.end).map((date) => {
      const journal = journalByDate.get(date);
      const review = reviewByDate.get(date);
      const sleep = sleepByDate.get(date);
      return {
        date,
        sleepMinutes: sleep?.durationMinutes ?? 0,
        sleepQuality: sleep?.qualityScore ?? null,
        journalFilled: Boolean((journal?.content ?? "").trim()),
        reviewFilled: hasReviewContent(review ?? null),
        emotionScore: review?.emotionScore ?? null,
        disciplineScore: review?.disciplineScore ?? null
      };
    }),
    monthlySleepSeries: weekDates(month.start, month.end).map((date) => {
      const sleep = monthSleepRows.find((row) => row.sleepDate === date);
      return {
        date,
        sleepMinutes: sleep?.durationMinutes ?? 0,
        sleepQuality: sleep?.qualityScore ?? null
      };
    }),
    weeklyStats: {
      totalMinutes: actualSchedules.reduce((sum, schedule) => sum + minutesBetweenTime(schedule.startTime, schedule.endTime), 0),
      completedTasks: taskRows.filter((task) => task.status === 2).length,
      journalDays: weekJournalRows.filter((journal) => (journal.content ?? "").trim()).length,
      stockReviewDays: weekReviewRows.filter((review) => hasReviewContent(review)).length
    }
  });
});

