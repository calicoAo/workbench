import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { journals, libraryItemRelations, libraryItems, quickNotes, writingInspirations } from "./db/schema.js";
import { BusinessError, ErrorCode } from "./errors.js";

export const LIBRARY_TYPES = ["BOOK", "MOVIE", "SERIES", "GAME"] as const;
export const LIBRARY_STATUSES = ["WANT", "IN_PROGRESS", "FINISHED", "DROPPED"] as const;
export const LIBRARY_RELATION_TYPES = ["QUICK_NOTE", "JOURNAL", "INSPIRATION"] as const;
export type LibraryType = (typeof LIBRARY_TYPES)[number];
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];
export type LibraryRelationType = (typeof LIBRARY_RELATION_TYPES)[number];

export async function listLibraryItems(userId: number, query: { type?: LibraryType; status?: LibraryStatus; q?: string }) {
  const clauses = [eq(libraryItems.userId, userId)];
  if (query.type) clauses.push(eq(libraryItems.type, query.type));
  if (query.status) clauses.push(eq(libraryItems.status, query.status));
  if (query.q) {
    const term = `%${query.q}%`;
    clauses.push(or(like(libraryItems.title, term), like(libraryItems.originalTitle, term), like(libraryItems.creator, term))!);
  }
  return db
    .select({
      item: libraryItems,
      relationCount: sql<number>`(select count(*) from library_item_relations r where r.user_id = ${userId} and r.library_item_id = ${libraryItems.id})`,
    })
    .from(libraryItems)
    .where(and(...clauses))
    .orderBy(desc(libraryItems.updatedAt))
    .then((rows) =>
      rows.map((row) => ({
        ...row.item,
        relationCount: Number(row.relationCount),
      })),
    );
}

async function requireLibraryItem(userId: number, id: number) {
  const [item] = await db
    .select()
    .from(libraryItems)
    .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, id)));
  if (!item) throw new BusinessError(ErrorCode.NOT_FOUND, "library item not found", 404);
  return item;
}

export async function libraryItemDetail(userId: number, id: number) {
  const item = await requireLibraryItem(userId, id);
  const rows = await db
    .select()
    .from(libraryItemRelations)
    .where(and(eq(libraryItemRelations.userId, userId), eq(libraryItemRelations.libraryItemId, id)))
    .orderBy(desc(libraryItemRelations.createdAt));
  const relations = await Promise.all(
    rows.map(async (relation) => ({
      ...relation,
      summary: await relationSummary(userId, relation.targetType as LibraryRelationType, relation.targetId),
    })),
  );
  return { item, relations };
}

async function relationSummary(userId: number, type: LibraryRelationType, targetId: number) {
  if (type === "QUICK_NOTE") {
    const [row] = await db
      .select({ title: quickNotes.title, date: quickNotes.noteDate })
      .from(quickNotes)
      .where(and(eq(quickNotes.userId, userId), eq(quickNotes.id, targetId), isNull(quickNotes.deletedAt)));
    return row
      ? {
          title: row.title || "随手记",
          date: row.date,
          deepLink: `/notes/${targetId}?date=${row.date}`,
        }
      : null;
  }
  if (type === "JOURNAL") {
    const [row] = await db
      .select({ date: journals.journalDate })
      .from(journals)
      .where(and(eq(journals.userId, userId), eq(journals.id, targetId), isNull(journals.deletedAt)));
    return row
      ? {
          title: `日记 · ${row.date}`,
          date: row.date,
          deepLink: `/journal?date=${row.date}`,
        }
      : null;
  }
  const [row] = await db
    .select({ title: quickNotes.title, date: quickNotes.noteDate })
    .from(writingInspirations)
    .innerJoin(quickNotes, and(eq(writingInspirations.quickNoteId, quickNotes.id), eq(quickNotes.userId, userId), isNull(quickNotes.deletedAt)))
    .where(and(eq(writingInspirations.userId, userId), eq(writingInspirations.id, targetId)));
  return row
    ? {
        title: row.title || "灵感",
        date: row.date,
        deepLink: `/inspirations?date=${row.date}`,
      }
    : null;
}

export async function createLibraryItem(userId: number, input: Omit<typeof libraryItems.$inferInsert, "id" | "userId" | "version" | "createdAt" | "updatedAt">) {
  const now = new Date();
  const [result] = await db.insert(libraryItems).values({ ...input, userId, version: 1, createdAt: now, updatedAt: now });
  return (await libraryItemDetail(userId, result.insertId)).item;
}

export async function updateLibraryItem(userId: number, id: number, expectedVersion: number, values: Partial<Omit<typeof libraryItems.$inferInsert, "id" | "userId" | "version" | "createdAt" | "updatedAt">>) {
  const item = await requireLibraryItem(userId, id);
  if (item.version !== expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "library item version conflict", 409);
  const startedOn = values.startedOn === undefined ? item.startedOn : values.startedOn;
  const finishedOn = values.finishedOn === undefined ? item.finishedOn : values.finishedOn;
  if (startedOn && finishedOn && finishedOn < startedOn) throw new BusinessError(ErrorCode.PARAM_ERROR, "finished date must not precede started date");
  const version = expectedVersion + 1;
  const result = await db
    .update(libraryItems)
    .set({ ...values, version, updatedAt: new Date() })
    .where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId), eq(libraryItems.version, expectedVersion)));
  if (!result[0].affectedRows) throw new BusinessError(ErrorCode.CONFLICT, "library item version conflict", 409);
  return (await libraryItemDetail(userId, id)).item;
}

export async function addLibraryRelation(userId: number, itemId: number, targetType: LibraryRelationType, targetId: number) {
  await requireLibraryItem(userId, itemId);
  if (!(await relationSummary(userId, targetType, targetId))) throw new BusinessError(ErrorCode.NOT_FOUND, "notebook reference not found", 404);
  await db
    .insert(libraryItemRelations)
    .values({
      userId,
      libraryItemId: itemId,
      targetType,
      targetId,
      createdAt: new Date(),
    })
    .onDuplicateKeyUpdate({ set: { targetId } });
  return libraryItemDetail(userId, itemId);
}

export async function finishedLibrarySource(userId: number) {
  const [item] = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(and(eq(libraryItems.userId, userId), eq(libraryItems.status, "FINISHED")))
    .orderBy(libraryItems.finishedOn)
    .limit(1);
  return item ?? null;
}
export async function libraryReferenceAvailable(userId: number, id: number) {
  const [row] = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, id)));
  return Boolean(row);
}
