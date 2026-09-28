import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { claimDailyEntry, HERO_STATUS_KEYS, heroSummary, setHeroDailyStatus, updateHeroProfile } from "../hero.js";
import { ok } from "../http.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableRef = z.string().trim().max(255).nullable();
const profileBody = z.object({
  expectedVersion: z.number().int().positive(),
  displayName: z.string().trim().min(1).max(64).optional(),
  avatarRef: nullableRef.optional(),
  portraitRef: nullableRef.optional(),
  title: z.string().trim().max(80).nullable().optional(),
  birthDate: date.nullable().optional(),
  visualPreferences: z.record(z.unknown()).nullable().optional()
}).refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "at least one profile change is required");
const statusBody = z.object({ businessDate: date, periodTimezone: z.string().min(1).max(64), statusKey: z.enum(HERO_STATUS_KEYS), expectedVersion: z.number().int().nonnegative() });

export function createHeroRoute(onboardingResolved: (userId: number) => Promise<boolean>) {
  return new Hono()
    .get("/", async (c) => ok(c, await heroSummary(getCurrentUserId(c), date.optional().parse(c.req.query("date")))))
    .put("/profile", async (c) => ok(c, await updateHeroProfile(getCurrentUserId(c), profileBody.parse(await c.req.json()))))
    .put("/daily-status", async (c) => ok(c, await setHeroDailyStatus(getCurrentUserId(c), statusBody.parse(await c.req.json()))))
    .post("/daily-entry/claim", async (c) => { const userId = getCurrentUserId(c); const body = z.object({ businessDate: date }).parse(await c.req.json()); return ok(c, await claimDailyEntry(userId, body.businessDate, await onboardingResolved(userId))); });
}
