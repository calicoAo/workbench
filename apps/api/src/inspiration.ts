import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { inspirationTagLinks, inspirationTags, quickNotes, writingInspirations } from "./db/schema.js";
import { createQuickNoteInClient, lockQuickNote } from "./quick-note.js";
import { runMutation } from "./mutation-receipt.js";
import { requireProjectInClient } from "./projects.js";

export type InspirationTagInput = string;

export function normalizeTagName(value: string) {
  return value.normalize("NFKC").trim().replace(/^#+/u, "").trim().replace(/\s+/gu, " ");
}

export function normalizedTagIdentity(value: string) {
  return normalizeTagName(value).toLocaleLowerCase();
}

function duplicate(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY";
}

async function ensureTag(client: DatabaseClient, userId: number, rawName: string) {
  const name = normalizeTagName(rawName);
  if (!name || name.length > 120) throw new BusinessError(ErrorCode.PARAM_ERROR, "tag name is invalid", 400);
  const normalizedName = normalizedTagIdentity(name);
  try {
    const [result] = await client.insert(inspirationTags).values({ userId, name, normalizedName, createdAt: new Date(), updatedAt: new Date() });
    const [created] = await client.select().from(inspirationTags).where(eq(inspirationTags.id, result.insertId));
    return created;
  } catch (error) {
    if (!duplicate(error)) throw error;
    const [existing] = await client.select().from(inspirationTags).where(and(eq(inspirationTags.userId, userId), eq(inspirationTags.normalizedName, normalizedName))).for("update");
    if (!existing) throw new BusinessError(ErrorCode.CONFLICT, "tag creation race requires retry", 409);
    return existing;
  }
}

async function replaceTagLinks(client: DatabaseClient, userId: number, inspirationId: number, names: string[]) {
  const unique = [...new Map(names.map((name) => [normalizedTagIdentity(name), normalizeTagName(name)])).values()].filter(Boolean);
  const tags = [];
  for (const name of unique) tags.push(await ensureTag(client, userId, name));
  await client.delete(inspirationTagLinks).where(eq(inspirationTagLinks.inspirationId, inspirationId));
  if (tags.length) await client.insert(inspirationTagLinks).values(tags.map((tag) => ({ inspirationId, tagId: tag.id, createdAt: new Date() })));
  return tags;
}

async function inspirationById(client: DatabaseClient, userId: number, id: number, lock = false) {
  let query = client.select().from(writingInspirations).where(and(eq(writingInspirations.id, id), eq(writingInspirations.userId, userId)));
  if (lock) query = query.for("update") as typeof query;
  const [inspiration] = await query;
  if (!inspiration) throw new BusinessError(ErrorCode.NOT_FOUND, "inspiration not found", 404);
  return inspiration;
}

export async function createFromQuickNote(userId: number, noteId: number, operationId: string, tagNames: string[]) {
  return runMutation({ userId, operationId, commandType: "ADD_QUICK_NOTE_TO_INSPIRATION", request: { noteId, tagNames } }, async (tx) => {
    const note = await lockQuickNote(tx, userId, noteId);
    if (note.deletedAt) throw new BusinessError(ErrorCode.CONFLICT, "deleted quick note cannot enter inspiration library", 409);
    const [existing] = await tx.select().from(writingInspirations).where(and(eq(writingInspirations.userId, userId), eq(writingInspirations.quickNoteId, noteId))).for("update");
    let inspiration = existing;
    if (!inspiration) {
      const [result] = await tx.insert(writingInspirations).values({ userId, quickNoteId: noteId, favorite: 0, pinned: 0, archivedAt: null, version: 1, createdAt: new Date(), updatedAt: new Date() });
      inspiration = await inspirationById(tx, userId, Number(result.insertId));
    }
    const tags = existing && tagNames.length === 0
      ? (await detailInClient(tx, userId, inspiration.id)).tags
      : await replaceTagLinks(tx, userId, inspiration.id, tagNames);
    return { ...inspiration, tags };
  });
}

export async function createDirect(userId: number, input: { operationId: string; noteDate?: string; title?: string | null; content: string; projectId?: number | null; tagNames: string[] }) {
  return runMutation({ userId, operationId: input.operationId, commandType: "CREATE_WRITING_INSPIRATION", request: input }, async (tx) => {
    const note = await createQuickNoteInClient(tx, { userId, operationId: input.operationId, noteDate: input.noteDate, title: input.title, content: input.content, projectId: input.projectId });
    const now = new Date();
    const [result] = await tx.insert(writingInspirations).values({ userId, quickNoteId: note.id, favorite: 0, pinned: 0, archivedAt: null, version: 1, createdAt: now, updatedAt: now });
    const inspiration = await inspirationById(tx, userId, Number(result.insertId));
    const tags = await replaceTagLinks(tx, userId, inspiration.id, input.tagNames);
    return { ...inspiration, note, tags };
  });
}

export async function listInspirations(userId: number, filters: { state: "active" | "favorite" | "pinned" | "untagged" | "archived"; keyword?: string; tagNames: string[]; limit: number }) {
  const rows = await db.select({ inspiration: writingInspirations, note: quickNotes, tag: inspirationTags })
    .from(writingInspirations)
    .innerJoin(quickNotes, and(eq(quickNotes.id, writingInspirations.quickNoteId), eq(quickNotes.userId, userId)))
    .leftJoin(inspirationTagLinks, eq(inspirationTagLinks.inspirationId, writingInspirations.id))
    .leftJoin(inspirationTags, eq(inspirationTags.id, inspirationTagLinks.tagId))
    .where(and(eq(writingInspirations.userId, userId), isNull(quickNotes.deletedAt)))
    .orderBy(desc(writingInspirations.pinned), desc(writingInspirations.updatedAt), desc(writingInspirations.id));
  const grouped = new Map<number, { inspiration: typeof rows[number]["inspiration"]; note: typeof rows[number]["note"]; tags: Array<NonNullable<typeof rows[number]["tag"]>> }>();
  for (const row of rows) {
    const value = grouped.get(row.inspiration.id) ?? { inspiration: row.inspiration, note: row.note, tags: [] };
    if (row.tag && !value.tags.some((tag) => tag.id === row.tag!.id)) value.tags.push(row.tag);
    grouped.set(row.inspiration.id, value);
  }
  const normalizedFilters = filters.tagNames.map(normalizedTagIdentity);
  return [...grouped.values()].filter((item) => {
    const tagIdentities = new Set(item.tags.map((tag) => tag.normalizedName));
    if (filters.state === "active" && item.inspiration.archivedAt) return false;
    if (filters.state === "archived" && !item.inspiration.archivedAt) return false;
    if (filters.state === "favorite" && (!item.inspiration.favorite || item.inspiration.archivedAt)) return false;
    if (filters.state === "pinned" && (!item.inspiration.pinned || item.inspiration.archivedAt)) return false;
    if (filters.state === "untagged" && item.tags.length) return false;
    if (normalizedFilters.some((tag) => !tagIdentities.has(tag))) return false;
    const keyword = filters.keyword?.trim().toLocaleLowerCase();
    if (keyword && ![item.note.title ?? "", item.note.content, ...item.tags.map((tag) => tag.name)].some((value) => value.toLocaleLowerCase().includes(keyword))) return false;
    return true;
  }).slice(0, filters.limit).map((item) => ({ ...item.inspiration, note: item.note, tags: item.tags }));
}

export async function detail(userId: number, id: number) {
  const inspiration = await inspirationById(db, userId, id);
  const [note] = await db.select().from(quickNotes).where(and(eq(quickNotes.id, inspiration.quickNoteId), eq(quickNotes.userId, userId)));
  const links = await db.select({ tag: inspirationTags }).from(inspirationTagLinks).innerJoin(inspirationTags, eq(inspirationTags.id, inspirationTagLinks.tagId)).where(eq(inspirationTagLinks.inspirationId, id));
  return { ...inspiration, note, tags: links.map((link) => link.tag) };
}

export async function tagsForUser(userId: number) {
  const rows = await db.select({ tag: inspirationTags, usage: sql<number>`count(${inspirationTagLinks.inspirationId})` }).from(inspirationTags).leftJoin(inspirationTagLinks, eq(inspirationTagLinks.tagId, inspirationTags.id)).where(eq(inspirationTags.userId, userId)).groupBy(inspirationTags.id).orderBy(desc(sql`count(${inspirationTagLinks.inspirationId})`), desc(inspirationTags.updatedAt), asc(inspirationTags.name));
  return rows.map((row) => ({ ...row.tag, usageCount: Number(row.usage) }));
}

export async function createTag(userId: number, input: { operationId: string; name: string }) {
  return runMutation({ userId, operationId: input.operationId, commandType: "CREATE_INSPIRATION_TAG", request: { name: input.name } }, async (tx) => {
    return ensureTag(tx, userId, input.name);
  });
}

export async function updateInspiration(userId: number, id: number, input: { operationId: string; expectedVersion: number; noteExpectedVersion?: number; title?: string | null; content?: string; favorite?: boolean; pinned?: boolean; tagNames?: string[]; projectId?: number | null }) {
  return runMutation({ userId, operationId: input.operationId, commandType: "UPDATE_WRITING_INSPIRATION", request: { id, ...input } }, async (tx) => {
    const inspiration = await inspirationById(tx, userId, id, true);
    if (inspiration.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "inspiration version conflict", 409);
    const note = await lockQuickNote(tx, userId, inspiration.quickNoteId);
    if (input.noteExpectedVersion !== undefined && note.version !== input.noteExpectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "quick note version conflict", 409);
    if (input.title !== undefined || input.content !== undefined || input.projectId !== undefined) {
      if (input.projectId !== undefined && input.projectId !== null) await requireProjectInClient(tx, userId, input.projectId);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) patch.title = input.title?.trim() || null;
      if (input.content !== undefined) patch.content = input.content.trim();
      if (input.projectId !== undefined) patch.projectId = input.projectId;
      await tx.update(quickNotes).set({ ...patch, version: note.version + 1 }).where(eq(quickNotes.id, note.id));
    }
    await tx.update(writingInspirations).set({ favorite: input.favorite === undefined ? inspiration.favorite : input.favorite ? 1 : 0, pinned: input.pinned === undefined ? inspiration.pinned : input.pinned ? 1 : 0, version: inspiration.version + 1, updatedAt: new Date() }).where(eq(writingInspirations.id, id));
    const tags = input.tagNames ? await replaceTagLinks(tx, userId, id, input.tagNames) : (await detailInClient(tx, userId, id)).tags;
    return { ...(await inspirationById(tx, userId, id)), note: (await tx.select().from(quickNotes).where(eq(quickNotes.id, note.id)))[0], tags };
  });
}

