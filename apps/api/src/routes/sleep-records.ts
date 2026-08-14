import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { sleepRecords } from "../db/schema.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { grantRecordReward } from "../rewards.js";


const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const saveSleepSchema = z.object({
  sleepDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleepStart: z.string().regex(/^\d{2}:\d{2}$/),
  wakeTime: z.string().regex(/^\d{2}:\d{2}$/),
  qualityScore: z.number().int().min(1).max(5).optional(),
  note: z.string().max(500).optional()
});

function dateTimeFor(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`);
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export const sleepRecordsRoute = new Hono()
  .get("/", async (c) => {
    const query = querySchema.parse(c.req.query());
    const [row] = await db
      .select()
      .from(sleepRecords)
      .where(and(eq(sleepRecords.userId, getCurrentUserId(c)), eq(sleepRecords.sleepDate, query.date), isNull(sleepRecords.deletedAt)));

    return ok(c, row ?? null);
  })
  .post("/", async (c) => {
    const body = saveSleepSchema.parse(await c.req.json());
    const sleepStart = dateTimeFor(body.sleepDate, body.sleepStart);
    const wakeTime = dateTimeFor(body.sleepDate, body.wakeTime);
    if (wakeTime <= sleepStart) {
      wakeTime.setDate(wakeTime.getDate() + 1);
    }

    const now = new Date();
    const values = {
      userId: getCurrentUserId(c),
      sleepDate: body.sleepDate,
      sleepStart,
      wakeTime,
      durationMinutes: minutesBetween(sleepStart, wakeTime),
      qualityScore: body.qualityScore,
      note: body.note,
      createdAt: now,
      updatedAt: now
    };

    await db
      .insert(sleepRecords)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          sleepStart: values.sleepStart,
          wakeTime: values.wakeTime,
          durationMinutes: values.durationMinutes,
          qualityScore: values.qualityScore,
          note: values.note,
          updatedAt: now,
          deletedAt: null
        }
      });

    const reward = await grantRecordReward(getCurrentUserId(c), "sleep", body.sleepDate, "记录睡眠");
    log.info({ userId: getCurrentUserId(c), sleepDate: body.sleepDate }, "[sleep_record_saved]");
    return ok(c, { sleepDate: body.sleepDate, durationMinutes: values.durationMinutes, reward });
  });

