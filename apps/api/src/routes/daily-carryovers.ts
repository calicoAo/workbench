import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { applyDailyCarryover } from "../daily-carryover.js";
import { ok } from "../http.js";
import { log } from "../logger.js";

const applyCarryoverSchema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const dailyCarryoversRoute = new Hono().post("/", async (c) => {
  const body = applyCarryoverSchema.parse(await c.req.json());
  const userId = getCurrentUserId(c);
  const result = await applyDailyCarryover({ userId, targetDate: body.targetDate });
  log.info({ userId, targetDate: body.targetDate }, "[daily_carryover_applied]");
  return ok(c, result);
});
