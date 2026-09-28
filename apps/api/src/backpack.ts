import { and, desc, eq, sql } from "drizzle-orm";
import { adventureSnapshotReferenceAvailable } from "./adventure.js";
import { db } from "./db/index.js";
import { achievementDefinitions, achievementUnlocks, keepsakeCards, milestones } from "./db/schema.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { finishedLibrarySource, libraryReferenceAvailable } from "./library.js";
import { runMutation } from "./mutation-receipt.js";
import { completedProjectSource, projectReferenceAvailable } from "./projects.js";

export const BACKPACK_SOURCE_TYPES = ["PROJECT", "MILESTONE", "ACHIEVEMENT", "LIBRARY", "ADVENTURE_LOG", "MANUAL_TEXT"] as const;
export type BackpackSourceType = typeof BACKPACK_SOURCE_TYPES[number];

export async function evaluateAchievements(userId: number) {
  const [project, library] = await Promise.all([completedProjectSource(userId), finishedLibrarySource(userId)]);
  const sources: Record<string, { sourceType: BackpackSourceType; sourceId: number } | undefined> = {
    PROJECT_COMPLETED_COUNT_GTE_1: project ? { sourceType: "PROJECT", sourceId: project.id } : undefined,
    LIBRARY_FINISHED_COUNT_GTE_1: library ? { sourceType: "LIBRARY", sourceId: library.id } : undefined
  };
  const definitions = await db.select().from(achievementDefinitions).where(eq(achievementDefinitions.enabled, 1));
  const now = new Date();
  for (const definition of definitions) {
    const source = sources[definition.ruleKey]; if (!source) continue;
    await db.insert(achievementUnlocks).values({ userId, achievementId: definition.id, unlockedAt: now, sourceType: source.sourceType, sourceId: source.sourceId }).onDuplicateKeyUpdate({ set: { achievementId: definition.id } });
  }
  return achievementOverview(userId);
}

export async function achievementOverview(userId: number) {
  const rows = await db.select({ definition: achievementDefinitions, unlock: achievementUnlocks }).from(achievementDefinitions).leftJoin(achievementUnlocks, and(eq(achievementUnlocks.achievementId, achievementDefinitions.id), eq(achievementUnlocks.userId, userId))).where(eq(achievementDefinitions.enabled, 1)).orderBy(achievementDefinitions.id);
  return rows.map((row) => ({ ...row.definition, unlock: row.unlock }));
}

export async function listMilestones(userId: number) { return db.select().from(milestones).where(eq(milestones.userId, userId)).orderBy(desc(milestones.happenedOn), desc(milestones.createdAt)); }
export async function createMilestone(userId: number, input: { operationId: string; title: string; description?: string | null; happenedOn: string; sourceType?: BackpackSourceType | null; sourceId?: number | null }) {
  return runMutation({ userId, operationId: input.operationId, commandType: "MILESTONE_CREATE", request: input }, async (tx) => { const now = new Date(); const [result] = await tx.insert(milestones).values({ userId, operationId: input.operationId, title: input.title, description: input.description || null, happenedOn: input.happenedOn, sourceType: input.sourceType || null, sourceId: input.sourceId || null, version: 1, createdAt: now, updatedAt: now }); return { id: result.insertId, version: 1 }; });
}
export async function updateMilestone(userId: number, id: number, expectedVersion: number, values: { title?: string; description?: string | null; happenedOn?: string }) {
  const result = await db.update(milestones).set({ ...values, version: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(milestones.userId, userId), eq(milestones.id, id), eq(milestones.version, expectedVersion)));
  if (!result[0].affectedRows) throw new BusinessError(ErrorCode.CONFLICT, "milestone version conflict", 409); return { id, version: expectedVersion + 1 };
}

export async function createKeepsake(userId: number, input: { operationId: string; title: string; description?: string | null; happenedOn: string; sourceType?: BackpackSourceType | null; sourceId?: number | null; iconKey: string; themeKey: string }) {
  return runMutation({ userId, operationId: input.operationId, commandType: "KEEPSAKE_CREATE", request: input }, async (tx) => { const [result] = await tx.insert(keepsakeCards).values({ userId, operationId: input.operationId, title: input.title, description: input.description || null, happenedOn: input.happenedOn, sourceType: input.sourceType || null, sourceId: input.sourceId || null, iconKey: input.iconKey, themeKey: input.themeKey, createdAt: new Date() }); return { id: result.insertId }; });
}

async function sourceAvailable(userId: number, sourceType: string | null, sourceId: number | null) {
  if (!sourceType || !sourceId || sourceType === "MANUAL_TEXT") return true;
  if (sourceType === "PROJECT") return projectReferenceAvailable(userId, sourceId);
  if (sourceType === "LIBRARY") return libraryReferenceAvailable(userId, sourceId);
  if (sourceType === "ADVENTURE_LOG") return adventureSnapshotReferenceAvailable(userId, sourceId);
  if (sourceType === "MILESTONE") return Boolean((await db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.userId, userId), eq(milestones.id, sourceId))))[0]);
  if (sourceType === "ACHIEVEMENT") return Boolean((await db.select({ id: achievementUnlocks.id }).from(achievementUnlocks).where(and(eq(achievementUnlocks.userId, userId), eq(achievementUnlocks.id, sourceId))))[0]);
  return false;
}

export async function listKeepsakes(userId: number) {
  const rows = await db.select().from(keepsakeCards).where(eq(keepsakeCards.userId, userId)).orderBy(desc(keepsakeCards.happenedOn), desc(keepsakeCards.createdAt));
  return Promise.all(rows.map(async (row) => ({ ...row, sourceAvailable: await sourceAvailable(userId, row.sourceType, row.sourceId) })));
}

export async function backpackOverview(userId: number) {
  const [achievements, milestoneRows, keepsakeRows] = await Promise.all([achievementOverview(userId), listMilestones(userId), listKeepsakes(userId)]);
  return { achievements, milestones: milestoneRows, keepsakes: keepsakeRows, summary: { unlocked: achievements.filter((item) => item.unlock).length, achievementTotal: achievements.length, milestones: milestoneRows.length, keepsakes: keepsakeRows.length } };
}
