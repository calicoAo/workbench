import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { morningWritings } from "../db/schema.js";
import { ok } from "../http.js";
import { log } from "../logger.js";


const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const saveMorningWritingSchema = z.object({
  writingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string().max(10000).optional(),
  moodScore: z.number().int().min(1).max(5).optional()
});

export const morningWritingsRoute = new Hono()
  .get("/", async (c) => {
    const query = querySchema.parse(c.req.query());
    const [row] = await db
      .select()
      .from(morningWritings)
      .where(and(eq(morningWritings.userId, getCurrentUserId(c)), eq(morningWritings.writingDate, query.date), isNull(morningWritings.deletedAt)));

    return ok(c, row ?? null);
  })
  .get("/list", async (c) => {
    const query = listSchema.parse(c.req.query());
    const rows = await db
      .select()
      .from(morningWritings)
      .where(and(eq(morningWritings.userId, getCurrentUserId(c)), isNull(morningWritings.deletedAt)))
      .orderBy(desc(morningWritings.writingDate))
      .limit(query.limit);

    return ok(c, rows);
  })
  .post("/", async (c) => {
    const body = saveMorningWritingSchema.parse(await c.req.json());
    const now = new Date();
    const values = {
      userId: getCurrentUserId(c),
      writingDate: body.writingDate,
      content: body.content?.trim() || null,
      moodScore: body.moodScore ?? null,
      createdAt: now,
      updatedAt: now
    };

    await db
      .insert(morningWritings)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          content: values.content,
          moodScore: values.moodScore,
          updatedAt: now,
          deletedAt: null
        }
      });

    log.info({ userId: getCurrentUserId(c), writingDate: body.writingDate }, "[morning_writing_saved]");
    return ok(c, { writingDate: body.writingDate });
  });

