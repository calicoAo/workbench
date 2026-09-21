import { and, eq, isNull } from "drizzle-orm";
import { type DatabaseClient } from "./db/index.js";
import { quickNotes, users } from "./db/schema.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { runMutation } from "./mutation-receipt.js";
import { grantRewardInClient } from "./rewards.js";
import { businessDateAt } from "./time.js";

export type CreateQuickNoteCommand = {
  userId: number;
  operationId: string;
  noteDate?: string;
  title?: string | null;
  content: string;
  tag?: string | null;
};

function normalizeOptional(value?: string | null) {
  return value?.trim() || null;
}

export function createQuickNote(command: CreateQuickNoteCommand) {
  const request = {
    noteDate: command.noteDate ?? null,
    title: normalizeOptional(command.title),
    content: command.content.trim(),
    tag: normalizeOptional(command.tag)
  };

  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: "CREATE_QUICK_NOTE",
    request
  }, async (tx) => {
    const [user] = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(and(eq(users.id, command.userId), isNull(users.deletedAt)));
    if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);

    const now = new Date();
    const noteDate = request.noteDate ?? businessDateAt(now, user.timezone);
    const [result] = await tx.insert(quickNotes).values({
      userId: command.userId,
      noteDate,
      recordTimezone: user.timezone,
      title: request.title,
      content: request.content,
      tag: request.tag,
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    const [note] = await tx
      .select()
      .from(quickNotes)
      .where(and(eq(quickNotes.id, result.insertId), eq(quickNotes.userId, command.userId)));
    if (!note) throw new BusinessError(ErrorCode.SERVER_ERROR, "quick note insert is unavailable", 500);

    const reward = await grantRewardInClient(tx, {
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
  });
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
