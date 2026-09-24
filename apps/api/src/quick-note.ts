import { and, desc, eq, isNull } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { quickNotes, users } from "./db/schema.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { runMutation } from "./mutation-receipt.js";
import { requireProjectInClient } from "./projects.js";
import { grantRewardInClient } from "./rewards.js";
import { businessDateAt } from "./time.js";

export type CreateQuickNoteCommand = {
  userId: number;
  operationId: string;
  noteDate?: string;
  title?: string | null;
  content: string;
  tag?: string | null;
  projectId?: number | null;
};

function normalizeOptional(value?: string | null) {
  return value?.trim() || null;
}

export async function createQuickNoteInClient(client: DatabaseClient, command: CreateQuickNoteCommand) {
  const request = {
    noteDate: command.noteDate ?? null,
    title: normalizeOptional(command.title),
    content: command.content.trim(),
    tag: normalizeOptional(command.tag),
    projectId: command.projectId ?? null
  };

    const [user] = await client
      .select({ timezone: users.timezone })
      .from(users)
      .where(and(eq(users.id, command.userId), isNull(users.deletedAt)));
    if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
    if (request.projectId) await requireProjectInClient(client, command.userId, request.projectId);

    const now = new Date();
    const noteDate = request.noteDate ?? businessDateAt(now, user.timezone);
    const [result] = await client.insert(quickNotes).values({
      userId: command.userId,
      noteDate,
      recordTimezone: user.timezone,
      title: request.title,
      content: request.content,
      tag: request.tag,
      projectId: request.projectId,
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    const [note] = await client
      .select()
      .from(quickNotes)
      .where(and(eq(quickNotes.id, result.insertId), eq(quickNotes.userId, command.userId)));
    if (!note) throw new BusinessError(ErrorCode.SERVER_ERROR, "quick note insert is unavailable", 500);

    const reward = await grantRewardInClient(client, {
      userId: command.userId,
      eventKey: `quick_note:${command.userId}:${note.id}`,
      sourceType: "quick_note",
      sourceId: String(note.id),
      eventDate: noteDate,
      xp: 6,
      coins: 2,
      reason: "记录随手记"
    });
    return { ...note, reward };
}

export function createQuickNote(command: CreateQuickNoteCommand) {
  const request = {
    noteDate: command.noteDate ?? null,
    title: normalizeOptional(command.title),
    content: command.content.trim(),
    tag: normalizeOptional(command.tag),
    projectId: command.projectId ?? null
  };
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "CREATE_QUICK_NOTE",
    request
  }, (tx) => createQuickNoteInClient(tx, command));
}

export async function lockQuickNote(client: DatabaseClient, userId: number, id: number) {
  const [note] = await client
    .select()
    .from(quickNotes)
    .where(and(eq(quickNotes.id, id), eq(quickNotes.userId, userId)))
    .for("update");
  if (!note) throw new BusinessError(ErrorCode.NOT_FOUND, "quick note not found", 404);
  return note;
}

export function assertQuickNoteVersion(note: { version: number }, expectedVersion: number) {
  if (note.version !== expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "quick note version conflict", 409);
}

export function restoreQuickNote(command: { userId: number; operationId: string; noteId: number; expectedVersion: number }) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "RESTORE_QUICK_NOTE",
    request: { noteId: command.noteId, expectedVersion: command.expectedVersion }
  }, async (tx) => {
    const note = await lockQuickNote(tx, command.userId, command.noteId);
    assertQuickNoteVersion(note, command.expectedVersion);
    if (!note.deletedAt) throw new BusinessError(ErrorCode.CONFLICT, "quick note is not deleted", 409);
    const now = new Date();
    await tx.update(quickNotes).set({ deletedAt: null, version: note.version + 1, updatedAt: now }).where(and(eq(quickNotes.id, note.id), eq(quickNotes.userId, command.userId)));
    const [restored] = await tx.select().from(quickNotes).where(and(eq(quickNotes.id, note.id), eq(quickNotes.userId, command.userId)));
    if (!restored) throw new BusinessError(ErrorCode.SERVER_ERROR, "restored quick note is unavailable", 500);
    return restored;
  });
}

export async function projectMaterialsForUser(userId: number, projectId: number) {
  const rows = await db.select({
    id: quickNotes.id,
    title: quickNotes.title,
    content: quickNotes.content,
    noteDate: quickNotes.noteDate,
    tag: quickNotes.tag,
    archivedAt: quickNotes.archivedAt,
    updatedAt: quickNotes.updatedAt
  }).from(quickNotes).where(and(eq(quickNotes.userId, userId), eq(quickNotes.projectId, projectId), isNull(quickNotes.deletedAt))).orderBy(desc(quickNotes.noteDate), desc(quickNotes.updatedAt), desc(quickNotes.id));
  return rows.map((note) => ({
    id: note.id,
    title: note.title?.trim() || note.content.trim().split(/\r?\n/, 1)[0].slice(0, 100) || "未命名随手记",
    excerpt: note.content.replace(/\s+/g, " ").trim().slice(0, 160),
    noteDate: note.noteDate,
    tag: note.tag,
    archivedAt: note.archivedAt,
    deepLink: `/notes/${note.id}?date=${note.noteDate}`
  }));
}
