import https from "node:https";
import { lookup, Resolver } from "node:dns";
import { isIP } from "node:net";
import { HttpsProxyAgent } from "https-proxy-agent";
import { z } from "zod";
import { env } from "../env.js";
import { BusinessError, ErrorCode } from "../errors.js";
export const providerSchema = z.enum(["TMDB", "OPEN_LIBRARY"]);
export const entitySchema = z.enum(["MOVIE", "SERIES", "BOOK"]);
export type Provider = z.infer<typeof providerSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type Metadata = {
    title: string;
    originalTitle: string | null;
    creator: string | null;
    creatorRole: string | null;
    releaseYear: number | null;
    description: string | null;
    descriptionLanguage: string | null;
    coverRef: string | null;
    isAnimation: boolean;
    editionId?: string;
    isbn?: string;
    sourceReferences?: Array<{ url: string; title: string }>;
    coverSourceUrl?: string;
    searchOperationId?: string;
};
export type Source = {
    provider: Provider | "WEB_SEARCH";
    entityType: Entity | "GAME";
    stableSourceId: string;
    canonicalUrl: string;
    attribution: string;
    metadata: Metadata;
};
export type Candidate = {
    provider: Provider;
    entityType: Entity;
    sourceId: string;
    title: string;
    releaseYear: number | null;
    isAnimation: boolean;
};
export function plain(value: unknown, max: number): string | null {
    const raw = typeof value === "string" ? value : typeof value === "object" && value !== null && "value" in value ? String(value.value) : "";
    return raw.replace(/<[^>]*>/g, "").replace(/\u0000/g, "").trim().slice(0, max) || null;
}
const year = (value: unknown) => { const y = Number(String(value ?? "").match(/\b(\d{4})\b/)?.[1]); return y >= 1 && y <= 9999 ? y : null; };
const unavailable = () => new BusinessError(ErrorCode.SERVER_ERROR, "Media source unavailable; your draft is retained. Retry or enter metadata manually", 500);
const resolver = new Resolver({ timeout: 3000, tries: 1 });
if (env.MEDIA_PUBLIC_DNS)
    resolver.setServers(env.MEDIA_PUBLIC_DNS.split(","));
