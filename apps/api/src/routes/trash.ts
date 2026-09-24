import { and, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { quickNotes } from "../db/schema.js";
import { ok } from "../http.js";
import { restoreQuickNote } from "../quick-note.js";

const typeSchema = z.enum(["all", "quick_note"]);
const querySchema = z.object({
  type: typeSchema.default("all"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
const restoreSchema = z.object({ operationId: z.string().uuid(), expectedVersion: z.number().int().positive() });
type Cursor = { deletedAt: string; id: number };

function encodeCursor(value: Cursor) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    const deletedAt = new Date(parsed.deletedAt);
    if (!Number.isInteger(parsed.id) || parsed.id <= 0 || Number.isNaN(deletedAt.getTime())) throw new Error("invalid cursor");
    return { id: parsed.id, deletedAt };
  } catch {
    throw new z.ZodError([{ code: "custom", path: ["cursor"], message: "invalid cursor" }]);
  }
}

export const trashRoute = new Hono()
  .get("/", async (c) => {
    const query = querySchema.parse(c.req.query());
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const conditions = [eq(quickNotes.userId, getCurrentUserId(c)), isNotNull(quickNotes.deletedAt)];
    if (cursor) conditions.push(or(lt(quickNotes.deletedAt, cursor.deletedAt), and(eq(quickNotes.deletedAt, cursor.deletedAt), lt(quickNotes.id, cursor.id)))!);
    const rows = await db.select({
      id: quickNotes.id,
      title: quickNotes.title,
      excerpt: sql<string>`left(replace(replace(${quickNotes.content}, char(13), ' '), char(10), ' '), 160)`,
      noteDate: quickNotes.noteDate,
      tag: quickNotes.tag,
      projectId: quickNotes.projectId,
      version: quickNotes.version,
      deletedAt: quickNotes.deletedAt
    }).from(quickNotes).where(and(...conditions)).orderBy(desc(quickNotes.deletedAt), desc(quickNotes.id)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return ok(c, {
      items: page.map((row) => ({ type: "quick_note" as const, ...row, title: row.title?.trim() || row.excerpt.slice(0, 100) || "未命名随手记", restoreDeepLink: `/notes/${row.id}?date=${row.noteDate}` })),
      nextCursor: rows.length > query.limit && last?.deletedAt ? encodeCursor({ deletedAt: last.deletedAt.toISOString(), id: last.id }) : null,
      supportedTypes: ["quick_note"]
    });
  })
  .post("/:type/:id/restore", async (c) => {
    const type = z.literal("quick_note").parse(c.req.param("type"));
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = restoreSchema.parse(await c.req.json());
    const restored = await restoreQuickNote({ userId: getCurrentUserId(c), noteId: id, ...body });
    return ok(c, { type, id: restored.id, version: restored.version, restoredAt: restored.updatedAt });
  });
