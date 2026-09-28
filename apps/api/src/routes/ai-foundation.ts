import { Hono } from "hono";
import { z } from "zod";
import { aiUsage, generateMorningWritingInsight, getAiSettings, listAiArtifacts, updateAiSettings } from "../ai-foundation.js";
import { getCurrentUserId } from "../auth.js";
import { ok } from "../http.js";

const toggle = z.boolean().transform((value) => value ? 1 : 0);
export const aiFoundationRoute = new Hono()
  .get("/settings", async (c) => ok(c, await getAiSettings(getCurrentUserId(c))))
  .put("/settings", async (c) => { const body = z.object({ expectedVersion: z.number().int().nonnegative(), enabled: toggle.optional(), allowAdventure: toggle.optional(), allowNotebook: toggle.optional(), allowGrowth: toggle.optional(), allowLibrary: toggle.optional(), allowWallet: toggle.optional() }).parse(await c.req.json()); const { expectedVersion, ...values } = body; return ok(c, await updateAiSettings(getCurrentUserId(c), expectedVersion, values)); })
  .get("/artifacts", async (c) => ok(c, { items: await listAiArtifacts(getCurrentUserId(c)) }))
  .get("/usage", async (c) => ok(c, await aiUsage(getCurrentUserId(c))))
  .post("/morning-writing-insight", async (c) => { const body = z.object({ operationId: z.string().uuid(), sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(await c.req.json()); return ok(c, await generateMorningWritingInsight(getCurrentUserId(c), body)); });
