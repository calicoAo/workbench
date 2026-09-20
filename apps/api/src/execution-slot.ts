import { eq } from "drizzle-orm";
import { type DatabaseClient } from "./db/index.js";
import { userExecutionSlots } from "./db/schema.js";
import { BusinessError, ErrorCode } from "./errors.js";

export async function lockExecutionSlot(client: DatabaseClient, userId: number) {
  const [slot] = await client.select().from(userExecutionSlots).where(eq(userExecutionSlots.userId, userId)).for("update");
  if (!slot) throw new BusinessError(ErrorCode.CONFLICT, "execution slot requires repair", 409);
  return slot;
}

export function requireEmptySlot(slot: { activeSessionId: number | null }) {
  if (slot.activeSessionId !== null) throw new BusinessError(ErrorCode.CONFLICT, "another session is active", 409);
}

export function requireSlotSession(slot: { activeSessionId: number | null }, sessionId: number) {
  if (slot.activeSessionId !== sessionId) throw new BusinessError(ErrorCode.CONFLICT, "execution slot and session are inconsistent; repair required", 409);
}
