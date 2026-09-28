import { Hono } from "hono";
import { z } from "zod";
import { adventureSnapshot, listAdventureSnapshots, periodReview, regenerateAdventureSnapshot, regeneratePeriodReview, updatePeriodReviewBody } from "../adventure.js";
import { getCurrentUserId } from "../auth.js";
import { ok } from "../http.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodType = z.enum(["WEEK", "MONTH"]);

export const adventureRoute = new Hono()
  .get("/snapshots", async (c) => { const query = z.object({ from: date.optional(), to: date.optional() }).parse(c.req.query()); return ok(c, { items: await listAdventureSnapshots(getCurrentUserId(c), query.from, query.to) }); })
  .get("/snapshots/:date", async (c) => ok(c, await adventureSnapshot(getCurrentUserId(c), date.parse(c.req.param("date")))))
  .post("/snapshots/:date/regenerate", async (c) => ok(c, await regenerateAdventureSnapshot(getCurrentUserId(c), date.parse(c.req.param("date")))))
  .get("/period-reviews", async (c) => { const query = z.object({ type: periodType, anchor: date }).parse(c.req.query()); return ok(c, await periodReview(getCurrentUserId(c), query.type, query.anchor)); })
  .post("/period-reviews/regenerate", async (c) => { const body = z.object({ type: periodType, anchor: date }).parse(await c.req.json()); return ok(c, await regeneratePeriodReview(getCurrentUserId(c), body.type, body.anchor)); })
  .put("/period-reviews/:id", async (c) => { const body = z.object({ expectedVersion: z.number().int().positive(), userReviewBody: z.string().max(20000) }).parse(await c.req.json()); return ok(c, await updatePeriodReviewBody(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")), body.expectedVersion, body.userReviewBody)); });
