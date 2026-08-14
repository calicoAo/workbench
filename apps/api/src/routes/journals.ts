import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { journals } from "../db/schema.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { grantRecordReward } from "../rewards.js";


const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const saveJournalSchema = z.object({
  journalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string().max(10000).optional(),
  moodScore: z.number().int().min(1).max(5).optional()
});

export const journalsRoute = new Hono()
  .get("/", async (c) => {
    const query = querySchema.parse(c.req.query());
    const [row] = await db
      .select()
      .from(journals)
      .where(and(eq(journals.userId, getCurrentUserId(c)), eq(journals.journalDate, query.date), isNull(journals.deletedAt)));

    return ok(c, row ?? null);
  })
  .get("/list", async (c) => {
    const query = listSchema.parse(c.req.query());
    const rows = await db
      .select()
      .from(journals)
      .where(and(eq(journals.userId, getCurrentUserId(c)), isNull(journals.deletedAt)))
      .orderBy(desc(journals.journalDate))
      .limit(query.limit);

    return ok(c, rows);
  })
  .post("/", async (c) => {
    const body = saveJournalSchema.parse(await c.req.json());
    const now = new Date();
    const values = {
      userId: getCurrentUserId(c),
      journalDate: body.journalDate,
      content: body.content?.trim() || null,
      moodScore: body.moodScore ?? null,
      createdAt: now,
      updatedAt: now
    };

    await db
      .insert(journals)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          content: values.content,
          moodScore: values.moodScore,
          updatedAt: now,
          deletedAt: null
        }
      });

    const reward = values.content ? await grantRecordReward(getCurrentUserId(c), "journal", body.journalDate, "完成睡前日记") : null;
    log.info({ userId: getCurrentUserId(c), journalDate: body.journalDate }, "[journal_saved]");
    return ok(c, { journalDate: body.journalDate, reward });
  });

