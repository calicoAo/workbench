import { createHash } from "node:crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { aiArtifacts, users } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { businessDateAt, businessDayBoundsUtc } from "../time.js";
import { getLibrarySearch } from "./ai-search.js";
import { discoverCovers, type CoverCandidate, type CoverWork } from "./cover-discovery.js";

const feature = "LIBRARY_AI_COVERS";
const schema = z.object({ operationId: z.string().uuid(), candidateIndex: z.number().int().min(0).max(4) }).strict();
type Context = { parentOperationId: string; candidateIndex: number; fingerprint: string; timeoutAt: string; pageCalls: number; imageCalls: number; searchCalls: number };
function view(row: typeof aiArtifacts.$inferSelect) {
  const context = row.generationContext as Context;
  return { operationId: row.operationId, parentOperationId: context.parentOperationId, candidateIndex: context.candidateIndex, status: row.status === "PENDING" && Date.parse(context.timeoutAt) < Date.now() || row.errorCode === "COVER_RESULT_UNKNOWN" ? "FAILED_UNKNOWN" : row.status, result: row.resultPayload as { candidates: CoverCandidate[]; failures: string[] } | null, pageCalls: context.pageCalls, imageCalls: context.imageCalls, searchCalls: context.searchCalls, usage: { inputTokens: row.usageInputTokens, outputTokens: row.usageOutputTokens, reasoningTokens: row.reasoningTokens } };
}
export async function getLibraryCovers(userId: number, parentOperationId: string, operationId: string) {
  await getLibrarySearch(userId, parentOperationId); // Permission AND parent ownership on every read.
  const [row] = await db.select().from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.operationId, operationId), eq(aiArtifacts.featureKey, feature)));
  if (!row || (row.generationContext as Context).parentOperationId !== parentOperationId) throw new BusinessError(ErrorCode.NOT_FOUND, "Cover lookup not found", 404);
  return view(row);
}
export async function selectedLibraryCover(userId: number, parentOperationId: string, candidateIndex: number, operationId: string, candidateId: string) {
  const lookup = await getLibraryCovers(userId, parentOperationId, operationId);
  const candidate = lookup.result?.candidates.find(row => row.id === candidateId);
  if (lookup.status !== "SUCCEEDED" || lookup.candidateIndex !== candidateIndex || !candidate) throw new BusinessError(ErrorCode.CONFLICT, "Cover does not belong to this work or lookup", 409);
  return candidate;
}
export async function findLibraryCovers(userId: number, parentOperationId: string, raw: unknown, signal?: AbortSignal, discover = discoverCovers) {
  const input = schema.parse(raw), search = await getLibrarySearch(userId, parentOperationId);
  const work = (search.result as { candidates?: CoverWork[] } | null)?.candidates?.[input.candidateIndex];
  if (search.status !== "SUCCEEDED" || !work) throw new BusinessError(ErrorCode.CONFLICT, "Select an available search candidate first", 409);
  const fingerprint = createHash("sha256").update(JSON.stringify({ parentOperationId, candidateIndex: input.candidateIndex, work })).digest("hex");
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  const now = new Date(), window = businessDayBoundsUtc(businessDateAt(now, user.timezone), user.timezone);
  const claim = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [old] = await tx.select().from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.operationId, input.operationId)));
    if (old) { if (old.featureKey !== feature || (old.generationContext as Context).fingerprint !== fingerprint) throw new BusinessError(ErrorCode.CONFLICT, "operationId already used with different parameters", 409); return { claimed: false as const, row: old }; }
    await tx.update(aiArtifacts).set({ status: "FAILED", errorCode: "COVER_RESULT_UNKNOWN", updatedAt: now }).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.featureKey, feature), eq(aiArtifacts.status, "PENDING"), lt(aiArtifacts.createdAt, new Date(now.getTime() - 45000))));
    const [pending] = await tx.select({ id: aiArtifacts.id }).from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.featureKey, feature), eq(aiArtifacts.status, "PENDING"))).limit(1);
    if (pending) throw new BusinessError(ErrorCode.CONFLICT, "Another cover lookup is pending; query it first", 409);
    const [count] = await tx.select({ n: sql<number>`count(*)` }).from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.featureKey, feature), gte(aiArtifacts.createdAt, window.start), lt(aiArtifacts.createdAt, window.end)));
    if (Number(count.n) >= 20) throw new BusinessError(ErrorCode.CONFLICT, "Daily cover lookup quota reached (20)", 409);
    const context: Context = { parentOperationId, candidateIndex: input.candidateIndex, fingerprint, timeoutAt: new Date(now.getTime() + 45000).toISOString(), pageCalls: 0, imageCalls: 0, searchCalls: 0 };
    const [created] = await tx.insert(aiArtifacts).values({ userId, operationId: input.operationId, featureKey: feature, artifactType: "LIBRARY_COVERS", provider: "web", model: "none", sourceRefs: [], sourceVersions: {}, sourceFingerprint: fingerprint, promptVersion: "cover-metadata-v1", generationContext: context, status: "PENDING", stale: 0, usageInputTokens: 0, usageOutputTokens: 0, reasoningTokens: 0, createdAt: now, updatedAt: now });
    return { claimed: true as const, id: created.insertId, context };
  });
  if (!claim.claimed) return view(claim.row);
  try {
    const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
    const result = await discover(work, search.mediaType, boundedSignal);
    await db.update(aiArtifacts).set({ status: "SUCCEEDED", resultPayload: { candidates: result.candidates, failures: result.failures }, generationContext: { ...claim.context, pageCalls: result.pageCalls, imageCalls: result.imageCalls, searchCalls: result.searchCalls }, generatedAt: new Date(), updatedAt: new Date() }).where(and(eq(aiArtifacts.id, claim.id), eq(aiArtifacts.status, "PENDING")));
  } catch (error) {
    const calls = error as { pageCalls?: number; imageCalls?: number; searchCalls?: number };
    await db.update(aiArtifacts).set({ status: "FAILED", errorCode: "COVER_RESULT_UNKNOWN", generationContext: { ...claim.context, pageCalls: calls.pageCalls ?? 0, imageCalls: calls.imageCalls ?? 0, searchCalls: calls.searchCalls ?? 0 }, updatedAt: new Date() }).where(and(eq(aiArtifacts.id, claim.id), eq(aiArtifacts.status, "PENDING")));
  }
  return getLibraryCovers(userId, parentOperationId, input.operationId);
}
