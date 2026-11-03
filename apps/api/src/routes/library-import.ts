import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { ok } from "../http.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { confirmImport, confirmSchema, resolvePreview, unlinkSource } from "../library-import/commands.js";
import { entitySchema, providerSchema, searchMedia } from "../library-import/providers.js";
import { mutationResult } from "../mutation-receipt.js";
import { getLibrarySearch, searchLibrary, previewLibrarySearch } from "../library-import/ai-search.js";
import { findLibraryCovers, getLibraryCovers, selectedLibraryCover } from "../library-import/ai-covers.js";
const hits = new Map<string, {
    until: number;
    count: number;
}>();
function limit(userId: number, kind: string, max: number) { const key = `${userId}:${kind}`, now = Date.now(); let hit = hits.get(key); if (!hit || hit.until < now) {
    hit = { until: now + 60000, count: 0 };
    hits.set(key, hit);
} if (++hit.count > max)
    throw new BusinessError(ErrorCode.CONFLICT, "Media request limit reached; retry in one minute", 409); }
const identity = z.object({ provider: providerSchema, entityType: entitySchema });
export const libraryImportRoute = new Hono()
    .use("*", async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); })
    .get("/import/search", async (c) => { const userId = getCurrentUserId(c); limit(userId, "search", 30); const q = identity.extend({ q: z.string().trim().min(1).max(120), page: z.coerce.number().int().min(1).max(500).default(1) }).parse(c.req.query()); return ok(c, await searchMedia(q.provider, q.entityType, q.q, q.page)); })
    .post("/import/ai-search", async (c) => { const userId = getCurrentUserId(c); limit(userId, "ai-search", 10); return ok(c, await searchLibrary(userId, await c.req.json(), undefined, c.req.raw.signal)); })
    .get("/import/ai-search/:operationId", async (c) => ok(c, await getLibrarySearch(getCurrentUserId(c), z.string().uuid().parse(c.req.param("operationId")))))
    .post("/import/ai-search/:operationId/covers", async c => { const userId = getCurrentUserId(c); limit(userId, "ai-covers", 5); return ok(c, await findLibraryCovers(userId, z.string().uuid().parse(c.req.param("operationId")), await c.req.json(), c.req.raw.signal)); })
    .get("/import/ai-search/:operationId/covers/:coverOperationId", async c => ok(c, await getLibraryCovers(getCurrentUserId(c), z.string().uuid().parse(c.req.param("operationId")), z.string().uuid().parse(c.req.param("coverOperationId")))))
    .post("/import/ai-search/:operationId/preview", async (c) => { const userId = getCurrentUserId(c); limit(userId, "ai-preview", 30); const input = z.object({ candidateIndex: z.number().int().min(0).max(4), targetItemId: z.number().int().positive().optional(), coverOperationId: z.string().uuid().optional(), coverCandidateId: z.string().length(32).optional() }).strict().refine(value => Boolean(value.coverOperationId) === Boolean(value.coverCandidateId), "Cover operation and candidate must be supplied together").parse(await c.req.json()); const parent = z.string().uuid().parse(c.req.param("operationId")); const cover = input.coverOperationId && input.coverCandidateId ? await selectedLibraryCover(userId, parent, input.candidateIndex, input.coverOperationId, input.coverCandidateId) : undefined; return ok(c, await previewLibrarySearch(userId, parent, input.candidateIndex, input.targetItemId, cover)); })
    .post("/import/resolve", async (c) => { const userId = getCurrentUserId(c); limit(userId, "resolve", 20); const input = identity.extend({ sourceIdOrInput: z.string().trim().min(1).max(500), targetItemId: z.number().int().positive().optional() }).strict().parse(await c.req.json()); return ok(c, await resolvePreview(userId, input)); })
    .post("/import/confirm", async (c) => ok(c, await confirmImport(getCurrentUserId(c), confirmSchema.parse(await c.req.json()))))
    .get("/import/operations/:operationId", async (c) => { const result = await mutationResult(getCurrentUserId(c), z.string().uuid().parse(c.req.param("operationId")), "LIBRARY_IMPORT") as {
    id: number;
} | null; return ok(c, result ? { status: "committed", itemId: result.id } : { status: "not_found" }); })
    .delete("/items/:id/sources/:sourceId", async (c) => ok(c, await unlinkSource(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")), z.coerce.number().int().positive().parse(c.req.param("sourceId")), z.object({ operationId: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict().parse(await c.req.json()))));
