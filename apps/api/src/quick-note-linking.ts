import { and, eq } from "drizzle-orm";
import { quickNotes, quickNoteTaskLinks, tasks } from "./db/schema.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { runMutation } from "./mutation-receipt.js";
import { publishTaskInClient } from "./task-publishing.js";

export type ConvertQuickNoteCommand = {
  userId: number;
  noteId: number;
  operationId: string;
  title: string;
  description: string;
  categoryId?: number;
  priority: 1 | 2 | 3;
  difficulty: 1 | 2 | 3 | 4;
  estimatedMinutes?: number;
  dueAt?: Date;
  acceptDate?: string;
  recordTimezone: string;
};

export function convertQuickNoteToTask(command: ConvertQuickNoteCommand) {
  const request = {
    noteId: command.noteId,
    title: command.title.trim(),
    description: command.description.trim(),
    categoryId: command.categoryId ?? null,
    priority: command.priority,
    difficulty: command.difficulty,
    estimatedMinutes: command.estimatedMinutes ?? null,
    dueAt: command.dueAt?.toISOString() ?? null,
    acceptDate: command.acceptDate ?? null,
    recordTimezone: command.recordTimezone
  };
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: command.acceptDate ? "CONVERT_QUICK_NOTE_AND_ACCEPT_TASK" : "CONVERT_QUICK_NOTE_TO_TASK",
    request
  }, async (tx) => {
    const [note] = await tx.select().from(quickNotes).where(and(eq(quickNotes.id, command.noteId), eq(quickNotes.userId, command.userId))).for("update");
    if (!note) throw new BusinessError(ErrorCode.NOT_FOUND, "quick note not found", 404);
    if (note.deletedAt) throw new BusinessError(ErrorCode.CONFLICT, "deleted quick note cannot be converted", 409);
    const [existing] = await tx.select().from(quickNoteTaskLinks).where(and(eq(quickNoteTaskLinks.userId, command.userId), eq(quickNoteTaskLinks.quickNoteId, command.noteId))).for("update");
    if (existing) throw new BusinessError(ErrorCode.CONFLICT, "quick note is already linked to a task", 409);

    const published = await publishTaskInClient(tx, { ...command, progressPercent: 0 });
    const now = new Date();
    const [linkResult] = await tx.insert(quickNoteTaskLinks).values({ userId: command.userId, quickNoteId: command.noteId, taskId: published.id, createdAt: now });
    const [task] = await tx.select().from(tasks).where(and(eq(tasks.id, published.id), eq(tasks.userId, command.userId)));
    return { ...published, linkId: linkResult.insertId, task, source: { type: "QUICK_NOTE" as const, id: command.noteId } };
  });
}
