import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { advanceCoreFlow, markHint, onboardingStatus, restartCoreFlow, skipCoreFlow, startCoreFlow, CORE_FLOW_ID, CORE_STEPS } from "../onboarding.js";
import { ok } from "../http.js";

const flowId = z.literal(CORE_FLOW_ID);
const stepId = z.enum(CORE_STEPS);
const hintKey = z.string().trim().min(1).max(96);
const hintVersion = z.number().int().positive();

export const onboardingRoute = new Hono()
  .get("/status", async (c) => ok(c, await onboardingStatus(getCurrentUserId(c))))
  .post("/flows/:flowId/start", async (c) => { flowId.parse(c.req.param("flowId")); return ok(c, await startCoreFlow(getCurrentUserId(c))); })
  .post("/flows/:flowId/advance", async (c) => { flowId.parse(c.req.param("flowId")); const body = z.object({ stepId }).parse(await c.req.json()); return ok(c, await advanceCoreFlow(getCurrentUserId(c), body.stepId)); })
  .post("/flows/:flowId/skip", async (c) => { flowId.parse(c.req.param("flowId")); return ok(c, await skipCoreFlow(getCurrentUserId(c))); })
  .post("/flows/:flowId/restart", async (c) => { flowId.parse(c.req.param("flowId")); return ok(c, await restartCoreFlow(getCurrentUserId(c))); })
  .post("/hints/:hintKey/seen", async (c) => { const body = z.object({ hintVersion }).parse(await c.req.json()); return ok(c, await markHint(getCurrentUserId(c), hintKey.parse(c.req.param("hintKey")), body.hintVersion, "seen")); })
  .post("/hints/:hintKey/dismiss", async (c) => { const body = z.object({ hintVersion }).parse(await c.req.json()); return ok(c, await markHint(getCurrentUserId(c), hintKey.parse(c.req.param("hintKey")), body.hintVersion, "dismiss")); });
