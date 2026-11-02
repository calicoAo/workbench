import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { ok } from "../http.js";
import { mutationResult } from "../mutation-receipt.js";
import { checkSplitName, generateSchema, generateSplit, getSplit, splitContext } from "../task-split/index.js";
export const taskSplitRoute = new Hono()
    .use("*", async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); })
    .get("/context", async (c) => ok(c, await splitContext(getCurrentUserId(c))))
    .get("/name-check", async (c) => { const q = z.object({ kind: z.enum(["project", "category"]), name: z.string().trim().min(1).max(120) }).parse(c.req.query()); return ok(c, { matches: await checkSplitName(getCurrentUserId(c), q.kind, q.name) }); })
    .post("/preview", async (c) => { const result = await generateSplit(getCurrentUserId(c), generateSchema.parse(await c.req.json()), undefined, c.req.raw.signal); return c.json({ code: 0, message: "ok", data: result }, result.status === "PENDING" ? 202 : 200); })
    .get("/preview/:operationId", async (c) => ok(c, await getSplit(getCurrentUserId(c), z.string().uuid().parse(c.req.param("operationId")))))
    .get("/publish-status/:operationId", async (c) => { const result = await mutationResult(getCurrentUserId(c), z.string().uuid().parse(c.req.param("operationId")), "PUBLISH_TASK") as {
    id: number;
} | null; return ok(c, result ? { status: "committed", taskId: result.id } : { status: "not_found" }); });
