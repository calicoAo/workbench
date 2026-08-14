import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { rewardEvents, userGrowth, type tasks } from "./db/schema.js";

type RewardInput = {
  userId: number;
  eventKey: string;
  sourceType: string;
  sourceId: string;
  eventDate?: string | null;
  xp: number;
  coins: number;
  reason: string;
};

type RewardClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type TaskRewardSource = Pick<typeof tasks.$inferSelect, "id" | "difficulty" | "pinned">;

const taskBase: Record<number, { xp: number; coins: number }> = {
  1: { xp: 10, coins: 3 },
  2: { xp: 20, coins: 6 },
  3: { xp: 40, coins: 12 },
  4: { xp: 70, coins: 20 }
};

export const RewardAmount = {
  morning: { xp: 15, coins: 5 },
  journal: { xp: 15, coins: 5 },
  stockReview: { xp: 20, coins: 8 },
  sleep: { xp: 10, coins: 3 },
  waterFull: { xp: 12, coins: 4 },
  media: { xp: 5, coins: 1 },
  decision: { xp: 8, coins: 2 },
  bridge: { xp: 12, coins: 4 },
  scheduleHour: { xp: 2, coins: 0 }
} as const;

export function xpForLevel(level: number) {
  return level * level * 50;
}

function xpBeforeLevel(level: number) {
  let total = 0;
  for (let current = 1; current < level; current += 1) total += xpForLevel(current);
  return total;
}

export function levelFromXp(xpTotal: number) {
  let level = 1;
  while (xpTotal >= xpBeforeLevel(level + 1)) level += 1;
  return level;
}

export function growthSummary(row: { level: number; xpTotal: number; coins: number }) {
  const level = levelFromXp(row.xpTotal);
  const xpInLevel = row.xpTotal - xpBeforeLevel(level);
  return {
    level,
    xpTotal: row.xpTotal,
    coins: row.coins,
    xpInLevel,
    xpForNextLevel: xpForLevel(level)
  };
}

function isDuplicateError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY";
}

export async function ensureGrowth(userId: number) {
  const [row] = await db.select().from(userGrowth).where(eq(userGrowth.userId, userId));
  if (row) return row;
  const now = new Date();
  try {
    await db.insert(userGrowth).values({ userId, level: 1, xpTotal: 0, coins: 0, createdAt: now, updatedAt: now });
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
  }
  const [created] = await db.select().from(userGrowth).where(eq(userGrowth.userId, userId));
  return created ?? { userId, level: 1, xpTotal: 0, coins: 0, createdAt: now, updatedAt: now };
}

export async function grantReward(input: RewardInput) {
  return db.transaction((tx) => grantRewardInClient(tx, input));
}

export async function grantRewardInClient(client: RewardClient, input: RewardInput) {
  const xp = Math.max(0, Math.round(input.xp));
  const coins = Math.max(0, Math.round(input.coins));
  if (!xp && !coins) return null;

  const now = new Date();
  try {
    await client.insert(rewardEvents).values({
      userId: input.userId,
      eventKey: input.eventKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      eventDate: input.eventDate ?? null,
      xpDelta: xp,
      coinDelta: coins,
      reason: input.reason,
      createdAt: now
    });
  } catch (error) {
    if (isDuplicateError(error)) return null;
    throw error;
  }

  await client
    .insert(userGrowth)
    .values({ userId: input.userId, level: 1, xpTotal: 0, coins: 0, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { userId: input.userId } });

  await client
    .update(userGrowth)
    .set({
      xpTotal: sql`${userGrowth.xpTotal} + ${xp}`,
      coins: sql`${userGrowth.coins} + ${coins}`,
      updatedAt: now
    })
    .where(eq(userGrowth.userId, input.userId));

  return { xp, coins, reason: input.reason };
}

export async function grantRecordReward(userId: number, sourceType: keyof typeof RewardAmount, date: string, reason: string) {
  const amount = RewardAmount[sourceType];
  return grantReward({
    userId,
    eventKey: `${sourceType}:${userId}:${date}`,
    sourceType,
    sourceId: date,
    eventDate: date,
    xp: amount.xp,
    coins: amount.coins,
    reason
  });
}

export async function grantTaskDoneReward(userId: number, task: TaskRewardSource) {
  return db.transaction((tx) => grantTaskDoneRewardInClient(tx, userId, task));
}

export async function grantTaskDoneRewardInClient(client: RewardClient, userId: number, task: TaskRewardSource) {
  const base = taskBase[task.difficulty] ?? taskBase[2];
  const multiplier = task.pinned ? 1.3 : 1;
  return grantRewardInClient(client, {
    userId,
    eventKey: `task_done:${userId}:${task.id}`,
    sourceType: "task",
    sourceId: String(task.id),
    xp: base.xp * multiplier,
    coins: base.coins * multiplier,
    reason: task.pinned ? "完成重要任务" : "完成任务"
  });
}

export async function grantTaskPartialReward(userId: number, timerId: number, date: string, durationMinutes: number, task: TaskRewardSource) {
  if (durationMinutes < 1) return null;
  const base = taskBase[task.difficulty] ?? taskBase[2];
  const multiplier = task.pinned ? 1.3 : 1;
  const ratio = Math.min(0.5, Math.max(0.15, durationMinutes / 120));
  return grantReward({
    userId,
    eventKey: `task_partial:${userId}:${timerId}`,
    sourceType: "task_partial",
    sourceId: String(timerId),
    eventDate: date,
    xp: base.xp * ratio * multiplier,
    coins: Math.max(1, base.coins * ratio * multiplier),
    reason: task.pinned ? "重要任务阶段完成" : "任务阶段完成"
  });
}

export async function grantTimerReward(userId: number, timerId: number, date: string, durationMinutes: number) {
  if (durationMinutes < 3) return null;
  const blocks = Math.floor(durationMinutes / 25);
  return grantReward({
    userId,
    eventKey: `timer:${userId}:${timerId}`,
    sourceType: "timer",
    sourceId: String(timerId),
    eventDate: date,
    xp: blocks * 5,
    coins: blocks,
    reason: "任务计时"
  });
}

export async function recentRewardEvents(userId: number, limit = 8) {
  return db
    .select()
    .from(rewardEvents)
    .where(and(eq(rewardEvents.userId, userId)))
    .orderBy(desc(rewardEvents.createdAt))
    .limit(limit);
}
