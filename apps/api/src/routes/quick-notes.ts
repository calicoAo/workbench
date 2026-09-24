import { and, desc, eq, isNotNull, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { projects, quickNotes, quickNoteTaskLinks, tasks } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { assertQuickNoteVersion, createQuickNote, lockQuickNote, restoreQuickNote } from "../quick-note.js";
import { convertQuickNoteToTask } from "../quick-note-linking.js";
import { createFromQuickNote } from "../inspiration.js";
import { requireProjectInClient } from "../projects.js";
import { isValidTimezone, localDateTimeToUtc } from "../time.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positiveId = z.coerce.number().int().positive();

const listSchema = z.object({
  cursor: z.string().min(1).optional(),
  from: date.optional(),
  to: date.optional(),
  tag: z.string().trim().max(64).optional(),
  keyword: z.string().trim().max(120).optional(),
  state: z.enum(["active", "archived", "deleted"]).default("active"),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).refine((value) => !value.from || !value.to || value.from <= value.to, { path: ["to"], message: "to must not be before from" });

const createSchema = z.object({
  operationId: z.string().uuid(),
  noteDate: date.optional(),
  title: z.string().trim().max(120).optional().nullable(),
  content: z.string().trim().min(1).max(5000),
  tag: z.string().trim().max(64).optional().nullable(),
  projectId: z.number().int().positive().optional().nullable()
});

const updateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  noteDate: date.optional(),
  title: z.string().trim().max(120).optional().nullable(),
  content: z.string().trim().min(1).max(5000).optional(),
  tag: z.string().trim().max(64).optional().nullable(),
  projectId: z.number().int().positive().optional().nullable()
}).refine((value) => [value.noteDate, value.title, value.content, value.tag, value.projectId].some((item) => item !== undefined), { message: "at least one editable field is required" });

const versionSchema = z.object({ expectedVersion: z.number().int().positive() });
const restoreSchema = versionSchema.extend({ operationId: z.string().uuid() });
const convertSchema = z.object({
  operationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  categoryId: z.number().int().positive().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(2),
  estimatedMinutes: z.number().int().positive().optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  acceptDate: date.optional(),
  recordTimezone: z.string().refine(isValidTimezone)
});

type Cursor = { createdAt: string; id: number };

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string): { createdAt: Date; id: number } {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isInteger(parsed.id) || parsed.id <= 0 || Number.isNaN(createdAt.getTime())) throw new Error("invalid cursor");
    return { createdAt, id: parsed.id };
  } catch {
    throw new z.ZodError([{ code: "custom", path: ["cursor"], message: "invalid cursor" }]);
  }
}

function noteId(value: string) {
  return positiveId.parse(value);
}

function normalized(value?: string | null) {
  return value?.trim() || null;
}

async function mutateNote(userId: number, id: number, expectedVersion: number, action: "edit" | "archive" | "unarchive" | "delete", values: Record<string, unknown> = {}) {
  return db.transaction(async (tx) => {
    const note = await lockQuickNote(tx, userId, id);
    assertQuickNoteVersion(note, expectedVersion);
    if (note.deletedAt) throw new BusinessError(ErrorCode.CONFLICT, "quick note is deleted", 409);
    if (action === "archive" && note.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "quick note is already archived", 409);
    if (action === "unarchive" && !note.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "quick note is not archived", 409);
    if ("projectId" in values && values.projectId !== note.projectId && values.projectId !== null) await requireProjectInClient(tx, userId, Number(values.projectId));

    const now = new Date();
    await tx.update(quickNotes).set({ ...values, version: note.version + 1, updatedAt: now }).where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)));
    const [updated] = await tx.select().from(quickNotes).where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)));
    return updated;
  });
}

