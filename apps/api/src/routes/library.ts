import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { ok } from "../http.js";
import { addLibraryRelation, createLibraryItem, LIBRARY_RELATION_TYPES, LIBRARY_STATUSES, LIBRARY_TYPES, libraryItemDetail, listLibraryItems, updateLibraryItem } from "../library.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const fieldShape = { type: z.enum(LIBRARY_TYPES), title: z.string().trim().min(1).max(200), originalTitle: nullableText(200), creator: nullableText(160), coverRef: nullableText(500), status: z.enum(LIBRARY_STATUSES), rating: z.number().int().min(1).max(5).nullable().optional(), startedOn: date.nullable().optional(), finishedOn: date.nullable().optional(), externalRef: nullableText(500), shortNote: nullableText(1000) };
const fields = z.object(fieldShape).refine((value) => !value.startedOn || !value.finishedOn || value.finishedOn >= value.startedOn, { path: ["finishedOn"], message: "finished date must not precede started date" });
const updateFields = z.object(fieldShape).partial().extend({ expectedVersion: z.number().int().positive() });

export const libraryRoute = new Hono()
  .get("/items", async (c) => { const query = z.object({ type: z.enum(LIBRARY_TYPES).optional(), status: z.enum(LIBRARY_STATUSES).optional(), q: z.string().trim().max(120).optional() }).parse(c.req.query()); return ok(c, { items: await listLibraryItems(getCurrentUserId(c), query) }); })
  .post("/items", async (c) => ok(c, await createLibraryItem(getCurrentUserId(c), fields.parse(await c.req.json()))))
  .get("/items/:id", async (c) => ok(c, await libraryItemDetail(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")))))
  .put("/items/:id", async (c) => { const body = updateFields.parse(await c.req.json()); const { expectedVersion, ...values } = body; return ok(c, await updateLibraryItem(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")), expectedVersion, values)); })
  .post("/items/:id/relations", async (c) => { const body = z.object({ targetType: z.enum(LIBRARY_RELATION_TYPES), targetId: z.number().int().positive() }).parse(await c.req.json()); return ok(c, await addLibraryRelation(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")), body.targetType, body.targetId)); });
