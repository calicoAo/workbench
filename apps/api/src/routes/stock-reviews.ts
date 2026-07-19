import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { stockReviews } from "../db/schema.js";
import { ok } from "../http.js";
import { log } from "../logger.js";


const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const saveStockReviewSchema = z.object({
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marketSummary: z.string().max(10000).optional(),
  operations: z.string().max(10000).optional(),
  holdingsReview: z.string().max(10000).optional(),
  goodPoints: z.string().max(10000).optional(),
  mistakes: z.string().max(10000).optional(),
  tomorrowPlan: z.string().max(10000).optional(),
  emotionScore: z.number().int().min(1).max(5).optional(),
  disciplineScore: z.number().int().min(1).max(5).optional(),
  tags: z.string().max(255).optional()
});

function normalize(value?: string) {
  const text = value?.trim();
  return text ? text : null;
}

export const stockReviewsRoute = new Hono()
  .get("/", async (c) => {
    const query = querySchema.parse(c.req.query());
    const [row] = await db
      .select()
      .from(stockReviews)
      .where(and(eq(stockReviews.userId, getCurrentUserId(c)), eq(stockReviews.reviewDate, query.date), isNull(stockReviews.deletedAt)));

    return ok(c, row ?? null);
  })
  .get("/list", async (c) => {
    const query = listSchema.parse(c.req.query());
    const rows = await db
      .select()
      .from(stockReviews)
      .where(and(eq(stockReviews.userId, getCurrentUserId(c)), isNull(stockReviews.deletedAt)))
      .orderBy(desc(stockReviews.reviewDate))
      .limit(query.limit);

    return ok(c, rows);
  })
  .post("/", async (c) => {
    const body = saveStockReviewSchema.parse(await c.req.json());
    const now = new Date();
    const values = {
      userId: getCurrentUserId(c),
      reviewDate: body.reviewDate,
      marketSummary: normalize(body.marketSummary),
      operations: normalize(body.operations),
      holdingsReview: normalize(body.holdingsReview),
      goodPoints: normalize(body.goodPoints),
      mistakes: normalize(body.mistakes),
      tomorrowPlan: normalize(body.tomorrowPlan),
      emotionScore: body.emotionScore ?? null,
      disciplineScore: body.disciplineScore ?? null,
      tags: normalize(body.tags),
      createdAt: now,
      updatedAt: now
    };

    await db
      .insert(stockReviews)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          marketSummary: values.marketSummary,
          operations: values.operations,
          holdingsReview: values.holdingsReview,
          goodPoints: values.goodPoints,
          mistakes: values.mistakes,
          tomorrowPlan: values.tomorrowPlan,
          emotionScore: values.emotionScore,
          disciplineScore: values.disciplineScore,
          tags: values.tags,
          updatedAt: now,
          deletedAt: null
        }
      });

    log.info({ userId: getCurrentUserId(c), reviewDate: body.reviewDate }, "[stock_review_saved]");
    return ok(c, { reviewDate: body.reviewDate });
  });