export const quickNotesRoute = new Hono()
  .get("/", async (c) => {
    const query = listSchema.parse(c.req.query());
    const userId = getCurrentUserId(c);
    const conditions: SQL[] = [eq(quickNotes.userId, userId)];
    if (query.state === "active") conditions.push(isNull(quickNotes.deletedAt), isNull(quickNotes.archivedAt));
    if (query.state === "archived") conditions.push(isNull(quickNotes.deletedAt), isNotNull(quickNotes.archivedAt));
    if (query.state === "deleted") conditions.push(isNotNull(quickNotes.deletedAt));
    if (query.from) conditions.push(sql`${quickNotes.noteDate} >= ${query.from}`);
    if (query.to) conditions.push(sql`${quickNotes.noteDate} <= ${query.to}`);
    if (query.tag) conditions.push(eq(quickNotes.tag, query.tag));
    if (query.keyword) conditions.push(or(like(quickNotes.title, `%${query.keyword}%`), like(quickNotes.content, `%${query.keyword}%`))!);
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      conditions.push(or(lt(quickNotes.createdAt, cursor.createdAt), and(eq(quickNotes.createdAt, cursor.createdAt), lt(quickNotes.id, cursor.id)))!);
    }

    const rows = await db.select().from(quickNotes).where(and(...conditions)).orderBy(desc(quickNotes.createdAt), desc(quickNotes.id)).limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return ok(c, {
      items,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null
    });
  })
  .get("/:id", async (c) => {
    const id = noteId(c.req.param("id"));
    const [note] = await db.select().from(quickNotes).where(and(eq(quickNotes.id, id), eq(quickNotes.userId, getCurrentUserId(c))));
    if (!note) throw new BusinessError(ErrorCode.NOT_FOUND, "quick note not found", 404);
    const [link] = await db.select().from(quickNoteTaskLinks).where(and(eq(quickNoteTaskLinks.userId, getCurrentUserId(c)), eq(quickNoteTaskLinks.quickNoteId, id)));
    const [linkedTask] = link ? await db.select({ id: tasks.id, title: tasks.title, status: tasks.status, deletedAt: tasks.deletedAt }).from(tasks).where(and(eq(tasks.id, link.taskId), eq(tasks.userId, getCurrentUserId(c)))) : [];
    const [linkedProject] = note.projectId ? await db.select({ id: projects.id, name: projects.name, status: projects.status, archivedAt: projects.archivedAt }).from(projects).where(and(eq(projects.id, note.projectId), eq(projects.userId, getCurrentUserId(c)))) : [];
    return ok(c, { ...note, linkedTask: linkedTask ?? null, linkedProject: linkedProject ?? null });
  })
  .post("/", async (c) => {
    const body = createSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const result = await createQuickNote({ userId, ...body });
    log.info({ userId, quickNoteId: result.id, noteDate: result.noteDate }, "[quick_note_created]");
    return ok(c, result);
  })
  .post("/:id/convert-to-task", async (c) => {
    const id = noteId(c.req.param("id"));
    const body = convertSchema.parse(await c.req.json());
    const result = await convertQuickNoteToTask({
      ...body,
      userId: getCurrentUserId(c),
      noteId: id,
      dueAt: body.dueAt ? localDateTimeToUtc(body.dueAt.slice(0, 10), body.dueAt.slice(11), body.recordTimezone) : undefined
    });
    log.info({ userId: getCurrentUserId(c), noteId: id, taskId: result.id }, "[quick_note_converted_to_task]");
    return ok(c, result);
  })
  .post("/:id/inspiration", async (c) => {
    const body = z.object({ operationId: z.string().uuid(), tagNames: z.array(z.string().trim().min(1).max(120)).max(32).default([]) }).parse(await c.req.json());
    return ok(c, await createFromQuickNote(getCurrentUserId(c), noteId(c.req.param("id")), body.operationId, body.tagNames));
  })
  .put("/:id", async (c) => {
    const id = noteId(c.req.param("id"));
    const body = updateSchema.parse(await c.req.json());
    const values: Record<string, unknown> = {};
    if (body.noteDate !== undefined) values.noteDate = body.noteDate;
    if (body.title !== undefined) values.title = normalized(body.title);
    if (body.content !== undefined) values.content = body.content.trim();
    if (body.tag !== undefined) values.tag = normalized(body.tag);
    if (body.projectId !== undefined) values.projectId = body.projectId;
    const note = await mutateNote(getCurrentUserId(c), id, body.expectedVersion, "edit", values);
    log.info({ userId: getCurrentUserId(c), id }, "[quick_note_updated]");
    return ok(c, note);
  })
  .post("/:id/archive", async (c) => {
    const id = noteId(c.req.param("id"));
    const body = versionSchema.parse(await c.req.json());
    return ok(c, await mutateNote(getCurrentUserId(c), id, body.expectedVersion, "archive", { archivedAt: new Date() }));
  })
  .post("/:id/unarchive", async (c) => {
    const id = noteId(c.req.param("id"));
    const body = versionSchema.parse(await c.req.json());
    return ok(c, await mutateNote(getCurrentUserId(c), id, body.expectedVersion, "unarchive", { archivedAt: null }));
  })
  .delete("/:id", async (c) => {
    const id = noteId(c.req.param("id"));
    const body = versionSchema.parse(await c.req.json());
    const note = await mutateNote(getCurrentUserId(c), id, body.expectedVersion, "delete", { deletedAt: new Date() });
    log.info({ userId: getCurrentUserId(c), id }, "[quick_note_soft_deleted]");
    return ok(c, note);
  })
  .post("/:id/restore", async (c) => {
    const id = noteId(c.req.param("id"));
    const body = restoreSchema.parse(await c.req.json());
    const note = await restoreQuickNote({ userId: getCurrentUserId(c), noteId: id, ...body });
    log.info({ userId: getCurrentUserId(c), id }, "[quick_note_restored]");
    return ok(c, note);
  });