const hosts = new Set(["api.themoviedb.org", "openlibrary.org"]);
const tmdbProxyAgent = env.TMDB_PROXY_URL ? new HttpsProxyAgent(env.TMDB_PROXY_URL) : undefined;
export function publicAddress(ip: string) {
    if (isIP(ip) === 4) {
        const [a, b] = ip.split(".").map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && [0, 168].includes(b) || a === 100 && b >= 64 && b <= 127 || a === 198 && [18, 19, 51].includes(b) || a === 203 && b === 0);
    }
    return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(?:0:|db8:|10:|20:)/i.test(ip) && !/^2002:/i.test(ip);
}
// Fixed origins and a vetted lookup on the actual socket prevent DNS rebinding.
export function sourceJson(url: URL, redirects = 0): Promise<{
    data: any;
    url: URL;
}> {
    if (url.protocol !== "https:" || !hosts.has(url.hostname) || url.port || url.username || url.password || redirects > 3)
        return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { Accept: "application/json", "Accept-Encoding": "identity", "User-Agent": env.OPEN_LIBRARY_USER_AGENT, ...(url.hostname === "api.themoviedb.org" ? { Authorization: `Bearer ${env.TMDB_API_READ_ACCESS_TOKEN ?? ""}` } : {}) },
            ...(url.hostname === "api.themoviedb.org" && tmdbProxyAgent ? { agent: tmdbProxyAgent } : {}),
            lookup: (host, options, callback) => {
                const done = (error: NodeJS.ErrnoException | null, addresses: Array<{
                    address: string;
                    family: number;
                }>) => {
                    const safe = (addresses ?? []).filter(v => publicAddress(v.address));
                    if (error || !safe.length) {
                        callback(error ?? new Error("Non-public media address"), "", 4);
                        return;
                    }
                    if (options.all)
                        (callback as unknown as (e: null, a: typeof safe) => void)(null, safe);
                    else
                        callback(null, safe[0].address, safe[0].family);
                };
                if (env.MEDIA_PUBLIC_DNS)
                    resolver.resolve4(host, (err, addresses) => done(err, (addresses ?? []).map(address => ({ address, family: 4 }))));
                else
                    lookup(host, { family: options.family as 4 | 6, all: true }, done);
            },
            signal: AbortSignal.timeout(10000),
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
                res.resume();
                if (!res.headers.location) {
                    reject(unavailable());
                    return;
                }
                const next = new URL(res.headers.location, url);
                if (next.hostname !== url.hostname) {
                    reject(unavailable());
                    return;
                }
                sourceJson(next, redirects + 1).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200 || res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
                res.resume();
                reject(unavailable());
                return;
            }
            const parts: Buffer[] = [];
            let size = 0;
            res.on("data", (part: Buffer) => { size += part.length; if (size > 2 * 1024 * 1024) {
                res.destroy();
                reject(unavailable());
            }
            else
                parts.push(part); });
            res.on("error", () => reject(unavailable()));
            res.on("end", () => { try {
                resolve({ data: JSON.parse(Buffer.concat(parts).toString("utf8")), url });
            }
            catch {
                reject(unavailable());
            } });
        });
        req.on("error", () => reject(unavailable()));
    });
}
const cache = new Map<string, {
    until: number;
    value: any;
}>();
let nextOl = 0;
async function get(url: URL, ttl = 600000) {
    const hit = cache.get(url.href);
    if (hit && hit.until > Date.now())
        return hit.value;
    if (url.hostname === "openlibrary.org") {
        const wait = Math.max(0, nextOl - Date.now());
        if (wait > 3000)
            throw unavailable();
        nextOl = Date.now() + wait + (env.OPEN_LIBRARY_USER_AGENT.includes("@") ? 350 : 1050);
        if (wait)
            await new Promise((r) => setTimeout(r, wait));
    }
    const value = await sourceJson(url);
    if (cache.size > 300)
        cache.delete(cache.keys().next().value!);
    cache.set(url.href, { until: Date.now() + ttl, value });
    return value;
}
function tmdb(path: string, params: Record<string, string> = {}) {
    if (!env.TMDB_API_READ_ACCESS_TOKEN)
        throw new BusinessError(ErrorCode.PARAM_ERROR, "TMDB is not configured; manual entry is available");
    const url = new URL(`https://api.themoviedb.org/3/${path}`);
    url.search = new URLSearchParams({ language: "zh-CN", ...params }).toString();
    return url;
}
export async function searchMedia(provider: Provider, entityType: Entity, query: string, page: number): Promise<{
    candidates: Candidate[];
    page: number;
    hasMore: boolean;
}> {
    if (provider === "TMDB") {
        if (entityType === "BOOK")
            throw new BusinessError(ErrorCode.PARAM_ERROR, "TMDB supports movies and series only");
        const { data } = await get(tmdb(`search/${entityType === "MOVIE" ? "movie" : "tv"}`, { query, page: String(page), include_adult: "false" }), 300000);
        return { candidates: (data.results ?? []).slice(0, 20).map((v: any) => ({ provider, entityType, sourceId: String(v.id), title: plain(v.title ?? v.name, 200) ?? "Untitled", releaseYear: year(v.release_date ?? v.first_air_date), isAnimation: Array.isArray(v.genre_ids) && v.genre_ids.includes(16) })), page, hasMore: page < Math.min(Number(data.total_pages ?? 1), 500) };
    }
    if (entityType !== "BOOK")
        throw new BusinessError(ErrorCode.PARAM_ERROR, "Open Library supports books only");
    const url = new URL("https://openlibrary.org/search.json");
    url.search = new URLSearchParams({ q: query, page: String(page), limit: "20", fields: "key,title,first_publish_year" }).toString();
    const { data } = await get(url, 300000);
    return { candidates: (data.docs ?? []).filter((v: any) => /^\/works\/OL\d+W$/.test(v.key)).map((v: any) => ({ provider, entityType, sourceId: v.key.split("/").pop(), title: plain(v.title, 200) ?? "Untitled", releaseYear: year(v.first_publish_year), isAnimation: false })), page, hasMore: page * 20 < Number(data.numFound ?? data.num_found ?? 0) };
}
export function extractIdentity(provider: Provider, entity: Entity, input: string) {
    let id = input.trim();
    if (/^https?:/i.test(id)) {
        let url: URL;
        try {
            url = new URL(id);
        }
        catch {
            throw new BusinessError(ErrorCode.PARAM_ERROR, "Invalid media URL");
        }
        if (url.protocol !== "https:" || url.port || url.username || url.password)
            throw new BusinessError(ErrorCode.PARAM_ERROR, "Unsupported media URL");
        if (provider === "TMDB" && ["www.themoviedb.org", "themoviedb.org"].includes(url.hostname)) {
            const match = /^\/(movie|tv)\/(\d+)(?:-[^/]*)?\/?$/.exec(url.pathname);
            if (!match || (entity === "MOVIE" ? "movie" : "tv") !== match[1])
                throw new BusinessError(ErrorCode.PARAM_ERROR, "Media type does not match URL");
            id = match[2];
        }
        else if (provider === "TMDB" && ["www.imdb.com", "imdb.com"].includes(url.hostname)) {
            id = /^\/title\/(tt\d+)\/?$/.exec(url.pathname)?.[1] ?? "";
        }
        else if (provider === "OPEN_LIBRARY" && url.hostname === "openlibrary.org") {
            id = /^\/(?:works|books|isbn)\/([^/]+)(?:\/.*)?$/.exec(url.pathname)?.[1] ?? "";
        }
        else
            throw new BusinessError(ErrorCode.PARAM_ERROR, "Unsupported media URL host");
    }
    if (provider === "TMDB" ? !/^(?:\d+|tt\d+)$/.test(id) : !/^(?:OL\d+[WM]|\d{9}[\dXx]|\d{13})$/.test(id.replace(/-/g, "")))
        throw new BusinessError(ErrorCode.PARAM_ERROR, "Invalid source identity");
    return provider === "OPEN_LIBRARY" ? id.replace(/-/g, "") : id;
}
export async function resolveMedia(provider: Provider, entityType: Entity, input: string, read: typeof get = get): Promise<Source> {
    let id = extractIdentity(provider, entityType, input);
    if (provider === "TMDB") {
        if (entityType === "BOOK")
            throw new BusinessError(ErrorCode.PARAM_ERROR, "Unsupported TMDB type");
        if (id.startsWith("tt")) {
            const { data } = await read(tmdb(`find/${id}`, { external_source: "imdb_id" }));
            const rows = entityType === "MOVIE" ? data.movie_results : data.tv_results;
            if (!rows?.length)
                throw new BusinessError(ErrorCode.PARAM_ERROR, "IMDb identity has no supported movie or whole-series match");
            id = String(rows[0].id);
        }
        const kind = entityType === "MOVIE" ? "movie" : "tv";
        const { data } = await read(tmdb(`${kind}/${id}`, { append_to_response: "credits" }));
        let description = plain(data.overview, 10000), language = description ? "zh-CN" : null;
        if (!description) {
            try {
                const fallback = await read(tmdb(`${kind}/${id}`, { language: "en-US" }));
                description = plain(fallback.data.overview, 10000);
                language = description ? "en-US" : null;
            }
            catch { /* A missing fallback does not erase otherwise usable metadata. */ }
        }
        const creators = kind === "movie" ? (data.credits?.crew ?? []).filter((v: any) => v.job === "Director") : data.created_by ?? [];
        const company = !creators.length ? data.production_companies?.[0]?.name : null;
        const image = typeof data.poster_path === "string" && /^\/[A-Za-z0-9._-]+$/.test(data.poster_path) ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null;
        return { provider, entityType, stableSourceId: id, canonicalUrl: `https://www.themoviedb.org/${kind}/${id}`, attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.", metadata: { title: plain(data.title ?? data.name, 200) ?? "Untitled", originalTitle: plain(data.original_title ?? data.original_name, 200), creator: plain(creators.map((v: any) => v.name).join("、") || company, 160), creatorRole: creators.length ? (kind === "movie" ? "director" : "created_by") : company ? "production_company" : null, releaseYear: year(data.release_date ?? data.first_air_date), description, descriptionLanguage: language, coverRef: image, isAnimation: (data.genres ?? []).some((v: any) => v.id === 16) } };
    }
    if (entityType !== "BOOK")
        throw new BusinessError(ErrorCode.PARAM_ERROR, "Unsupported Open Library type");
    let editionId: string | undefined, isbn: string | undefined, edition: any;
    if (!id.endsWith("W")) {
        const isEdition = id.endsWith("M");
        isbn = isEdition ? undefined : id;
        const result = await read(new URL(`https://openlibrary.org/${isEdition ? "books" : "isbn"}/${id}.json`));
        edition = result.data;
        editionId = String(edition.key ?? "").split("/").pop();
        id = String(edition.works?.[0]?.key ?? "").split("/").pop() ?? "";
        if (!/^OL\d+W$/.test(id))
            throw new BusinessError(ErrorCode.PARAM_ERROR, "This edition has no canonical work; use manual entry");
    }
    let work = await read(new URL(`https://openlibrary.org/works/${id}.json`));
    const visited=new Set([id]);
    for(let hop=0;work.data.type?.key==="/type/redirect";hop++){
        const next=/^\/works\/(OL\d+W)$/.exec(String(work.data.location ?? ""))?.[1];
        if(!next || hop>=3 || visited.has(next)) throw new BusinessError(ErrorCode.PARAM_ERROR,"Invalid or circular Open Library work redirect");
        visited.add(next);work=await read(new URL(`https://openlibrary.org/works/${next}.json`));id=next;
    }
    const {data,url}=work;
    id=/^\/works\/(OL\d+W)$/.exec(String(data.key ?? ""))?.[1] ?? /^\/works\/(OL\d+W)\.json$/.exec(url.pathname)?.[1] ?? id;
    const authorKey = data.authors?.[0]?.author?.key;
    let author: string | null = null;
    try {
        author = typeof authorKey === "string" && /^\/authors\/OL\d+A$/.test(authorKey) ? (await read(new URL(`https://openlibrary.org${authorKey}.json`))).data.name : null;
    }
    catch { /* Author is optional. */ }
    let firstYear = year(data.first_publish_date ?? edition?.publish_date);
    if (!firstYear) {
        const yearUrl = new URL("https://openlibrary.org/search.json");
        yearUrl.search = new URLSearchParams({ q: `key:/works/${id}`, fields: "first_publish_year", limit: "1" }).toString();
        try {
            firstYear = year((await read(yearUrl)).data.docs?.[0]?.first_publish_year);
        }
        catch { /* Optional year lookup: retain the rest of the preview. */ }
    }
    const cover = (data.covers ?? edition?.covers ?? []).find((v: unknown) => typeof v === "number" && v > 0);
    return { provider, entityType, stableSourceId: id, canonicalUrl: `https://openlibrary.org/works/${id}`, attribution: "Book metadata: Open Library / Internet Archive", metadata: { title: plain(data.title, 200) ?? "Untitled", originalTitle: null, creator: plain(author, 160), creatorRole: author ? "author" : null, releaseYear: firstYear, description: plain(data.description ?? edition?.description, 10000), descriptionLanguage: null, coverRef: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : null, isAnimation: false, ...(editionId ? { editionId } : {}), ...(isbn ? { isbn } : {}) } };
}
