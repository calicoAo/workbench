import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { type DatabaseClient } from "./db/index.js";
import { tasks, timerSessions, userExecutionSlots } from "./db/schema.js";
import { TaskStatus, TimerSessionModel, TimerStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";

export async function lockExecutionSlot(client: DatabaseClient, userId: number) {
  const [slot] = await client.select().from(userExecutionSlots).where(eq(userExecutionSlots.userId, userId)).for("update");
  if (!slot) throw new BusinessError(ErrorCode.CONFLICT, "execution slot requires repair", 409);
  return slot;
}

export function requireEmptySlot(slot: { activeSessionId: number | null }) {
  if (slot.activeSessionId !== null) throw new BusinessError(ErrorCode.CONFLICT, "another session is active", 409);
}

// Completion callers hold the receipt, slot and target Task locks first.
// The slot serializes execution commands, so inspecting the occupying Task needs
// no additional Task lock after locking its Session.
export async function requireTaskCompletionRelation(client: DatabaseClient, userId: number, slot: { activeSessionId: number | null }, targetTaskId: number) {
  const sessions = await client.select().from(timerSessions).where(or(
    and(eq(timerSessions.userId, userId), eq(timerSessions.sessionModel, TimerSessionModel.VNEXT), inArray(timerSessions.status, [TimerStatus.RUNNING, TimerStatus.PAUSED]), isNull(timerSessions.deletedAt)),
    slot.activeSessionId === null ? undefined : eq(timerSessions.id, slot.activeSessionId)
  )).for("update");
  const repair = () => { throw new BusinessError(ErrorCode.CONFLICT, "execution slot and session/task are inconsistent; repair required", 409); };
  if (slot.activeSessionId === null) {
    if (sessions.length) repair();
    return;
  }
  const session = sessions[0];
  if (sessions.length !== 1 || !session || session.id !== slot.activeSessionId || session.userId !== userId || session.sessionModel !== TimerSessionModel.VNEXT || session.deletedAt || (session.status !== TimerStatus.RUNNING && session.status !== TimerStatus.PAUSED)) repair();
  const [task] = await client.select().from(tasks).where(eq(tasks.id, session.taskId));
  if (!task || task.userId !== userId || task.deletedAt || task.status !== TaskStatus.IN_PROGRESS) repair();
  if (session.taskId === targetTaskId) throw new BusinessError(ErrorCode.CONFLICT, "active task requires atomic Timer finish + completeTask:true", 409);
}

export function requireSlotSession(slot: { activeSessionId: number | null }, sessionId: number) {
  if (slot.activeSessionId !== sessionId) throw new BusinessError(ErrorCode.CONFLICT, "execution slot and session are inconsistent; repair required", 409);
}
