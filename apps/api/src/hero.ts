import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { heroDailyEntries, heroDailyStatuses, heroProfiles, userGrowth, users } from "./db/schema.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { growthSummary } from "./rewards.js";
import { businessDateAt, calendarDaysBetween } from "./time.js";

export const HERO_STATUS_KEYS = ["GREAT", "GOOD", "OKAY", "TIRED", "LOW"] as const;
export type HeroStatusKey = (typeof HERO_STATUS_KEYS)[number];

export async function seedHeroForNewUser(client: DatabaseClient, userId: number, displayName: string, now = new Date()) {
  await client.insert(heroProfiles).values({ userId, displayName, version: 1, createdAt: now, updatedAt: now });
}

export async function heroSummary(userId: number, requestedDate?: string) {
  const [[user], [profile], [growth]] = await Promise.all([
    db.select({ timezone: users.timezone }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))),
    db.select().from(heroProfiles).where(eq(heroProfiles.userId, userId)),
    db.select().from(userGrowth).where(eq(userGrowth.userId, userId))
  ]);
  if (!user || !profile) throw new BusinessError(ErrorCode.NOT_FOUND, "hero profile not found", 404);
  const businessDate = requestedDate ?? businessDateAt(new Date(), user.timezone);
  const [status] = await db.select().from(heroDailyStatuses).where(and(eq(heroDailyStatuses.userId, userId), eq(heroDailyStatuses.businessDate, businessDate)));
  return {
    businessDate,
    timezone: user.timezone,
    profile,
    progress: growthSummary(growth ?? { level: 1, xpTotal: 0, coins: 0 }),
    dailyStatus: status ?? null,
    earthOnlineDay: profile.birthDate ? calendarDaysBetween(profile.birthDate, businessDate) + 1 : null
  };
}

export async function updateHeroProfile(userId: number, input: {
  expectedVersion: number;
  displayName?: string;
  avatarRef?: string | null;
  portraitRef?: string | null;
  title?: string | null;
  birthDate?: string | null;
  visualPreferences?: Record<string, unknown> | null;
}) {
  return db.transaction(async (tx) => {
    const [[profile], [user]] = await Promise.all([
      tx.select().from(heroProfiles).where(eq(heroProfiles.userId, userId)).for("update"),
      tx.select({ timezone: users.timezone }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)))
    ]);
    if (!profile || !user) throw new BusinessError(ErrorCode.NOT_FOUND, "hero profile not found", 404);
    if (profile.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "hero profile version conflict", 409);
    if (input.birthDate && input.birthDate > businessDateAt(new Date(), user.timezone)) throw new BusinessError(ErrorCode.PARAM_ERROR, "birth date cannot be in the future", 400);
    const nextVersion = profile.version + 1;
    await tx.update(heroProfiles).set({
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.avatarRef !== undefined ? { avatarRef: input.avatarRef } : {}),
      ...(input.portraitRef !== undefined ? { portraitRef: input.portraitRef } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
      ...(input.visualPreferences !== undefined ? { visualPreferences: input.visualPreferences } : {}),
      version: nextVersion,
      updatedAt: new Date()
    }).where(eq(heroProfiles.userId, userId));
    return { userId, version: nextVersion };
  });
}

export async function setHeroDailyStatus(userId: number, input: { businessDate: string; periodTimezone: string; statusKey: HeroStatusKey; expectedVersion: number }) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ timezone: users.timezone }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
    if (input.periodTimezone !== user.timezone) throw new BusinessError(ErrorCode.CONFLICT, "daily status timezone must match the current profile timezone", 409);
    const [current] = await tx.select().from(heroDailyStatuses).where(and(eq(heroDailyStatuses.userId, userId), eq(heroDailyStatuses.businessDate, input.businessDate))).for("update");
    if (!current) {
      if (input.expectedVersion !== 0) throw new BusinessError(ErrorCode.CONFLICT, "daily status version conflict", 409);
      const now = new Date();
      const [result] = await tx.insert(heroDailyStatuses).values({ userId, businessDate: input.businessDate, periodTimezone: input.periodTimezone, statusKey: input.statusKey, version: 1, createdAt: now, updatedAt: now });
      return { id: result.insertId, version: 1, statusKey: input.statusKey };
    }
    if (current.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "daily status version conflict", 409);
    await tx.update(heroDailyStatuses).set({ statusKey: input.statusKey, version: current.version + 1, updatedAt: new Date() }).where(eq(heroDailyStatuses.id, current.id));
    return { id: current.id, version: current.version + 1, statusKey: input.statusKey };
  });
}

export async function claimDailyEntry(userId: number, requestedDate: string, onboardingResolved: boolean) {
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
  const businessDate = businessDateAt(new Date(), user.timezone);
  if (requestedDate !== businessDate) throw new BusinessError(ErrorCode.CONFLICT, "daily entry is only available for the current business date", 409);
  if (!onboardingResolved) return { claimed: false, reason: "ONBOARDING" as const };
  const now = new Date();
  const [result] = await db.insert(heroDailyEntries).values({ userId, businessDate, periodTimezone: user.timezone, enteredAt: now }).onDuplicateKeyUpdate({ set: { enteredAt: sql`${heroDailyEntries.enteredAt}` } });
  if (result.affectedRows !== 1 || result.insertId === 0) return { claimed: false, reason: "ALREADY_ENTERED" as const };
  return { claimed: true, reason: null, hero: await heroSummary(userId, businessDate) };
}
