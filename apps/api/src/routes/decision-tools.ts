import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { decisionRecords, psychologicalBridges } from "../db/schema.js";
import { env } from "../env.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { grantRecordReward } from "../rewards.js";

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const saveDecisionSchema = z.object({
  decisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  theme: z.string().trim().min(1).max(200),
  benefits: z.string().trim().min(1).max(5000),
  drawbacks: z.string().trim().min(1).max(5000),
  benefitScore: z.number().int().min(1).max(5),
  drawbackScore: z.number().int().min(1).max(5),
  conclusion: z.string().trim().max(500).optional().nullable()
});

const bridgeSchema = z.object({
  bridgeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  desiredEffect: z.string().trim().min(1).max(3000),
  resistance: z.string().trim().min(1).max(3000)
});

const bridgeResultSchema = z.object({
  bridgeText: z.string().max(4000),
  nextStep: z.string().max(500),
  reassurance: z.string().max(500)
});

function outputText(payload: unknown) {
  const data = payload as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (typeof data.output_text === "string") return data.output_text;
  return data.output?.flatMap((item) => item.content ?? []).map((item) => item.text).filter(Boolean).join("\n") ?? "";
}

async function generateBridge(desiredEffect: string, resistance: string) {
  if (!env.OPENAI_API_KEY) {
    throw new BusinessError(ErrorCode.PARAM_ERROR, "AI is not configured. Please set OPENAI_API_KEY on the server.");
  }

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
            "你是一个温和、务实的心理桥梁助手。基于目标、阻力、执行意图和 WOOP 思路，帮助用户把想达成的效果连接到一个很小的下一步。不要做医学诊断，不使用病理化标签。只输出 JSON。"
        },
        {
          role: "user",
          content: `想达成的效果：\n${desiredEffect}\n\n当前阻力：\n${resistance}\n\n请输出 bridgeText, nextStep, reassurance。bridgeText 要包含：看见阻力、重新定义行动、如果-那么桥梁句。`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "psychological_bridge",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["bridgeText", "nextStep", "reassurance"],
            properties: {
              bridgeText: { type: "string" },
              nextStep: { type: "string" },
              reassurance: { type: "string" }
            }
          },
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    throw new BusinessError(ErrorCode.SERVER_ERROR, "psychological bridge generation failed", 500);
  }

  const parsed = bridgeResultSchema.safeParse(JSON.parse(outputText(await response.json())));
  if (!parsed.success) {
    throw new BusinessError(ErrorCode.SERVER_ERROR, "psychological bridge response format error", 500);
  }
  return parsed.data;
}

export const decisionToolsRoute = new Hono()
  .get("/decisions", async (c) => {
    const query = listSchema.parse(c.req.query());
    const rows = await db
      .select()
      .from(decisionRecords)
      .where(and(eq(decisionRecords.userId, getCurrentUserId(c)), isNull(decisionRecords.deletedAt)))
      .orderBy(desc(decisionRecords.decisionDate), desc(decisionRecords.createdAt))
      .limit(query.limit);
    return ok(c, rows);
  })
  .post("/decisions", async (c) => {
    const body = saveDecisionSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const now = new Date();
    const [result] = await db.insert(decisionRecords).values({
      userId,
      decisionDate: body.decisionDate,
      theme: body.theme,
      benefits: body.benefits,
      drawbacks: body.drawbacks,
      benefitScore: body.benefitScore,
      drawbackScore: body.drawbackScore,
      conclusion: body.conclusion?.trim() || null,
      createdAt: now,
      updatedAt: now
    });
    const [row] = await db.select().from(decisionRecords).where(and(eq(decisionRecords.id, result.insertId), eq(decisionRecords.userId, userId)));
    const reward = await grantRecordReward(userId, "decision", body.decisionDate, "保存决策记录");
    log.info({ userId, decisionRecordId: result.insertId }, "[decision_record_saved]");
    return ok(c, { ...row, reward });
  })
  .get("/bridges", async (c) => {
    const query = listSchema.parse(c.req.query());
    const rows = await db
      .select()
      .from(psychologicalBridges)
      .where(and(eq(psychologicalBridges.userId, getCurrentUserId(c)), isNull(psychologicalBridges.deletedAt)))
      .orderBy(desc(psychologicalBridges.bridgeDate), desc(psychologicalBridges.createdAt))
      .limit(query.limit);
    return ok(c, rows);
  })
  .post("/bridges/generate", async (c) => {
    const body = bridgeSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const now = new Date();
    const bridge = await generateBridge(body.desiredEffect, body.resistance);
    const [result] = await db.insert(psychologicalBridges).values({
      userId,
      bridgeDate: body.bridgeDate,
      desiredEffect: body.desiredEffect,
      resistance: body.resistance,
      bridgeText: bridge.bridgeText,
      nextStep: bridge.nextStep,
      reassurance: bridge.reassurance,
      createdAt: now,
      updatedAt: now
    });
    const [row] = await db.select().from(psychologicalBridges).where(and(eq(psychologicalBridges.id, result.insertId), eq(psychologicalBridges.userId, userId)));
    const reward = await grantRecordReward(userId, "bridge", body.bridgeDate, "生成心理桥梁");
    log.info({ userId, psychologicalBridgeId: result.insertId }, "[psychological_bridge_saved]");
    return ok(c, { ...row, reward });
  });
