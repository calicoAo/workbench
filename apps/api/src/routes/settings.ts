import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { taskCategories, users, userSettings } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { isValidTimezone } from "../time.js";

const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(64).optional(),
  timezone: z.string().refine(isValidTimezone).optional(),
  reducedMotion: z.boolean().optional(),
  showRewards: z.boolean().optional()
}).refine((value) => Object.values(value).some((item) => item !== undefined), { message: "at least one setting is required" });

async function settingsFor(userId: number) {
  const [[user], [preferences], categories] = await Promise.all([
    db.select({ id: users.id, username: users.username, displayName: users.displayName, timezone: users.timezone }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
    db.select().from(taskCategories).where(and(eq(taskCategories.userId, userId), isNull(taskCategories.deletedAt))).orderBy(asc(taskCategories.sortOrder), asc(taskCategories.id))
  ]);
  if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
  return {
    profile: user,
    appearance: { theme: "light" as const, reducedMotion: Boolean(preferences?.reducedMotion) },
    rewards: { show: preferences ? Boolean(preferences.showRewards) : true },
    continuation: { mode: "manual" as const, automaticAvailable: false },
    categories
  };
}

export const settingsRoute = new Hono()
  .get("/", async (c) => ok(c, await settingsFor(getCurrentUserId(c))))
  .patch("/", async (c) => {
    const userId = getCurrentUserId(c);
    const body = updateSchema.parse(await c.req.json());
    await db.transaction(async (tx) => {
      if (body.displayName !== undefined || body.timezone !== undefined) {
        await tx.update(users).set({ ...(body.displayName !== undefined ? { displayName: body.displayName } : {}), ...(body.timezone !== undefined ? { timezone: body.timezone } : {}), updatedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.deletedAt)));
      }
      if (body.reducedMotion !== undefined || body.showRewards !== undefined) {
        const [current] = await tx.select().from(userSettings).where(eq(userSettings.userId, userId)).for("update");
        const values = { reducedMotion: body.reducedMotion === undefined ? current?.reducedMotion ?? 0 : body.reducedMotion ? 1 : 0, showRewards: body.showRewards === undefined ? current?.showRewards ?? 1 : body.showRewards ? 1 : 0, updatedAt: new Date() };
        if (current) await tx.update(userSettings).set(values).where(eq(userSettings.userId, userId));
        else await tx.insert(userSettings).values({ userId, ...values });
      }
    });
    return ok(c, await settingsFor(userId));
  });
