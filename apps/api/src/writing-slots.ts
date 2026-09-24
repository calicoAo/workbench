import { asc, eq } from "drizzle-orm";
import type { DatabaseClient } from "./db/index.js";
import { writingSlots } from "./db/schema.js";

export const WRITING_SLOT_KEYS = ["MORNING_WRITING", "JOURNAL", "STOCK_REVIEW"] as const;
export type WritingSlotKey = typeof WRITING_SLOT_KEYS[number];

export const DEFAULT_WRITING_SLOTS = [
  { slotKey: "MORNING_WRITING" as const, enabled: false, sortOrder: 10 },
  { slotKey: "JOURNAL" as const, enabled: false, sortOrder: 20 },
  { slotKey: "STOCK_REVIEW" as const, enabled: false, sortOrder: 30 }
];

export async function seedWritingSlots(client: DatabaseClient, userId: number, now = new Date()) {
  await client.insert(writingSlots).values(DEFAULT_WRITING_SLOTS.map((slot) => ({
    userId,
    slotKey: slot.slotKey,
    enabled: slot.enabled ? 1 : 0,
    sortOrder: slot.sortOrder,
    createdAt: now,
    updatedAt: now
  })));
}

export async function writingSlotsForUser(client: DatabaseClient, userId: number) {
  const rows = await client.select().from(writingSlots).where(eq(writingSlots.userId, userId)).orderBy(asc(writingSlots.sortOrder), asc(writingSlots.id));
  return rows.map((row) => ({ slotKey: row.slotKey as WritingSlotKey, enabled: Boolean(row.enabled), sortOrder: row.sortOrder }));
}
