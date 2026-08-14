import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { rewardItems, rewardRedemptions, userGrowth } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { ensureGrowth, growthSummary, recentRewardEvents } from "../rewards.js";

const createRewardItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  cost: z.number().int().min(1).max(100000),
  description: z.string().trim().max(500).optional().nullable()
});

const updateRewardItemSchema = createRewardItemSchema.partial().refine((value) => value.name !== undefined || value.cost !== undefined || value.description !== undefined, {
  message: "name, cost or description is required"
});

export const rewardsRoute = new Hono()
  .get("/", async (c) => {
    const userId = getCurrentUserId(c);
    const [growth, items, events, redemptions] = await Promise.all([
      ensureGrowth(userId),
      db.select().from(rewardItems).where(and(eq(rewardItems.userId, userId), isNull(rewardItems.deletedAt))).orderBy(desc(rewardItems.createdAt)),
      recentRewardEvents(userId),
      db.select().from(rewardRedemptions).where(eq(rewardRedemptions.userId, userId)).orderBy(desc(rewardRedemptions.createdAt)).limit(8)
    ]);

    return ok(c, { growth: growthSummary(growth), items, events, redemptions });
  })
  .post("/items", async (c) => {
    const body = createRewardItemSchema.parse(await c.req.json());
    const now = new Date();
    const [result] = await db.insert(rewardItems).values({
      userId: getCurrentUserId(c),
      name: body.name,
      cost: body.cost,
      description: body.description?.trim() || null,
      enabled: 1,
      createdAt: now,
      updatedAt: now
    });
    return ok(c, { id: result.insertId });
  })
  .put("/items/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = updateRewardItemSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const [item] = await db.select().from(rewardItems).where(and(eq(rewardItems.id, id), eq(rewardItems.userId, userId), isNull(rewardItems.deletedAt)));
    if (!item) throw new BusinessError(ErrorCode.NOT_FOUND, "reward item not found", 404);

    await db
      .update(rewardItems)
      .set({
        name: body.name ?? item.name,
        cost: body.cost ?? item.cost,
        description: body.description === undefined ? item.description : body.description?.trim() || null,
        updatedAt: new Date()
      })
      .where(and(eq(rewardItems.id, id), eq(rewardItems.userId, userId)));
    return ok(c, { id });
  })
  .delete("/items/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    await db.delete(rewardItems).where(and(eq(rewardItems.id, id), eq(rewardItems.userId, getCurrentUserId(c))));
    return ok(c, { id });
  })
  .post("/items/:id/redeem", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const [item] = await db.select().from(rewardItems).where(and(eq(rewardItems.id, id), eq(rewardItems.userId, userId), isNull(rewardItems.deletedAt)));
    if (!item) throw new BusinessError(ErrorCode.NOT_FOUND, "reward item not found", 404);

    const now = new Date();
    await ensureGrowth(userId);
    const coins = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(userGrowth)
        .set({ coins: sql`${userGrowth.coins} - ${item.cost}`, updatedAt: now })
        .where(and(eq(userGrowth.userId, userId), gte(userGrowth.coins, item.cost)));
      if (!updated.affectedRows) throw new BusinessError(ErrorCode.PARAM_ERROR, "coins are not enough");

      await tx.insert(rewardRedemptions).values({
        userId,
        rewardItemId: item.id,
        name: item.name,
        cost: item.cost,
        note: item.description,
        createdAt: now
      });

      const [growth] = await tx.select().from(userGrowth).where(eq(userGrowth.userId, userId));
      return growth.coins;
    });
    return ok(c, { id, coins });
  });
