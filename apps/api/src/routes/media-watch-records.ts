import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { mediaWatchRecords } from "../db/schema.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { grantRecordReward } from "../rewards.js";


const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const saveMediaWatchSchema = z.object({
  watchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().max(200).optional().nullable(),
  episode: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable()
});

function emptyToNull(value?: string | null) {
  return value?.trim() || null;
}

export const mediaWatchRecordsRoute = new Hono()
  .get("/", async (c) => {
    const query = querySchema.parse(c.req.query());
    const [row] = await db
      .select()
      .from(mediaWatchRecords)
      .where(and(eq(mediaWatchRecords.userId, getCurrentUserId(c)), eq(mediaWatchRecords.watchDate, query.date), isNull(mediaWatchRecords.deletedAt)));

    return ok(c, row ?? { watchDate: query.date, title: null, episode: null, note: null });
  })
  .get("/list", async (c) => {
    const query = listSchema.parse(c.req.query());
    const rows = await db
      .select()
      .from(mediaWatchRecords)
      .where(
        and(
          eq(mediaWatchRecords.userId, getCurrentUserId(c)),
          isNull(mediaWatchRecords.deletedAt),
          or(isNotNull(mediaWatchRecords.title), isNotNull(mediaWatchRecords.episode), isNotNull(mediaWatchRecords.note))
        )
      )
      .orderBy(desc(mediaWatchRecords.watchDate))
      .limit(query.limit);

    return ok(c, rows);
  })
  .post("/", async (c) => {
    const body = saveMediaWatchSchema.parse(await c.req.json());
    const now = new Date();
    const values = {
      userId: getCurrentUserId(c),
      watchDate: body.watchDate,
      title: emptyToNull(body.title),
      episode: emptyToNull(body.episode),
      note: emptyToNull(body.note),
      createdAt: now,
      updatedAt: now
    };

    if (!values.title && !values.episode && !values.note) {
      await db.delete(mediaWatchRecords).where(and(eq(mediaWatchRecords.userId, getCurrentUserId(c)), eq(mediaWatchRecords.watchDate, body.watchDate)));
      log.info({ userId: getCurrentUserId(c), watchDate: body.watchDate }, "[media_watch_record_deleted]");
      return ok(c, { watchDate: body.watchDate, title: null, episode: null, note: null });
    }

    await db
      .insert(mediaWatchRecords)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          title: values.title,
          episode: values.episode,
          note: values.note,
          updatedAt: now,
          deletedAt: null
        }
      });

    const reward = await grantRecordReward(getCurrentUserId(c), "media", body.watchDate, "记录影视陪伴");
    log.info({ userId: getCurrentUserId(c), watchDate: body.watchDate, title: values.title }, "[media_watch_record_saved]");
    return ok(c, { watchDate: body.watchDate, title: values.title, episode: values.episode, note: values.note, reward });
  });