async function detailInClient(client: DatabaseClient, userId: number, id: number) {
  const links = await client.select({ tag: inspirationTags }).from(inspirationTagLinks).innerJoin(inspirationTags, eq(inspirationTags.id, inspirationTagLinks.tagId)).where(eq(inspirationTagLinks.inspirationId, id));
  return { tags: links.map((link) => link.tag) };
}

export async function setArchive(userId: number, id: number, operationId: string, expectedVersion: number, archived: boolean) {
  return runMutation({ userId, operationId, commandType: archived ? "ARCHIVE_WRITING_INSPIRATION" : "UNARCHIVE_WRITING_INSPIRATION", request: { id, expectedVersion, archived } }, async (tx) => {
    const inspiration = await inspirationById(tx, userId, id, true);
    if (inspiration.version !== expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "inspiration version conflict", 409);
    await tx.update(writingInspirations).set({ archivedAt: archived ? new Date() : null, version: inspiration.version + 1, updatedAt: new Date() }).where(eq(writingInspirations.id, id));
    return inspirationById(tx, userId, id);
  });
}

export async function updateTag(userId: number, id: number, input: { operationId: string; name: string }) {
  return runMutation({ userId, operationId: input.operationId, commandType: "RENAME_INSPIRATION_TAG", request: { id, name: input.name } }, async (tx) => {
    await inspirationTagById(tx, userId, id, true);
    const name = normalizeTagName(input.name);
    if (!name) throw new BusinessError(ErrorCode.PARAM_ERROR, "tag name is invalid", 400);
    const normalizedName = normalizedTagIdentity(name);
    const [conflict] = await tx.select().from(inspirationTags).where(and(eq(inspirationTags.userId, userId), eq(inspirationTags.normalizedName, normalizedName)));
    if (conflict && conflict.id !== id) throw new BusinessError(ErrorCode.CONFLICT, "tag name is already used", 409);
    await tx.update(inspirationTags).set({ name, normalizedName, updatedAt: new Date() }).where(and(eq(inspirationTags.id, id), eq(inspirationTags.userId, userId)));
    return tx.select().from(inspirationTags).where(eq(inspirationTags.id, id)).then((rows) => rows[0]);
  });
}

