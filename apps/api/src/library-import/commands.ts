import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { libraryItems, libraryItemSources, users } from "../db/schema.js";
import { env } from "../env.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { mutationFingerprint, readMutationResult, runMutation } from "../mutation-receipt.js";
import { plain, resolveMedia, type Source, type Metadata, type Provider, type Entity } from "./providers.js";
const editable = z.object({ title: z.string().trim().min(1).max(200), originalTitle: z.string().max(200).nullable(), creator: z.string().max(160).nullable(), releaseYear: z.number().int().min(1).max(9999).nullable(), description: z.string().max(10000).nullable() }).partial().strict();
export const confirmSchema = z.object({ previewToken: z.string().max(65536), fingerprint: z.string().length(64), operationId: z.string().uuid(), mode: z.enum(["create", "attach", "refresh"]), targetItemId: z.number().int().positive().optional(), expectedVersion: z.number().int().positive().optional(), edits: editable, omitCover: z.boolean().optional() }).strict();
type Preview = {
    userId: number;
    expiresAt: number;
    source: Source;
    targetItemId?: number;
    expectedVersion?: number;
    fingerprint: string;
};
function secret() { if (!env.MEDIA_IMPORT_TOKEN_SECRET)
    throw new BusinessError(ErrorCode.PARAM_ERROR, "Media import signing key is not configured"); return env.MEDIA_IMPORT_TOKEN_SECRET; }
