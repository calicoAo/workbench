import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { waterRecords } from "../db/schema.js";
import { ok } from "../http.js";
import { log } from "../logger.js";


const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const saveWaterSchema = z.object({
  waterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cups: z.number().int().min(0).max(8),
  targetCups: z.number().int().min(1).max(12).default(8)
});

function parseDrinkTimes(value?: string | null, fallback?: Date | null) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string").slice(0, 12);
  } catch {
    // fall back to the legacy single timestamp below
  }
  return fallback ? [fallback.toISOString()] : [];
}

export const waterRecordsRoute = new Hono()
  .get("/", async (c) => {
    const query = querySchema.parse(c.req.query());
    const [row] = await db
      .select()
      .from(waterRecords)
      .where(and(eq(waterRecords.userId, getCurrentUserId(c)), eq(waterRecords.waterDate, query.date), isNull(waterRecords.deletedAt)));

    return ok(c, row ?? { waterDate: query.date, cups: 0, targetCups: 8, lastDrinkAt: null, drinkTimes: "[]" });
  })
  .post("/", async (c) => {
    const body = saveWaterSchema.parse(await c.req.json());
    const now = new Date();
    const [current] = await db
      .select()
      .from(waterRecords)
      .where(and(eq(waterRecords.userId, getCurrentUserId(c)), eq(waterRecords.waterDate, body.waterDate), isNull(waterRecords.deletedAt)));
    const existingDrinkTimes = parseDrinkTimes(current?.drinkTimes, current?.lastDrinkAt ?? null).slice(0, current?.cups ?? 0);
    const drinkTimes =
      body.cups > existingDrinkTimes.length
        ? [...existingDrinkTimes, ...Array.from({ length: body.cups - existingDrinkTimes.length }, () => now.toISOString())]
        : existingDrinkTimes.slice(0, body.cups);
    const lastDrinkAt = drinkTimes.length ? new Date(drinkTimes[drinkTimes.length - 1]) : null;
    const values = {
      userId: getCurrentUserId(c),
      waterDate: body.waterDate,
      cups: body.cups,
      targetCups: body.targetCups,
      lastDrinkAt,
      drinkTimes: JSON.stringify(drinkTimes),
      createdAt: now,
      updatedAt: now
    };

    await db
      .insert(waterRecords)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          cups: values.cups,
          targetCups: values.targetCups,
          lastDrinkAt: values.lastDrinkAt,
          drinkTimes: values.drinkTimes,
          updatedAt: now,
          deletedAt: null
        }
      });

    log.info({ userId: getCurrentUserId(c), waterDate: body.waterDate, cups: body.cups }, "[water_record_saved]");
    return ok(c, { waterDate: body.waterDate, cups: body.cups, targetCups: body.targetCups, lastDrinkAt, drinkTimes: values.drinkTimes });
  });