export async function mergeTag(userId: number, sourceId: number, targetId: number, operationId: string) {
  return runMutation({ userId, operationId, commandType: "MERGE_INSPIRATION_TAG", request: { sourceId, targetId } }, async (tx) => {
    const [first, second] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
    const firstTag = await inspirationTagById(tx, userId, first, true);
    const secondTag = await inspirationTagById(tx, userId, second, true);
    const [source, target] = sourceId < targetId ? [firstTag, secondTag] : [secondTag, firstTag];
    if (!source || !target || source.id === target.id) throw new BusinessError(ErrorCode.PARAM_ERROR, "source and target tags are required", 400);
    const links = await tx.select().from(inspirationTagLinks).where(eq(inspirationTagLinks.tagId, source.id));
    for (const link of links) {
      try { await tx.insert(inspirationTagLinks).values({ inspirationId: link.inspirationId, tagId: target.id, createdAt: new Date() }); } catch (error) { if (!duplicate(error)) throw error; }
    }
    await tx.delete(inspirationTagLinks).where(eq(inspirationTagLinks.tagId, source.id));
    await tx.delete(inspirationTags).where(eq(inspirationTags.id, source.id));
    return { mergedTagId: target.id, removedTagId: source.id };
  });
}

async function inspirationTagById(client: DatabaseClient, userId: number, id: number, lock = false) {
  let query = client.select().from(inspirationTags).where(and(eq(inspirationTags.id, id), eq(inspirationTags.userId, userId)));
  if (lock) query = query.for("update") as typeof query;
  const [tag] = await query;
  if (!tag) throw new BusinessError(ErrorCode.NOT_FOUND, "tag not found", 404);
  return tag;
}

export async function deleteTag(userId: number, id: number, operationId: string) {
  return runMutation({ userId, operationId, commandType: "DELETE_INSPIRATION_TAG", request: { id } }, async (tx) => {
    await inspirationTagById(tx, userId, id, true);
    await tx.delete(inspirationTagLinks).where(eq(inspirationTagLinks.tagId, id));
    await tx.delete(inspirationTags).where(and(eq(inspirationTags.id, id), eq(inspirationTags.userId, userId)));
    return { id, deleted: true };
  });
}