function sign(encoded: string) { return createHmac("sha256", secret()).update(encoded).digest("base64url"); }
function decode(token: string): Preview {
    try {
        const [body, signature, extra] = token.split(".");
        const expected = sign(body);
        if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
            throw new Error();
        return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    }
    catch {
        throw new BusinessError(ErrorCode.PARAM_ERROR, "Invalid media preview; resolve again");
    }
}
const fields = ["title", "originalTitle", "creator", "releaseYear", "description", "coverRef"] as const;
export async function resolvePreview(userId: number, input: {
    provider: Provider;
    entityType: Entity;
    sourceIdOrInput: string;
    targetItemId?: number;
}, resolver: typeof resolveMedia = resolveMedia) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let source: Source;
    try {
        source = await Promise.race([resolver(input.provider, input.entityType, input.sourceIdOrInput), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BusinessError(ErrorCode.SERVER_ERROR, "Media resolve timed out; draft retained", 500)), 20000); })]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    return sourcePreview(userId, source, input.targetItemId);
}
export async function sourcePreview(userId: number, source: Source, targetItemId?: number) {
    const input = { targetItemId };
    const [existing] = await db.select({ id: libraryItemSources.libraryItemId }).from(libraryItemSources).where(and(eq(libraryItemSources.userId, userId), eq(libraryItemSources.provider, source.provider), eq(libraryItemSources.entityType, source.entityType), eq(libraryItemSources.stableSourceId, source.stableSourceId)));
    let current: typeof libraryItems.$inferSelect | undefined, previous: Metadata | undefined;
    if (input.targetItemId) {
        [current] = await db.select().from(libraryItems).where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, input.targetItemId)));
        if (!current)
            throw new BusinessError(ErrorCode.NOT_FOUND, "Library item not found", 404);
        if (current.type !== source.entityType)
            throw new BusinessError(ErrorCode.CONFLICT, "Source and item types differ", 409);
        const [old] = await db.select().from(libraryItemSources).where(and(eq(libraryItemSources.userId, userId), eq(libraryItemSources.libraryItemId, current.id)));
        previous = old?.metadataSnapshot as Metadata | undefined;
        if (old && old.stableSourceId !== source.stableSourceId && source.provider === "OPEN_LIBRARY") {
            const canonical = await resolveMedia("OPEN_LIBRARY", "BOOK", old.stableSourceId);
            if (canonical.stableSourceId !== source.stableSourceId)
                throw new BusinessError(ErrorCode.CONFLICT, "Unlink the existing source before changing identity", 409);
        }
        if (old && (old.provider !== source.provider || old.entityType !== source.entityType))
            throw new BusinessError(ErrorCode.CONFLICT, "Unlink the existing source before attaching another provider", 409);
        if (old && old.stableSourceId !== source.stableSourceId && source.provider !== "OPEN_LIBRARY")
            throw new BusinessError(ErrorCode.CONFLICT, "Unlink the existing source before changing source identity", 409);
    }
    const changes = fields.map(field => ({ field, previous: previous?.[field] ?? null, current: current?.[field] ?? null, incoming: source.metadata[field], preserveCurrent: Boolean(current && (source.metadata[field] === null || (previous ? current[field] !== previous[field] : current[field] !== null && current[field] !== ""))) }));
    const now = Date.now();
    const fingerprint = mutationFingerprint("LIBRARY_PREVIEW", 1, { source, targetItemId: input.targetItemId, expectedVersion: current?.version });
    const payload: Preview = { userId, expiresAt: now + 600000, source, ...(current ? { targetItemId: current.id, expectedVersion: current.version } : {}), fingerprint };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const previewToken = `${encoded}.${sign(encoded)}`;
    if (previewToken.length > 65536)
        throw new BusinessError(ErrorCode.PARAM_ERROR, "Media preview is too large; use manual entry");
    const defaults = Object.fromEntries(changes.map(v => [v.field, v.preserveCurrent ? v.current : v.incoming]));
    return { previewToken, fingerprint, expiresAt: payload.expiresAt, source, existingItemId: existing?.id ?? null, expectedVersion: current?.version, changes, defaults };
}
export async function confirmImport(userId: number, input: z.infer<typeof confirmSchema>) {
    const { previewToken, ...frozen } = input;
    // Replay before checking token expiry, without persisting the signed token.
    const request = { ...frozen, tokenHash: mutationFingerprint("TOKEN", 1, previewToken) };
    const replay = await readMutationResult(userId, input.operationId, "LIBRARY_IMPORT", request);
    if (replay)
        return replay;
    const snapshot = decode(previewToken);
    if (snapshot.userId !== userId)
        throw new BusinessError(ErrorCode.NOT_FOUND, "Preview not found", 404);
    if (snapshot.expiresAt < Date.now())
        throw new BusinessError(ErrorCode.CONFLICT, "Media preview expired; edits are retained. Resolve again", 409);
    if (snapshot.fingerprint !== input.fingerprint || snapshot.targetItemId !== input.targetItemId || snapshot.expectedVersion !== input.expectedVersion)
        throw new BusinessError(ErrorCode.CONFLICT, "Preview does not match this command", 409);
    if (input.mode !== "create" && !input.targetItemId || input.mode === "create" && input.targetItemId)
        throw new BusinessError(ErrorCode.PARAM_ERROR, "Invalid import mode");
    const source = snapshot.source;
    return runMutation({ userId, operationId: input.operationId, commandType: "LIBRARY_IMPORT", request }, async (tx) => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        const [existing] = await tx.select().from(libraryItemSources).where(and(eq(libraryItemSources.userId, userId), eq(libraryItemSources.provider, source.provider), eq(libraryItemSources.entityType, source.entityType), eq(libraryItemSources.stableSourceId, source.stableSourceId)));
        if (existing && input.mode === "create")
            return { id: existing.libraryItemId, existing: true };
        if (existing && existing.libraryItemId !== input.targetItemId)
            throw new BusinessError(ErrorCode.CONFLICT, "This source already belongs to another Library item", 409);
        const now = new Date();
        let importedAt = now;
        const clean = Object.fromEntries(Object.entries(input.edits).map(([k, v]) => [k, typeof v === "string" ? plain(v, k === "description" ? 10000 : k === "creator" ? 160 : 200) : v]));
        if ("title" in clean && !clean.title)
            throw new BusinessError(ErrorCode.PARAM_ERROR, "Title must contain plain text");
        let id = input.targetItemId;
        if (id) {
            const [current] = await tx.select().from(libraryItems).where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId))).for("update");
            if (!current)
                throw new BusinessError(ErrorCode.NOT_FOUND, "Library item not found", 404);
            if (current.version !== input.expectedVersion)
                throw new BusinessError(ErrorCode.CONFLICT, "Library item changed; resolve differences again", 409);
            const [old] = await tx.select().from(libraryItemSources).where(and(eq(libraryItemSources.userId, userId), eq(libraryItemSources.libraryItemId, id)));
            if (input.mode === "attach" && old || input.mode === "refresh" && !old)
                throw new BusinessError(ErrorCode.CONFLICT, "Source association changed", 409);
            if (current.type !== source.entityType)
                throw new BusinessError(ErrorCode.CONFLICT, "Source and item types differ", 409);
            if (old)
                importedAt = old.importedAt;
            const base = old?.metadataSnapshot as Metadata | undefined;
            const values: Record<string, unknown> = { ...clean, ...(input.omitCover ? { coverRef: null } : {}), version: current.version + 1, updatedAt: now };
            for (const field of fields)
                if (!(field in values) && source.metadata[field] !== null && (base ? current[field] === base[field] : current[field] === null || current[field] === ""))
                    values[field] = source.metadata[field];
            await tx.update(libraryItems).set(values).where(eq(libraryItems.id, id));
            if (old)
                await tx.delete(libraryItemSources).where(eq(libraryItemSources.id, old.id));
        }
        else {
            const [created] = await tx.insert(libraryItems).values({ userId, type: source.entityType, title: source.metadata.title, originalTitle: source.metadata.originalTitle, creator: source.metadata.creator, releaseYear: source.metadata.releaseYear, description: source.metadata.description, coverRef: input.omitCover ? null : source.metadata.coverRef, externalRef: source.canonicalUrl, status: "WANT", version: 1, createdAt: now, updatedAt: now, ...clean });
            id = created.insertId;
        }
        await tx.insert(libraryItemSources).values({ userId, libraryItemId: id, provider: source.provider, entityType: source.entityType, stableSourceId: source.stableSourceId, canonicalUrl: source.canonicalUrl, attribution: source.attribution, language: source.metadata.descriptionLanguage, metadataSnapshot: source.metadata, importedAt, metadataUpdatedAt: now });
        return { id, existing: false };
    });
}
export async function unlinkSource(userId: number, id: number, sourceId: number, input: {
    operationId: string;
    expectedVersion: number;
}) {
    return runMutation({ userId, operationId: input.operationId, commandType: "LIBRARY_UNLINK", request: { id, sourceId, expectedVersion: input.expectedVersion } }, async (tx) => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        const [item] = await tx.select().from(libraryItems).where(and(eq(libraryItems.id, id), eq(libraryItems.userId, userId))).for("update");
        if (!item)
            throw new BusinessError(ErrorCode.NOT_FOUND, "Library item not found", 404);
        if (item.version !== input.expectedVersion)
            throw new BusinessError(ErrorCode.CONFLICT, "Library item version conflict", 409);
        const result = await tx.delete(libraryItemSources).where(and(eq(libraryItemSources.id, sourceId), eq(libraryItemSources.userId, userId), eq(libraryItemSources.libraryItemId, id)));
        if (!result[0].affectedRows)
            throw new BusinessError(ErrorCode.NOT_FOUND, "Library source not found", 404);
        await tx.update(libraryItems).set({ version: item.version + 1, updatedAt: new Date() }).where(eq(libraryItems.id, id));
        return { id, version: item.version + 1 };
    });
}
