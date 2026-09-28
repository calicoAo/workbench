import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/index.js";
import { aiArtifacts, morningWritings, userAiSettings } from "./db/schema.js";
import { env } from "./env.js";
import { BusinessError, ErrorCode } from "./errors.js";

export const AI_DOMAINS = ["adventure", "notebook", "growth", "library", "wallet"] as const;
export type AiDomain = (typeof AI_DOMAINS)[number];
export type GatewayResult = {
  payload: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
  costMicrounits?: number | null;
};
export type AiGateway = {
  provider: string;
  model: string;
  generateStructured(input: { schemaName: string; schema: Record<string, unknown>; system: string; user: string }): Promise<GatewayResult>;
};

function outputText(payload: unknown) {
  const data = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text:
      typeof data.output_text === "string"
        ? data.output_text
        : (data.output
            ?.flatMap((item) => item.content ?? [])
            .map((item) => item.text)
            .filter(Boolean)
            .join("\n") ?? ""),
    usage: data.usage,
  };
}

export const openAiGateway: AiGateway = {
  provider: "openai-compatible",
  model: env.OPENAI_MODEL,
  async generateStructured(input) {
    if (!env.OPENAI_API_KEY) throw new BusinessError(ErrorCode.PARAM_ERROR, "AI is not configured on this server");
    let response: Response;
    try {
      response = await fetch(`${env.OPENAI_BASE_URL}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          input: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
          text: {
            format: {
              type: "json_schema",
              name: input.schemaName,
              schema: input.schema,
              strict: true,
            },
          },
        }),
      });
    } catch {
      throw new BusinessError(ErrorCode.SERVER_ERROR, "AI provider unavailable", 500);
    }
    if (!response.ok) throw new BusinessError(ErrorCode.SERVER_ERROR, `AI provider failed (${response.status})`, 500);
    const value = outputText(await response.json());
    try {
      return {
        payload: JSON.parse(value.text),
        usage: {
          inputTokens: value.usage?.input_tokens,
          outputTokens: value.usage?.output_tokens,
        },
        costMicrounits: null,
      };
    } catch {
      throw new BusinessError(ErrorCode.SERVER_ERROR, "AI provider returned invalid JSON", 500);
    }
  },
};

const insightSchema = z
  .object({
    summary: z.string().max(1000),
    emotionTags: z.array(z.string().max(20)).max(5),
    energyScore: z.number().int().min(1).max(5),
    stressKeywords: z.array(z.string().max(20)).max(5),
    suggestion: z.string().max(1000),
    fullText: z.string().max(5000),
  })
  .strict();
const insightJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "emotionTags", "energyScore", "stressKeywords", "suggestion", "fullText"],
  properties: {
    summary: { type: "string" },
    emotionTags: { type: "array", maxItems: 5, items: { type: "string" } },
    energyScore: { type: "integer", minimum: 1, maximum: 5 },
    stressKeywords: { type: "array", maxItems: 5, items: { type: "string" } },
    suggestion: { type: "string" },
    fullText: { type: "string" },
  },
};

export async function getAiSettings(userId: number) {
  const [row] = await db.select().from(userAiSettings).where(eq(userAiSettings.userId, userId));
  return (
    row ?? {
      userId,
      enabled: 0,
      allowAdventure: 0,
      allowNotebook: 0,
      allowGrowth: 0,
      allowLibrary: 0,
      allowWallet: 0,
      version: 0,
      updatedAt: null,
    }
  );
}

export async function updateAiSettings(
  userId: number,
  expectedVersion: number,
  values: Partial<{
    enabled: number;
    allowAdventure: number;
    allowNotebook: number;
    allowGrowth: number;
    allowLibrary: number;
    allowWallet: number;
  }>,
) {
  const current = await getAiSettings(userId);
  if (current.version !== expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "AI settings version conflict", 409);
  const next = {
    enabled: values.enabled ?? current.enabled,
    allowAdventure: values.allowAdventure ?? current.allowAdventure,
    allowNotebook: values.allowNotebook ?? current.allowNotebook,
    allowGrowth: values.allowGrowth ?? current.allowGrowth,
    allowLibrary: values.allowLibrary ?? current.allowLibrary,
    allowWallet: values.allowWallet ?? current.allowWallet,
    version: expectedVersion + 1,
    updatedAt: new Date(),
  };
  await db
    .insert(userAiSettings)
    .values({ userId, ...next })
    .onDuplicateKeyUpdate({ set: next });
  return { userId, ...next };
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function generateMorningWritingInsight(userId: number, input: { operationId: string; sourceDate: string }, gateway: AiGateway = openAiGateway) {
  const settings = await getAiSettings(userId);
  if (!settings.enabled) throw new BusinessError(ErrorCode.FORBIDDEN, "AI is disabled", 403);
  if (!settings.allowNotebook) throw new BusinessError(ErrorCode.FORBIDDEN, "Notebook AI permission is required", 403);
  const [source] = await db
    .select()
    .from(morningWritings)
    .where(and(eq(morningWritings.userId, userId), eq(morningWritings.writingDate, input.sourceDate), isNull(morningWritings.deletedAt)));
  if (!source?.content?.trim()) throw new BusinessError(ErrorCode.NOT_FOUND, "saved morning writing not found", 404);
  const sourceRefs = [{ domain: "NOTEBOOK", type: "MORNING_WRITING", id: source.id }];
  const sourceVersions = [{ id: source.id, updatedAt: source.updatedAt.toISOString() }];
  const sourceFingerprint = fingerprint({
    sourceRefs,
    sourceVersions,
    content: source.content,
  });
  const [existing] = await db
    .select()
    .from(aiArtifacts)
    .where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.operationId, input.operationId)));
  if (existing && existing.sourceFingerprint !== sourceFingerprint) throw new BusinessError(ErrorCode.CONFLICT, "operationId is already used with different source input", 409);
  if (existing?.status === "SUCCEEDED") return existing;
  const now = new Date();
  let artifactId = existing?.id;
  if (existing)
    await db
      .update(aiArtifacts)
      .set({
        status: "PENDING",
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(aiArtifacts.id, existing.id));
  else {
    const [created] = await db.insert(aiArtifacts).values({
      userId,
      operationId: input.operationId,
      artifactType: "WRITING_INSIGHT",
      featureKey: "MORNING_WRITING_INSIGHT",
      sourceRefs,
      sourceVersions,
      sourceFingerprint,
      provider: gateway.provider,
      model: gateway.model,
      promptVersion: "morning-insight-v1",
      resultPayload: null,
      status: "PENDING",
      stale: 0,
      createdAt: now,
      updatedAt: now,
    });
    artifactId = created.insertId;
  }
  try {
    const response = await gateway.generateStructured({
      schemaName: "morning_writing_insight",
      schema: insightJsonSchema,
      system: "你是温和、务实的个人工作台洞察助手。只解释和组织，不做医学诊断，不执行任何业务写入。只输出指定 JSON。",
      user: `分析这段晨写，返回摘要、情绪标签、能量、压力关键词和一个小建议。\n\n${source.content}`,
    });
    const parsed = insightSchema.safeParse(response.payload);
    if (!parsed.success) throw new BusinessError(ErrorCode.SERVER_ERROR, "AI result structure validation failed", 500);
    await db
      .update(aiArtifacts)
      .set({
        resultPayload: parsed.data,
        status: "SUCCEEDED",
        usageInputTokens: response.usage?.inputTokens ?? null,
        usageOutputTokens: response.usage?.outputTokens ?? null,
        costMicrounits: response.costMicrounits ?? null,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(aiArtifacts.id, artifactId!));
    const old = await db
      .select({ id: aiArtifacts.id, sourceRefs: aiArtifacts.sourceRefs })
      .from(aiArtifacts)
      .where(and(eq(aiArtifacts.userId, userId), eq(aiArtifacts.artifactType, "WRITING_INSIGHT"), eq(aiArtifacts.featureKey, "MORNING_WRITING_INSIGHT"), eq(aiArtifacts.stale, 0)));
    const staleIds = old.filter((item) => item.id !== artifactId && Array.isArray(item.sourceRefs) && item.sourceRefs.some((ref) => typeof ref === "object" && ref !== null && "id" in ref && ref.id === source.id)).map((item) => item.id);
    if (staleIds.length) await db.update(aiArtifacts).set({ stale: 1, updatedAt: new Date() }).where(inArray(aiArtifacts.id, staleIds));
    const [saved] = await db.select().from(aiArtifacts).where(eq(aiArtifacts.id, artifactId!));
    return saved;
  } catch (error) {
    await db
      .update(aiArtifacts)
      .set({
        status: "FAILED",
        errorCode: error instanceof BusinessError ? String(error.code) : "PROVIDER_ERROR",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "AI generation failed",
        updatedAt: new Date(),
      })
      .where(eq(aiArtifacts.id, artifactId!));
    throw error;
  }
}

export async function listAiArtifacts(userId: number) {
  return db.select().from(aiArtifacts).where(eq(aiArtifacts.userId, userId)).orderBy(desc(aiArtifacts.updatedAt)).limit(50);
}
export async function aiUsage(userId: number) {
  const [row] = await db
    .select({
      requests: sql<number>`count(*)`,
      inputTokens: sql<number>`sum(${aiArtifacts.usageInputTokens})`,
      outputTokens: sql<number>`sum(${aiArtifacts.usageOutputTokens})`,
      costMicrounits: sql<number>`sum(${aiArtifacts.costMicrounits})`,
      pricedRequests: sql<number>`sum(case when ${aiArtifacts.costMicrounits} is not null then 1 else 0 end)`,
    })
    .from(aiArtifacts)
    .where(eq(aiArtifacts.userId, userId));
  return {
    requests: Number(row.requests ?? 0),
    inputTokens: Number(row.inputTokens ?? 0),
    outputTokens: Number(row.outputTokens ?? 0),
    costMicrounits: Number(row.requests ?? 0) > 0 && Number(row.pricedRequests ?? 0) === Number(row.requests ?? 0) ? Number(row.costMicrounits ?? 0) : null,
  };
}
