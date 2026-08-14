import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { aiInsights, journals, mediaWatchRecords, morningWritings, rewardEvents, scheduleCarryovers, schedules, sleepRecords, stockReviews, taskCategories, taskDailyAssignments, tasks, timerSessions, waterRecords } from "../db/schema.js";
import { ScheduleKind, ScheduleSource, TaskStatus, TimerStatus } from "../enums.js";
import { ok } from "../http.js";
import { ensureGrowth, growthSummary, recentRewardEvents } from "../rewards.js";


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

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12));
  return next.toISOString().slice(0, 10);
}

async function inheritDailyTasks(userId: number, date: string) {
  const current = await db
    .select({ taskId: taskDailyAssignments.taskId })
    .from(taskDailyAssignments)
    .where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.taskDate, date)));
  if (current.length) return;

  const previousDate = shiftDate(date, -1);
  const [previousRows, pendingTasks] = await Promise.all([
    db
      .select({ taskId: taskDailyAssignments.taskId, sortOrder: taskDailyAssignments.sortOrder })
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.taskDate, previousDate)))
      .orderBy(asc(taskDailyAssignments.sortOrder), asc(taskDailyAssignments.id)),
    db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
  ]);
  if (!previousRows.length) return;

  const pendingIds = new Set(pendingTasks.filter((task) => task.status !== TaskStatus.DONE && task.status !== TaskStatus.ARCHIVED).map((task) => task.id));
  const inherited = previousRows.filter((row) => pendingIds.has(row.taskId));
  if (!inherited.length) return;

  const now = new Date();
  await db
    .insert(taskDailyAssignments)
    .values(
      inherited.map((row, index) => ({
        userId,
        taskId: row.taskId,
        taskDate: date,
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now
      }))
    )
    .onDuplicateKeyUpdate({ set: { updatedAt: now } });
}

