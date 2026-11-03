import { isIP } from "node:net";
import { z } from "zod";
import type { AiGateway, GatewayResult } from "../ai-foundation.js";
import { deepseekGateway } from "../deepseek.js";
import { env } from "../env.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { plain, publicAddress } from "./providers.js";

export type WebEvidence = { url: string; title: string; content: string; covers: string[] };
export type LibrarySearchGateway = Pick<AiGateway, "provider" | "model"> & {
  search(input: Parameters<AiGateway["generateStructured"]>[0]): Promise<GatewayResult & { evidence: WebEvidence[]; searchCalls: number; fetchCalls: number }>;
};
// Discovery never makes server requests to these URLs. Only the fixed DeepSeek API is fetched.
export function referenceUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || url.username || url.password || !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|douban\.com|themoviedb\.org)$/.test(url.hostname) || (isIP(url.hostname.replace(/[\[\]]/g, "")) && !publicAddress(url.hostname.replace(/[\[\]]/g, "")))) return null;
    url.hash = "";
    if (url.hostname === "www.eslite.com" && /^\/product\/[0-9]+$/.test(url.pathname) || url.hostname === "www.duozhuayu.com" && /^\/books\/[0-9]+$/.test(url.pathname)) url.search = "";
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    return url.href.length <= 500 ? url.href : null;
  } catch { return null; }
}
export function coverUrl(raw: string): string | null {
  const value = referenceUrl(raw); if (!value) return null;
  const url = new URL(value);
  // Dedicated public image endpoints; no arbitrary tracking hosts, SVG or generated cover art.
  if (url.hostname === "covers.openlibrary.org" && /^\/b\/(?:id|isbn|olid)\/[A-Za-z0-9-]+\.jpg$/.test(url.pathname)) return value;
  if (url.hostname === "upload.wikimedia.org" && /\.(?:jpe?g|png|webp)$/i.test(url.pathname) && !/\.svg\//i.test(url.pathname)) return value;
  if (url.hostname === "books.google.com" && url.pathname === "/books/content" && url.searchParams.has("id") && url.searchParams.has("img")) return value;
  return null;
}
export function evidenceCovers(content: string): string[] {
  const urls = content.match(/https:\/\/[^\s<>"'\])]+/g) ?? [];
  return [...new Set(urls.map(url => coverUrl(url.replace(/&amp;/g, "&"))).filter((v): v is string => Boolean(v)))].slice(0, 4);
}
const searchResponse = z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), summary: z.string().nullish(), snippet: z.string().nullish(), content: z.string().nullish() })).max(50) });
async function boundedJson(response: Response) {
  const reader = response.body?.getReader(); if (!reader) throw new Error("Empty search response");
  const parts: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("Search response too large"); } parts.push(value); }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export const librarySearchGateway: LibrarySearchGateway = {
  provider: "deepseek", model: deepseekGateway.model,
  async search(input) {
    const { query, mediaType } = JSON.parse(input.user) as { query: string; mediaType: string };
    if (!env.DEEPSEEK_API_KEY) throw new BusinessError(ErrorCode.PARAM_ERROR, "DeepSeek is not configured", 500);
    const response = await fetch(`${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/v1/tools/search`, {
      method: "POST", headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      body: JSON.stringify({ query: `${query} ${mediaType === "BOOK" ? "图书 作者 封面" : mediaType === "GAME" ? "游戏 开发商" : "影视 简介"} -site:douban.com -site:themoviedb.org`, count: 5, need_content: true }),
    });
    if (!response.ok) throw new BusinessError(ErrorCode.SERVER_ERROR, `DeepSeek search failed (${response.status}); no automatic retry`, 500);
    let parsed: z.infer<typeof searchResponse>;
    try { parsed = searchResponse.parse(await boundedJson(response)); }
    catch { throw Object.assign(new Error("Search response invalid; another search may incur a charge"), { searchCalls: 1, fetchCalls: 0 }); }
    const evidence = parsed.results.flatMap(row => {
      const url = referenceUrl(row.url); if (!url) return [];
      const raw = (row.content || row.summary || row.snippet || "").slice(0, 16000);
      const content = raw.slice(0, 1000);
      return [{ url, title: plain(row.title, 200) ?? url, content, covers: evidenceCovers(raw) }];
    }).slice(0, 5);
    if (!evidence.length) return { payload: { candidates: [] }, evidence, searchCalls: parsed.results.length ? 1 : 0, fetchCalls: 0 };
    try {
      const result = await deepseekGateway.generateStructured({ ...input, user: JSON.stringify({ query, mediaType, evidence: evidence.map((row, index) => ({ index, ...row })) }) });
      return { ...result, evidence, searchCalls: 1, fetchCalls: 0 };
    } catch {
      // The paid search completed even if later generation failed; preserve tool telemetry.
      throw Object.assign(new Error("Search completed but metadata generation failed; another search may incur a charge"), { searchCalls: 1, fetchCalls: 0 });
    }
  },
};
