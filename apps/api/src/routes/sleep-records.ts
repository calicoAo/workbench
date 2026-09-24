import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { sleepRecords } from "../db/schema.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { grantRecordReward } from "../rewards.js";
import { isValidTimezone, localDateTimeToUtc } from "../time.js";
import { BusinessError, ErrorCode } from "../errors.js";


const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const saveSleepSchema = z.object({
  sleepStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleepStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  wakeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wakeTime: z.string().regex(/^\d{2}:\d{2}$/),
  recordTimezone: z.string().refine(isValidTimezone),
  qualityScore: z.number().int().min(1).max(5).optional(),
  note: z.string().max(500).optional()
});

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
    const sleepStart = localDateTimeToUtc(body.sleepStartDate, body.sleepStartTime, body.recordTimezone);
    const wakeTime = localDateTimeToUtc(body.wakeDate, body.wakeTime, body.recordTimezone);
    if (wakeTime <= sleepStart) throw new BusinessError(ErrorCode.PARAM_ERROR, "wake time must be later than sleep start", 400);

    const now = new Date();
    const values = {
      userId: getCurrentUserId(c),
      sleepDate: body.wakeDate,
      recordTimezone: body.recordTimezone,
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
          recordTimezone: values.recordTimezone,
          durationMinutes: values.durationMinutes,
          qualityScore: values.qualityScore,
          note: values.note,
          updatedAt: now,
          deletedAt: null
        }
      });

    const reward = await grantRecordReward(getCurrentUserId(c), "sleep", body.wakeDate, "记录睡眠");
    log.info({ userId: getCurrentUserId(c), sleepDate: body.wakeDate }, "[sleep_record_saved]");
    return ok(c, { sleepDate: body.wakeDate, durationMinutes: values.durationMinutes, reward });
  });
