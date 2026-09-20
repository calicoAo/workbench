import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { actualTimeForUser, currentSessionForUser } from "../execution-read-model.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { isValidTimezone } from "../time.js";
import { acceptAndStartTask, cancelWorkSession, finishWorkSession, pauseWorkSession, resumeWorkSession, startTaskSession } from "../work-session.js";

const operationId = z.string().uuid();
const startSchema = z.object({
  operationId,
  taskId: z.number().int().positive(),
  expectedTaskVersion: z.number().int().positive(),
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  recordTimezone: z.string().min(1).max(64).refine(isValidTimezone, "invalid IANA timezone").optional()
});
const sessionSchema = z.object({ operationId, expectedVersion: z.number().int().positive() });
const finishSchema = sessionSchema.extend({
  completeTask: z.boolean().default(false),
  expectedTaskVersion: z.number().int().positive().optional(),
  completionNote: z.string().trim().max(1000).optional()
}).refine((body) => !body.completeTask || body.expectedTaskVersion !== undefined, "expectedTaskVersion is required when completeTask is true");
const actualTimeQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1).max(64).refine(isValidTimezone, "invalid IANA timezone")
});

export const timerSessionsRoute = new Hono()
  .get("/current", async (c) => ok(c, await currentSessionForUser(getCurrentUserId(c))))
  .get("/actual-time", async (c) => {
    const query = actualTimeQuerySchema.parse(c.req.query());
    return ok(c, { date: query.date, timezone: query.timezone, entries: await actualTimeForUser(getCurrentUserId(c), query.date, query.timezone) });
  })
  .post("/start", async (c) => {
    const body = startSchema.parse(await c.req.json());
    const result = await startTaskSession({ userId: getCurrentUserId(c), ...body });
    log.info({ userId: getCurrentUserId(c), timerSessionId: result.sessionId }, "[timer_started]");
    return ok(c, result);
  })
  .post("/accept-and-start", async (c) => {
    const body = startSchema.extend({ taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(await c.req.json());
    const result = await acceptAndStartTask({ userId: getCurrentUserId(c), ...body });
    log.info({ userId: getCurrentUserId(c), timerSessionId: result.sessionId }, "[task_accepted_and_timer_started]");
    return ok(c, result);
  })
  .put("/:id/pause", async (c) => {
    const body = sessionSchema.parse(await c.req.json());
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    return ok(c, await pauseWorkSession({ userId: getCurrentUserId(c), sessionId: id, ...body }));
  })
  .put("/:id/resume", async (c) => {
    const body = sessionSchema.parse(await c.req.json());
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    return ok(c, await resumeWorkSession({ userId: getCurrentUserId(c), sessionId: id, ...body }));
  })
  .put("/:id/finish", async (c) => {
    const body = finishSchema.parse(await c.req.json());
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    return ok(c, await finishWorkSession({ userId: getCurrentUserId(c), sessionId: id, ...body }));
  })
  .put("/:id/cancel", async (c) => {
    const body = sessionSchema.parse(await c.req.json());
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    return ok(c, await cancelWorkSession({ userId: getCurrentUserId(c), sessionId: id, ...body }));
  });
