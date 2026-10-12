import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { growthDimensions, habitOccurrences, rewardEvents, taskCategories, userGrowth, users } from "./db/schema.js";
import { HabitOccurrenceStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { actualTimeForRange } from "./execution-read-model.js";
import { growthSummary } from "./rewards.js";
import { businessDateAt } from "./time.js";
import { completionEventsForRange } from "./task-completion.js";
import { growthContributions } from "./growth-contributions.js";
export type { GrowthCategoryContribution, GrowthContributionMetrics, GrowthContributionTrend } from "./growth-contributions.js";

export const DEFAULT_GROWTH_DIMENSIONS = [
  { dimensionKey: "career", name: "事业", iconKey: "briefcase", color: "#5B8DEF", sortOrder: 10 },
  { dimensionKey: "learning", name: "学习", iconKey: "book-open", color: "#B28DFF", sortOrder: 20 },
  { dimensionKey: "creative", name: "创作", iconKey: "pen-tool", color: "#FF8FA3", sortOrder: 30 },
  { dimensionKey: "life", name: "生活", iconKey: "home", color: "#35C99A", sortOrder: 40 },
  { dimensionKey: "body", name: "身体", iconKey: "heart-pulse", color: "#9BD67D", sortOrder: 50 },
  { dimensionKey: "social", name: "社交", iconKey: "users", color: "#F7C96B", sortOrder: 60 }
] as const;

export async function seedGrowthDimensions(client: DatabaseClient, userId: number, now = new Date()) {
  await client.insert(growthDimensions).values(DEFAULT_GROWTH_DIMENSIONS.map((dimension) => ({
    userId,
    ...dimension,
    enabled: 1,
    version: 1,
    createdAt: now,
    updatedAt: now
  })));
}

export async function requireGrowthDimension(client: DatabaseClient, userId: number, dimensionKey: string, includeDisabled = false) {
  const [dimension] = await client.select().from(growthDimensions).where(and(
    eq(growthDimensions.userId, userId),
    eq(growthDimensions.dimensionKey, dimensionKey),
    ...(includeDisabled ? [] : [eq(growthDimensions.enabled, 1)])
  ));
  if (!dimension) throw new BusinessError(ErrorCode.PARAM_ERROR, "growth dimension is not available");
  return dimension;
}

export async function growthConfiguration(userId: number) {
  const [dimensions, categories] = await Promise.all([
    db.select().from(growthDimensions).where(eq(growthDimensions.userId, userId)).orderBy(asc(growthDimensions.sortOrder), asc(growthDimensions.id)),
    db.select({ id: taskCategories.id, name: taskCategories.name, color: taskCategories.color, icon: taskCategories.icon, dimensionKey: taskCategories.dimensionKey, enabled: taskCategories.enabled })
      .from(taskCategories)
      .where(and(eq(taskCategories.userId, userId), isNull(taskCategories.deletedAt)))
      .orderBy(asc(taskCategories.sortOrder), asc(taskCategories.id))
  ]);
  return { dimensions, categories };
}

function periodStart(to: string, days: number) {
  const [year, month, day] = to.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - days + 1, 12)).toISOString().slice(0, 10);
}

export async function growthPeriod(userId: number, days: 7 | 30 | 90, requestedTo?: string) {
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
  const to = requestedTo ?? businessDateAt(new Date(), user.timezone);
  const from = periodStart(to, days);
  return { days, from, to, timezone: user.timezone };
}

