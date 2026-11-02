import { and, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { aiArtifacts, users } from "../db/schema.js";
import { getAiSettings, type AiGateway, type GatewayResult } from "../ai-foundation.js";
import { deepseekGateway } from "../deepseek.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { mutationFingerprint } from "../mutation-receipt.js";
import { taskSplitProjectContext } from "../projects.js";
import { taskSplitCategoryContext } from "../task-categories.js";
import { businessDateAt, businessDayBoundsUtc } from "../time.js";
import { PROMPT_VERSION, splitJsonSchema, splitSchema, SYSTEM, validateEvidence } from "./contract.js";
export const generateSchema = z.object({ operationId: z.string().uuid(), draftId: z.string().uuid(), text: z.string().trim().min(1).refine(v => Array.from(v).length <= 5000, "Input exceeds 5000 characters"), contextSelectionIds: z.object({ projects: z.array(z.number().int().positive()).max(50), categories: z.array(z.number().int().positive()).max(50) }).strict().optional() }).strict();
type GenerateInput = z.infer<typeof generateSchema>;
type Context = {
    requestFingerprint: string;
    draftId: string;
    businessDate: string;
    timezone: string;
    timeoutAt: string;
    [key: string]: unknown;
};
async function permission(userId: number) { const settings = await getAiSettings(userId); if (!settings.enabled || !settings.allowTasks)
    throw new BusinessError(ErrorCode.FORBIDDEN, "Enable AI and Tasks permission in Settings before generating", 403); }
function view(row: typeof aiArtifacts.$inferSelect) { const context = row.generationContext as Context; return { operationId: row.operationId, status: row.status === "PENDING" && new Date(context.timeoutAt).getTime() < Date.now() ? "FAILED_UNKNOWN" : row.status === "FAILED" && row.errorCode === "GENERATION_RESULT_UNKNOWN" ? "FAILED_UNKNOWN" : row.status, result: row.resultPayload, errorCode: row.errorCode, usage: { inputTokens: row.usageInputTokens, outputTokens: row.usageOutputTokens, reasoningTokens: row.reasoningTokens }, businessDate: context.businessDate, timezone: context.timezone }; }
export async function getSplit(userId: number, operationId: string) {
    await permission(userId);
    const [row] = await db.select().from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.operationId, operationId), eq(aiArtifacts.featureKey, "TASK_SPLIT")));
    if (!row)
        throw new BusinessError(ErrorCode.NOT_FOUND, "Generation not found", 404);
    return view(row);
}
export async function splitContext(userId: number) {
    await permission(userId);
    const [projects, categories] = await Promise.all([taskSplitProjectContext(userId), taskSplitCategoryContext(userId)]);
    return { projects: projects.filter(v => !v.archivedAt && v.status !== 3).map(v => ({ id: v.id, name: v.name, description: v.description?.slice(0, 200) ?? null })), categories: categories.filter(v => v.enabled), selectionRequired: projects.filter(v => !v.archivedAt && v.status !== 3).length > 50 || categories.filter(v => v.enabled).length > 50 };
}
export async function checkSplitName(userId: number, kind: "project" | "category", name: string) {
    const key = name.normalize("NFKC").trim().toLocaleLowerCase();
    const rows = kind === "project" ? await taskSplitProjectContext(userId) : await taskSplitCategoryContext(userId);
    return rows.filter(v => v.name.normalize("NFKC").trim().toLocaleLowerCase() === key).map(v => ({ id: v.id, name: v.name, available: "status" in v ? !v.archivedAt && v.status !== 3 : Boolean(v.enabled) }));
}
export async function generateSplit(userId: number, input: GenerateInput, gateway: AiGateway = deepseekGateway, signal?: AbortSignal) {
    await permission(userId);
    const requestFingerprint = mutationFingerprint("TASK_SPLIT_REQUEST", 1, { draftId: input.draftId, text: input.text, contextSelectionIds: input.contextSelectionIds });
    const existing = await db.select().from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.operationId, input.operationId))).then(rows => rows[0]);
    if (existing) {
        if (existing.featureKey !== "TASK_SPLIT" || (existing.generationContext as Context)?.requestFingerprint !== requestFingerprint)
            throw new BusinessError(ErrorCode.CONFLICT, "operationId already used with different parameters", 409);
        return view(existing);
    }
    const context = await splitContext(userId);
    const selected = input.contextSelectionIds;
    if (context.selectionRequired && !selected)
        throw new BusinessError(ErrorCode.PARAM_ERROR, "Select at most 50 projects and 50 categories before generation");
    const projects = selected ? context.projects.filter(v => selected.projects.includes(v.id)) : context.projects;
    const categories = selected ? context.categories.filter(v => selected.categories.includes(v.id)) : context.categories;
    if (selected && (projects.length !== selected.projects.length || categories.length !== selected.categories.length))
        throw new BusinessError(ErrorCode.CONFLICT, "Selected context is unavailable; refresh choices", 409);
    const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
    const now = new Date(), timezone = user.timezone, businessDate = businessDateAt(now, timezone), window = businessDayBoundsUtc(businessDate, timezone);
    const userPayload = JSON.stringify({ businessDate, timezone, projects, categories, text: input.text });
    if (Buffer.byteLength(userPayload) + Buffer.byteLength(SYSTEM) + Buffer.byteLength(JSON.stringify(splitJsonSchema)) + 2048 > 32768)
        throw new BusinessError(ErrorCode.PARAM_ERROR, "Request too large; narrow text or context");
    const generationContext: Context = { requestFingerprint, draftId: input.draftId, textHash: mutationFingerprint("TEXT", 1, input.text), businessDate, timezone, timeoutAt: new Date(now.getTime() + 60000).toISOString(), contextFingerprint: mutationFingerprint("TASK_SPLIT_CONTEXT", 1, { projects, categories }), selectedProjectIds: projects.map(v => v.id), selectedCategoryIds: categories.map(v => v.id), quotaWindowStart: window.start.toISOString(), quotaWindowEnd: window.end.toISOString(), provider: gateway.provider, model: gateway.model, promptVersion: PROMPT_VERSION };
    const claim = await db.transaction(async (tx) => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        const [old] = await tx.select().from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.operationId, input.operationId)));
        if (old) {
            if (old.featureKey !== "TASK_SPLIT" || (old.generationContext as Context)?.requestFingerprint !== requestFingerprint)
                throw new BusinessError(ErrorCode.CONFLICT, "operationId already used", 409);
            return { row: old, claimed: false };
        }
        // Expire only this feature's abandoned claims; GET remains a pure read.
        await tx.update(aiArtifacts).set({ status: "FAILED", errorCode: "GENERATION_RESULT_UNKNOWN", errorMessage: "Result unknown; generating again may incur another charge", updatedAt: now }).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.featureKey, "TASK_SPLIT"), eq(aiArtifacts.status, "PENDING"), lt(aiArtifacts.createdAt, new Date(now.getTime() - 60000))));
        const [pending] = await tx.select({ id: aiArtifacts.id }).from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.featureKey, "TASK_SPLIT"), eq(aiArtifacts.status, "PENDING"))).limit(1);
        if (pending)
            throw new BusinessError(ErrorCode.CONFLICT, "A generation is already pending; query its status first", 409);
        const [count] = await tx.select({ n: sql<number> `count(*)` }).from(aiArtifacts).where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.featureKey, "TASK_SPLIT"), gte(aiArtifacts.createdAt, window.start), lt(aiArtifacts.createdAt, window.end)));
        if (Number(count.n) >= 20)
            throw new BusinessError(ErrorCode.CONFLICT, "Daily generation quota reached (20 per business day)", 409);
        const [result] = await tx.insert(aiArtifacts).values({ userId, operationId: input.operationId, artifactType: "TASK_DRAFTS", featureKey: "TASK_SPLIT", sourceRefs: [], sourceVersions: {}, sourceFingerprint: mutationFingerprint("TASK_SPLIT", 1, { ...generationContext, text: input.text }), provider: gateway.provider, model: gateway.model, promptVersion: PROMPT_VERSION, generationContext, status: "PENDING", stale: 0, createdAt: now, updatedAt: now });
        return { id: result.insertId, claimed: true };
    });
    if (!claim.claimed && claim.row)
        return view(claim.row);
    let result: GatewayResult | undefined;
    try {
        result = await gateway.generateStructured({ schemaName: "task_split_v1", schema: splitJsonSchema, system: SYSTEM, user: userPayload, signal });
        const parsed = splitSchema.parse(result.payload);
        const candidates = parsed.candidates.map((candidate, index) => ({ ...validateEvidence(candidate, input.text, businessDate), candidateId: `${input.draftId}:${index}`, categoryId: categories.some(v => v.id === candidate.categoryId) ? candidate.categoryId : null, projectId: projects.some(v => v.id === candidate.projectId) ? candidate.projectId : null }));
        const spans = parsed.unprocessedTextSpans.filter(v => input.text.includes(v));
        await db.update(aiArtifacts).set({ status: "SUCCEEDED", resultPayload: { candidates, hasMore: parsed.hasMore || spans.length > 0, unprocessedTextSpans: spans }, usageInputTokens: result.usage?.inputTokens ?? null, usageOutputTokens: result.usage?.outputTokens ?? null, reasoningTokens: result.usage?.reasoningTokens ?? null, costMicrounits: result.costMicrounits ?? null, generatedAt: new Date(), updatedAt: new Date() }).where(and(eq(aiArtifacts.id, claim.id!), eq(aiArtifacts.status, "PENDING"), gte(aiArtifacts.createdAt, new Date(Date.now() - 60000))));
    }
    catch (error) {
        const unknown = !(error instanceof z.ZodError) && !(error instanceof BusinessError);
        await db.update(aiArtifacts).set({ status: "FAILED", errorCode: unknown ? "GENERATION_RESULT_UNKNOWN" : "INVALID_OR_FAILED_GENERATION", errorMessage: unknown ? "Result unknown; another generation may incur a charge" : "Generation failed validation or provider rejected the request; edit and explicitly generate again", usageInputTokens: result?.usage?.inputTokens ?? null, usageOutputTokens: result?.usage?.outputTokens ?? null, reasoningTokens: result?.usage?.reasoningTokens ?? null, updatedAt: new Date() }).where(and(eq(aiArtifacts.id, claim.id!), eq(aiArtifacts.status, "PENDING")));
    }
    return getSplit(userId, input.operationId);
}
