import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { aiInsights } from "../db/schema.js";
import { env } from "../env.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";

const insightQuerySchema = z.object({
  sourceType: z.enum(["morning", "journal"]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const analyzeSchema = z.object({
  sourceType: z.enum(["morning", "journal"]),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string().trim().min(1).max(10000)
});

const aiResultSchema = z.object({
  summary: z.string().max(1000),
  emotionTags: z.array(z.string().max(20)).max(5),
  energyScore: z.number().int().min(1).max(5),
  stressKeywords: z.array(z.string().max(20)).max(5),
  suggestion: z.string().max(1000),
  fullText: z.string().max(5000)
});

function outputText(payload: unknown) {
  const data = payload as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (typeof data.output_text === "string") return data.output_text;
  return data.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter(Boolean).join("\n") ?? "";
}

async function analyzeWriting(sourceType: "morning" | "journal", content: string) {
  if (!env.OPENAI_API_KEY) {
    throw new BusinessError(ErrorCode.PARAM_ERROR, "AI is not configured. Please set OPENAI_API_KEY on the server.");
  }

  const label = sourceType === "morning" ? "晨写" : "睡前日记";
  const response = await fetch(`${env.OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "你是一个温和、务实的个人工作台洞察助手。只做自律、情绪线索和行动建议分析，不做医学诊断，不使用病理化标签。请只输出 JSON。"
        },
        {
          role: "user",
          content: `请分析这段${label}，输出字段：summary, emotionTags, energyScore(1-5), stressKeywords, suggestion, fullText。\n\n内容：\n${content}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "writing_insight",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "emotionTags", "energyScore", "stressKeywords", "suggestion", "fullText"],
            properties: {
              summary: { type: "string" },
              emotionTags: { type: "array", maxItems: 5, items: { type: "string" } },
              energyScore: { type: "integer", minimum: 1, maximum: 5 },
              stressKeywords: { type: "array", maxItems: 5, items: { type: "string" } },
              suggestion: { type: "string" },
              fullText: { type: "string" }
            }
          },
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    throw new BusinessError(ErrorCode.SERVER_ERROR, "AI insight failed", 500);
  }

  const parsed = aiResultSchema.safeParse(JSON.parse(outputText(await response.json())));
  if (!parsed.success) {
    throw new BusinessError(ErrorCode.SERVER_ERROR, "AI insight response format error", 500);
  }
  return parsed.data;
}

export const aiInsightsRoute = new Hono()
  .get("/", async (c) => {
    const query = insightQuerySchema.parse(c.req.query());
    const userId = getCurrentUserId(c);
    const where = [eq(aiInsights.userId, userId), isNull(aiInsights.deletedAt)];
    if (query.sourceType) where.push(eq(aiInsights.sourceType, query.sourceType));
    if (query.date) where.push(eq(aiInsights.sourceDate, query.date));
    const rows = await db.select().from(aiInsights).where(and(...where)).orderBy(desc(aiInsights.createdAt)).limit(query.limit);
    return ok(c, rows);
  })
  .post("/analyze", async (c) => {
    const body = analyzeSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const now = new Date();
    const result = await analyzeWriting(body.sourceType, body.content);

    await db
      .insert(aiInsights)
      .values({
        userId,
        sourceType: body.sourceType,
        sourceDate: body.sourceDate,
        sourceContent: body.content,
        summary: result.summary,
        emotionTags: result.emotionTags.join(","),
        energyScore: result.energyScore,
        stressKeywords: result.stressKeywords.join(","),
        suggestion: result.suggestion,
        fullText: result.fullText,
        createdAt: now,
        updatedAt: now
      })
      .onDuplicateKeyUpdate({
        set: {
          sourceContent: body.content,
          summary: result.summary,
          emotionTags: result.emotionTags.join(","),
          energyScore: result.energyScore,
          stressKeywords: result.stressKeywords.join(","),
          suggestion: result.suggestion,
          fullText: result.fullText,
          updatedAt: now,
          deletedAt: null
        }
      });

    const [row] = await db
      .select()
      .from(aiInsights)
      .where(and(eq(aiInsights.userId, userId), eq(aiInsights.sourceType, body.sourceType), eq(aiInsights.sourceDate, body.sourceDate), isNull(aiInsights.deletedAt)));

    return ok(c, row);
  });
