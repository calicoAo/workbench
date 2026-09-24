import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { createDirect, createFromQuickNote, createTag, deleteTag, detail, listInspirations, mergeTag, setArchive, tagsForUser, updateInspiration, updateTag } from "../inspiration.js";
import { ok } from "../http.js";

const id = z.coerce.number().int().positive();
const operationId = z.string().uuid();
const tagNames = z.array(z.string().trim().min(1).max(120)).max(32).default([]);
const createSchema = z.object({ operationId, noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), title: z.string().trim().max(120).nullable().optional(), content: z.string().trim().min(1).max(5000), projectId: id.nullable().optional(), tagNames });
const updateSchema = z.object({ operationId, expectedVersion: z.number().int().positive(), noteExpectedVersion: z.number().int().positive().optional(), title: z.string().trim().max(120).nullable().optional(), content: z.string().trim().min(1).max(5000).optional(), projectId: id.nullable().optional(), favorite: z.boolean().optional(), pinned: z.boolean().optional(), tagNames: tagNames.optional() }).refine((value) => Object.keys(value).some((key) => !["operationId", "expectedVersion", "noteExpectedVersion"].includes(key)), "at least one change is required");
const tagCreateSchema = z.object({ operationId, name: z.string().trim().min(1).max(120) });
const mergeSchema = z.object({ operationId, targetTagId: id });

export const inspirationRoute = new Hono()
  .get("/inspirations", async (c) => {
    const query = c.req.query();
    const state = z.enum(["active", "favorite", "pinned", "untagged", "archived"]).default("active").parse(query.state);
    const limit = z.coerce.number().int().min(1).max(100).default(50).parse(query.limit);
    return ok(c, { items: await listInspirations(getCurrentUserId(c), { state, keyword: query.keyword?.trim() || undefined, tagNames: (query.tags ?? "").split(",").map((value) => value.trim()).filter(Boolean), limit }) });
  })
  .post("/inspirations", async (c) => ok(c, await createDirect(getCurrentUserId(c), createSchema.parse(await c.req.json()))))
  .get("/inspirations/:id", async (c) => ok(c, await detail(getCurrentUserId(c), id.parse(c.req.param("id")))))
  .put("/inspirations/:id", async (c) => ok(c, await updateInspiration(getCurrentUserId(c), id.parse(c.req.param("id")), updateSchema.parse(await c.req.json()))))
  .post("/inspirations/:id/archive", async (c) => { const body = z.object({ operationId, expectedVersion: z.number().int().positive() }).parse(await c.req.json()); return ok(c, await setArchive(getCurrentUserId(c), id.parse(c.req.param("id")), body.operationId, body.expectedVersion, true)); })
  .post("/inspirations/:id/unarchive", async (c) => { const body = z.object({ operationId, expectedVersion: z.number().int().positive() }).parse(await c.req.json()); return ok(c, await setArchive(getCurrentUserId(c), id.parse(c.req.param("id")), body.operationId, body.expectedVersion, false)); })
  .get("/inspiration-tags", async (c) => ok(c, { items: await tagsForUser(getCurrentUserId(c)) }))
  .post("/inspiration-tags", async (c) => ok(c, await createTag(getCurrentUserId(c), tagCreateSchema.parse(await c.req.json()))))
  .put("/inspiration-tags/:id", async (c) => ok(c, await updateTag(getCurrentUserId(c), id.parse(c.req.param("id")), tagCreateSchema.parse(await c.req.json()))))
  .post("/inspiration-tags/:id/merge", async (c) => { const body = mergeSchema.parse(await c.req.json()); return ok(c, await mergeTag(getCurrentUserId(c), id.parse(c.req.param("id")), body.targetTagId, body.operationId)); })
  .delete("/inspiration-tags/:id", async (c) => { const body = z.object({ operationId }).parse(await c.req.json()); return ok(c, await deleteTag(getCurrentUserId(c), id.parse(c.req.param("id")), body.operationId)); });
