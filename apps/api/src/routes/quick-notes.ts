import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { quickNotes } from "../db/schema.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { grantReward } from "../rewards.js";

const listSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const saveQuickNoteSchema = z.object({
  noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().max(120).optional().nullable(),
  content: z.string().trim().min(1).max(5000),
  tag: z.string().trim().max(64).optional().nullable()
});

export const quickNotesRoute = new Hono()
  .get("/", async (c) => {
    const query = listSchema.parse(c.req.query());
    const userId = getCurrentUserId(c);
    const where = query.date
      ? and(eq(quickNotes.userId, userId), eq(quickNotes.noteDate, query.date), isNull(quickNotes.deletedAt))
      : and(eq(quickNotes.userId, userId), isNull(quickNotes.deletedAt));
    const rows = await db.select().from(quickNotes).where(where).orderBy(desc(quickNotes.createdAt)).limit(query.limit);
    return ok(c, rows);
  })
  .post("/", async (c) => {
    const body = saveQuickNoteSchema.parse(await c.req.json());
    const now = new Date();
    const userId = getCurrentUserId(c);
    const values = {
      userId,
      noteDate: body.noteDate,
      title: body.title?.trim() || null,
      content: body.content.trim(),
      tag: body.tag?.trim() || null,
      createdAt: now,
      updatedAt: now
    };

    const [result] = await db.insert(quickNotes).values(values);
    const [row] = await db.select().from(quickNotes).where(and(eq(quickNotes.id, result.insertId), eq(quickNotes.userId, userId)));
    const reward = await grantReward({
      userId,
      eventKey: `quick_note:${userId}:${result.insertId}`,
      sourceType: "quick_note",
      sourceId: String(result.insertId),
      eventDate: body.noteDate,
      xp: 6,
      coins: 2,
      reason: "记录随手记"
    });
    log.info({ userId, noteDate: body.noteDate, quickNoteId: result.insertId }, "[quick_note_saved]");
    return ok(c, { ...row, reward });
  })
  .delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new z.ZodError([{ code: "custom", path: ["id"], message: "id must be a positive integer" }]);
    }

    const userId = getCurrentUserId(c);
    await db.delete(quickNotes).where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)));
    log.info({ userId, id }, "[quick_note_deleted]");
    return ok(c, null);
  });