export async function growthOverview(userId: number, days: 7 | 30 | 90 = 30, requestedTo?: string) {
  const { from, to, timezone } = await growthPeriod(userId, days, requestedTo);
  const user = { timezone };
  const [entries, config, growthRows, completionRows, habits, rewards] = await Promise.all([
    actualTimeForRange(userId, from, to, user.timezone),
    growthConfiguration(userId),
    db.select().from(userGrowth).where(eq(userGrowth.userId, userId)),
    completionEventsForRange(userId, from, to),
    db.select({ id: habitOccurrences.id, occurrenceDate: habitOccurrences.occurrenceDate }).from(habitOccurrences).where(and(
      eq(habitOccurrences.userId, userId),
      eq(habitOccurrences.status, HabitOccurrenceStatus.COMPLETED),
      gte(habitOccurrences.occurrenceDate, from),
      lte(habitOccurrences.occurrenceDate, to)
    )),
    db.select().from(rewardEvents).where(eq(rewardEvents.userId, userId)).orderBy(desc(rewardEvents.createdAt)).limit(50)
  ]);

  const dimensionsByKey = new Map(config.dimensions.map((dimension) => [dimension.dimensionKey, dimension]));
  const categoriesById = new Map(config.categories.map((category) => [category.id, category]));
  const contributions = growthContributions(entries, completionRows, config.categories, config.dimensions, { days, from, timezone: user.timezone });
  const rewardByTaskId = new Map(rewards.filter((reward) => reward.sourceType === "task").map((reward) => [reward.sourceId, reward]));
  const dimensions = config.dimensions.filter((dimension) => dimension.enabled).map((dimension) => {
    const total = contributions.dimensions.get(dimension.dimensionKey)!;
    return {
      id: dimension.id,
      dimensionKey: dimension.dimensionKey,
      name: dimension.name,
      iconKey: dimension.iconKey,
      color: dimension.color,
      sortOrder: dimension.sortOrder,
      ...total,
      completedTaskCount: total.completionEventCount,
      share: contributions.summary.mappedActualSeconds ? total.actualSeconds / contributions.summary.mappedActualSeconds : 0
    };
  });
  return {
    period: { days, from, to, timezone: user.timezone },
    hero: growthSummary(growthRows[0] ?? { level: 1, xpTotal: 0, coins: 0 }),
    summary: {
      ...contributions.summary,
      completedTaskCount: contributions.summary.completionEventCount,
      habitCompletedCount: habits.length
    },
    dimensions,
    categoryBreakdown: contributions.categoryBreakdown,
    trend: contributions.trend.map((bucket) => ({
      ...bucket,
      completedTaskCount: bucket.completionEventCount,
      habitCompletedCount: habits.filter((entry) => String(entry.occurrenceDate).slice(0, 10) >= bucket.from && String(entry.occurrenceDate).slice(0, 10) <= bucket.to).length
    })),
    unmapped: { ...contributions.unmapped, completedTaskCount: contributions.unmapped.completionEventCount },
    recent: completionRows.slice(0, 8).map((event) => {
      const category = event.categoryIdAtOccurrence ? categoriesById.get(event.categoryIdAtOccurrence) : undefined;
      const dimension = category?.dimensionKey ? dimensionsByKey.get(category.dimensionKey) : undefined;
      const reward = event.lifecycleVersion === 1 ? rewardByTaskId.get(String(event.taskId)) : undefined;
      return {
        id: event.id,
        kind: "TASK_COMPLETION" as const,
        businessDate: event.businessDate,
        title: event.title,
        dimensionName: dimension?.enabled ? dimension.name : null,
        xpDelta: reward?.xpDelta ?? 0
      };
    })
  };
}

export async function createGrowthDimension(userId: number, input: { name: string; iconKey?: string | null; color: string; sortOrder: number }) {
  const now = new Date();
  const dimensionKey = `custom_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const [result] = await db.insert(growthDimensions).values({ userId, dimensionKey, name: input.name, iconKey: input.iconKey ?? null, color: input.color, sortOrder: input.sortOrder, enabled: 1, version: 1, createdAt: now, updatedAt: now });
  return { id: result.insertId, dimensionKey, version: 1 };
}

export async function updateGrowthDimension(userId: number, id: number, input: { expectedVersion: number; name?: string; iconKey?: string | null; color?: string; sortOrder?: number; enabled?: boolean }) {
  return db.transaction(async (tx) => {
    const [dimension] = await tx.select().from(growthDimensions).where(and(eq(growthDimensions.id, id), eq(growthDimensions.userId, userId))).for("update");
    if (!dimension) throw new BusinessError(ErrorCode.NOT_FOUND, "growth dimension not found", 404);
    if (dimension.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "growth dimension version conflict", 409);
    if (input.enabled === false && dimension.enabled) {
      await tx.update(taskCategories).set({ dimensionKey: null, updatedAt: new Date() }).where(and(eq(taskCategories.userId, userId), eq(taskCategories.dimensionKey, dimension.dimensionKey)));
    }
    await tx.update(growthDimensions).set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.iconKey !== undefined ? { iconKey: input.iconKey } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled ? 1 : 0 } : {}),
      version: dimension.version + 1,
      updatedAt: new Date()
    }).where(eq(growthDimensions.id, id));
    return { id, version: dimension.version + 1, unmappedCategories: input.enabled === false && dimension.enabled };
  });
}

export async function updateCategoryGrowthMapping(userId: number, categoryId: number, dimensionKey: string | null) {
  if (dimensionKey) await requireGrowthDimension(db, userId, dimensionKey);
  const [category] = await db.select({ id: taskCategories.id }).from(taskCategories).where(and(eq(taskCategories.id, categoryId), eq(taskCategories.userId, userId), isNull(taskCategories.deletedAt)));
  if (!category) throw new BusinessError(ErrorCode.NOT_FOUND, "category not found", 404);
  await db.update(taskCategories).set({ dimensionKey, updatedAt: new Date() }).where(and(eq(taskCategories.id, categoryId), eq(taskCategories.userId, userId)));
  return { id: categoryId, dimensionKey };
}

/** Validate a stored Category identity without disclosing foreign metadata. Missing historic IDs are attested by own facts. */
export async function rejectForeignGrowthCategory(userId: number, categoryId: number) {
  const [row] = await db.select({ userId: taskCategories.userId }).from(taskCategories).where(eq(taskCategories.id, categoryId));
  if (row && row.userId !== userId) throw new BusinessError(ErrorCode.NOT_FOUND, "category contribution not found", 404);
}