async function inheritUnfinishedPlans(userId: number, date: string) {
  const previousDate = shiftDate(date, -1);
  const [previousPlans, currentPlans, taskRows, handledCarryovers] = await Promise.all([
    db
      .select()
      .from(schedules)
      .where(and(eq(schedules.userId, userId), eq(schedules.scheduleDate, previousDate), eq(schedules.kind, ScheduleKind.PLANNED), isNull(schedules.deletedAt))),
    db.select({ taskId: schedules.taskId }).from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.scheduleDate, date), isNull(schedules.deletedAt))),
    db.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt))),
    db.select().from(scheduleCarryovers).where(and(eq(scheduleCarryovers.userId, userId), eq(scheduleCarryovers.carryDate, date)))
  ]);

  const currentTaskIds = new Set(currentPlans.map((plan) => plan.taskId).filter((taskId): taskId is number => Boolean(taskId)));
  const taskById = new Map(taskRows.map((task) => [task.id, task]));
  const handledScheduleIds = new Set(handledCarryovers.map((carryover) => carryover.fromScheduleId));
  const now = new Date();
  const candidatePlans = previousPlans.filter((plan) => {
      if (!plan.taskId || plan.completed || handledScheduleIds.has(plan.id)) return false;
      const task = taskById.get(plan.taskId);
      return task && task.status !== TaskStatus.DONE && task.status !== TaskStatus.ARCHIVED;
    });
  const inheritedPlans = candidatePlans
    .filter((plan) => plan.taskId && !currentTaskIds.has(plan.taskId))
    .map((plan) => ({
      userId,
      taskId: plan.taskId,
      categoryId: plan.categoryId,
      scheduleDate: date,
      startTime: plan.startTime,
      endTime: plan.endTime,
      title: plan.title,
      note: plan.note,
      completed: 0,
      kind: ScheduleKind.PLANNED,
      source: ScheduleSource.PLANNED_TASK,
      createdAt: now,
      updatedAt: now
    }));

  if (inheritedPlans.length) {
    await db.insert(schedules).values(inheritedPlans);
  }
  if (candidatePlans.length) {
    await db
      .insert(scheduleCarryovers)
      .values(candidatePlans.map((plan) => ({ userId, fromScheduleId: plan.id, carryDate: date, createdAt: now })))
      .onDuplicateKeyUpdate({ set: { createdAt: now } });
  }
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
  const userId = getCurrentUserId(c);
  await inheritUnfinishedPlans(userId, query.date);
  await inheritDailyTasks(userId, query.date);
  const range = weekRange(query.date);
  const month = monthRange(query.date);
  const [
    taskRows,
    categoryRows,
    scheduleRows,
    allScheduleRows,
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
    monthSleepRows,
    growth,
    rewardEventRows,
    taskRewardEventRows,
    insightRows
  ] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.sortOrder), desc(tasks.updatedAt)),
    db.select().from(taskCategories).where(and(eq(taskCategories.userId, userId), eq(taskCategories.enabled, 1), isNull(taskCategories.deletedAt))),
    db.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.scheduleDate, query.date), isNull(schedules.deletedAt))).orderBy(asc(schedules.startTime)),
    db.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.kind, ScheduleKind.ACTUAL), isNull(schedules.deletedAt))),
    db.select().from(sleepRecords).where(and(eq(sleepRecords.userId, userId), eq(sleepRecords.sleepDate, query.date), isNull(sleepRecords.deletedAt))),
    db.select().from(timerSessions).where(and(eq(timerSessions.userId, userId), isNull(timerSessions.deletedAt))),
    db.select().from(journals).where(and(eq(journals.userId, userId), eq(journals.journalDate, query.date), isNull(journals.deletedAt))),
    db.select().from(morningWritings).where(and(eq(morningWritings.userId, userId), eq(morningWritings.writingDate, query.date), isNull(morningWritings.deletedAt))),
    db.select().from(waterRecords).where(and(eq(waterRecords.userId, userId), eq(waterRecords.waterDate, query.date), isNull(waterRecords.deletedAt))),
    db.select().from(mediaWatchRecords).where(and(eq(mediaWatchRecords.userId, userId), eq(mediaWatchRecords.watchDate, query.date), isNull(mediaWatchRecords.deletedAt))),
    db.select().from(journals).where(and(eq(journals.userId, userId), gte(journals.journalDate, range.start), lte(journals.journalDate, range.end), isNull(journals.deletedAt))),
    db.select().from(stockReviews).where(and(eq(stockReviews.userId, userId), eq(stockReviews.reviewDate, query.date), isNull(stockReviews.deletedAt))),
    db.select().from(stockReviews).where(and(eq(stockReviews.userId, userId), gte(stockReviews.reviewDate, range.start), lte(stockReviews.reviewDate, range.end), isNull(stockReviews.deletedAt))),
    db.select().from(sleepRecords).where(and(eq(sleepRecords.userId, userId), gte(sleepRecords.sleepDate, range.start), lte(sleepRecords.sleepDate, range.end), isNull(sleepRecords.deletedAt))),
    db.select().from(sleepRecords).where(and(eq(sleepRecords.userId, userId), gte(sleepRecords.sleepDate, month.start), lte(sleepRecords.sleepDate, month.end), isNull(sleepRecords.deletedAt))),
    ensureGrowth(userId),
    recentRewardEvents(userId, 6),
    db.select().from(rewardEvents).where(and(eq(rewardEvents.userId, userId), eq(rewardEvents.sourceType, "task"))).orderBy(desc(rewardEvents.createdAt)),
    db.select().from(aiInsights).where(and(eq(aiInsights.userId, userId), eq(aiInsights.sourceDate, query.date), isNull(aiInsights.deletedAt)))
  ]);
  const dailyTaskRows = await db
    .select({ taskId: taskDailyAssignments.taskId })
    .from(taskDailyAssignments)
    .where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.taskDate, query.date)))
    .orderBy(asc(taskDailyAssignments.sortOrder), asc(taskDailyAssignments.id));

  const activeTimers = sessionRows.filter((session) => session.status === TimerStatus.RUNNING);
  const activeTimer = activeTimers[0] ?? null;
  const minutesByCategory = new Map<number, number>();
  const totalMinutesByCategory = new Map<number, number>();
  const actualSchedules = scheduleRows.filter((schedule) => schedule.kind === ScheduleKind.ACTUAL);
  for (const schedule of actualSchedules) {
    if (schedule.categoryId) {
      minutesByCategory.set(schedule.categoryId, (minutesByCategory.get(schedule.categoryId) ?? 0) + minutesBetweenTime(schedule.startTime, schedule.endTime));
    }
  }
  for (const schedule of allScheduleRows) {
    if (schedule.categoryId) {
      totalMinutesByCategory.set(schedule.categoryId, (totalMinutesByCategory.get(schedule.categoryId) ?? 0) + minutesBetweenTime(schedule.startTime, schedule.endTime));
    }
  }
  const categoryColorById = new Map(categoryRows.map((category) => [category.id, category.color]));
  const journalByDate = new Map(weekJournalRows.map((journal) => [journal.journalDate, journal]));
  const reviewByDate = new Map(weekReviewRows.map((review) => [review.reviewDate, review]));
  const sleepByDate = new Map(weekSleepRows.map((sleep) => [sleep.sleepDate, sleep]));

  return ok(c, {
    date: query.date,
    activeTimer,
    activeTimers,
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
    growth: growthSummary(growth),
    rewardEvents: rewardEventRows,
    taskRewardEvents: taskRewardEventRows,
    aiInsights: insightRows,
    tasks: taskRows,
    dailyTaskIds: dailyTaskRows.map((row) => row.taskId),
    categories: categoryRows.map((category) => ({
      ...category,
      totalMinutes: minutesByCategory.get(category.id) ?? 0
    })),
    categoryTotals: categoryRows.map((category) => ({
      ...category,
      totalMinutes: totalMinutesByCategory.get(category.id) ?? 0
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

