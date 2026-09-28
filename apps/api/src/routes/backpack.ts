import { Hono } from "hono";
import { z } from "zod";
import { BACKPACK_SOURCE_TYPES, backpackOverview, createKeepsake, createMilestone, evaluateAchievements, listKeepsakes, listMilestones, updateMilestone } from "../backpack.js";
import { getCurrentUserId } from "../auth.js";
import { ok } from "../http.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const source = { sourceType: z.enum(BACKPACK_SOURCE_TYPES).nullable().optional(), sourceId: z.number().int().positive().nullable().optional() };
const milestone = z.object({ operationId: z.string().uuid(), title: z.string().trim().min(1).max(160), description: z.string().trim().max(1000).nullable().optional(), happenedOn: date, ...source });
const keepsake = milestone.extend({ iconKey: z.string().trim().min(1).max(64), themeKey: z.string().trim().min(1).max(32) });

export const backpackRoute = new Hono()
  .get("/", async (c) => ok(c, await backpackOverview(getCurrentUserId(c))))
  .post("/achievements/evaluate", async (c) => ok(c, await evaluateAchievements(getCurrentUserId(c))))
  .get("/milestones", async (c) => ok(c, { items: await listMilestones(getCurrentUserId(c)) }))
  .post("/milestones", async (c) => ok(c, await createMilestone(getCurrentUserId(c), milestone.parse(await c.req.json()))))
  .put("/milestones/:id", async (c) => { const body = milestone.pick({ title: true, description: true, happenedOn: true }).partial().extend({ expectedVersion: z.number().int().positive() }).parse(await c.req.json()); const { expectedVersion, ...values } = body; return ok(c, await updateMilestone(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")), expectedVersion, values)); })
  .get("/keepsakes", async (c) => ok(c, { items: await listKeepsakes(getCurrentUserId(c)) }))
  .post("/keepsakes", async (c) => ok(c, await createKeepsake(getCurrentUserId(c), keepsake.parse(await c.req.json()))));
