import https from "node:https";
import { lookup, Resolver } from "node:dns";
import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { publicAddress, plain } from "./providers.js";
import { env } from "../env.js";
import { referenceUrl, searchWebPages } from "./web-search.js";

export type CoverWork = { title: string; originalTitle: string | null; creator: string | null; releaseYear: number | null; sources: Array<{ url: string; title: string }>; coverRef?: string | null; coverSourceUrl?: string | null };
export type CoverCandidate = { id: string; imageUrl: string; sourcePageUrl: string; sourceTitle: string; extractionMethod: string; kind: "COVER" | "POSTER" | "ARTWORK" | "UNCONFIRMED"; width: number | null; height: number | null; needsReview: true };
// Reviewed page/CDN relationships, not a generic URL-fetching or image-proxy surface.
const sites = [
  { host: "frieren-anime.jp", path: /^\/(?:$|tv\/|news\/\d+\/?$|special\/gallery\/?$)/, images: [] },
  { host: "store.steampowered.com", path: /^\/(?:app|sub)\/\d+(?:\/|$)/, images: ["shared.akamai.steamstatic.com", "shared.fastly.steamstatic.com", "cdn.akamai.steamstatic.com", "cdn.cloudflare.steamstatic.com"] },
  { host: "standardebooks.org", path: /^\/ebooks\/.+/, images: [] },
  { host: "www.gutenberg.org", path: /^\/ebooks\/\d+\/?$/, images: [] },
  { host: "openlibrary.org", path: /^\/(?:works|books)\/OL\d+[WM](?:\/|$)/, images: ["covers.openlibrary.org"] },
  { host: "en.wikipedia.org", path: /^\/wiki\/.+/, images: ["upload.wikimedia.org"] },
  { host: "zh.wikipedia.org", path: /^\/wiki\/.+/, images: ["upload.wikimedia.org"] },
  { host: "baike.baidu.com", path: /^\/item\/[^/]+(?:\/\d+)?\/?$/, images: ["bkimg.cdn.bcebos.com", "baikebcs.bdimg.com", "imgsrc.baidu.com"] },
  { host: "books.google.com", path: /^\/books/, images: ["books.googleusercontent.com"] },
  { host: "www.sanmin.com.tw", path: /^\/product\/index\/\d+\/?$/, images: ["cdnec.sanmin.com.tw"] },
  { host: "www.1905.com", path: /^\/mdb\/film\/\d+(?:\/info)?\/?$/, images: ["image11.m1905.cn", "image14.m1905.cn", "image13.m1905.cn", "image.m1905.cn"] },
  { host: "www.eslite.com", path: /^\/product\/\d+/, images: ["s.eslite.com"] },
  { host: "www.penguinrandomhouse.com", path: /^\/books\/.+/, images: ["images.penguinrandomhouse.com"] },
];
function safeUrl(raw: string) {
  const value = referenceUrl(raw); if (!value) return null;
  const url = new URL(value);
  return url.href.length <= 500 && !url.hostname.endsWith(".") ? url : null;
}
export function coverPageUrl(raw: string) {
  const url = safeUrl(raw);
  if (url?.hostname === "standardebooks.org") {
    // Strip only a text chapter suffix; translator/illustrator edition paths remain intact.
    url.pathname = url.pathname.replace(/\/text\/.*$/, "");
  }
  if (url?.hostname === "zh.m.wikipedia.org") url.hostname = "zh.wikipedia.org";
  if (url?.hostname === "en.m.wikipedia.org") url.hostname = "en.wikipedia.org";
  if (url && ["zh.wikipedia.org", "en.wikipedia.org"].includes(url.hostname)) url.pathname = url.pathname.replace(/^\/(?:zh-cn|zh-tw|zh-hk)\//, "/wiki/");
  if (url?.hostname === "wapbaike.baidu.com") { url.hostname = "baike.baidu.com"; url.search = ""; }
  return url && sites.some(site => site.host === url.hostname && site.path.test(url.pathname)) ? url : null;
}
export function imageForPage(raw: string, page: URL): URL | null {
  try {
    const url = safeUrl(new URL(raw, page).href), site = sites.find(site => site.host === page.hostname && site.path.test(page.pathname));
    if (!url || !site || !(url.hostname === site.host || site.images.includes(url.hostname))) return null;
    if (/\.(?:svg|gif|ico|html?)(?:$|\/)|(?:favicon|sprite|\/logo[._/-])/i.test(url.pathname)) return null;
    if (url.hostname === "bkimg.cdn.bcebos.com" && !/^\/pic\/[\w-]{16,200}(?:\.(?:jpe?g|png|webp))?$/i.test(url.pathname)) return null;
    if (["baikebcs.bdimg.com", "imgsrc.baidu.com"].includes(url.hostname) && !/^\/baike\/pic\/item\/[\w-]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}
const resolver = new Resolver({timeout:3000,tries:1});
if (env.MEDIA_PUBLIC_DNS) resolver.setServers(env.MEDIA_PUBLIC_DNS.split(","));
export type CoverRead = (url: URL, kind: "page" | "image", page: URL, signal: AbortSignal) => Promise<{ url: URL; bytes: Buffer; contentType: string }>;
export const readCoverResource: CoverRead = async (url, kind, page, signal) => {
  const read = (current: URL, hops: number): ReturnType<CoverRead> => new Promise((resolve, reject) => {
    const allowed = kind === "page" ? coverPageUrl(current.href)?.hostname === page.hostname : imageForPage(current.href, page);
    if (!allowed || hops > 2) { reject(Error("Unsupported cover resource")); return; }
    const req = https.get(current, {
      headers: { Accept: kind === "page" ? "text/html,application/xhtml+xml" : "image/jpeg,image/png,image/webp", "Accept-Encoding": "identity", "User-Agent": env.OPEN_LIBRARY_USER_AGENT },
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      lookup(host, _options, callback) {
        const done = (error: NodeJS.ErrnoException | null, addresses: Array<{address:string;family:number}>) => {
          // Pin the actual socket address; never resolve a checked hostname a second time.
          if (error || !addresses.length || addresses.some(row => !publicAddress(row.address))) { callback(error ?? Error("Non-public cover address"), "", 4); return; }
          if (_options.all) (callback as unknown as (error: null, values: Array<{address:string;family:number}>) => void)(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        };
        if (env.MEDIA_PUBLIC_DNS) resolver.resolve4(host, (error, addresses) => done(error, (addresses ?? []).map(address => ({address,family:4}))));
        else lookup(host, {all:true}, done);
      },
    }, response => {
      response.on("error", reject);
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        response.resume();
        try { if (!response.headers.location) throw Error("Missing redirect"); read(new URL(response.headers.location, current), hops + 1).then(resolve, reject); } catch (error) { reject(error); }
        return;
      }
      const contentType = (response.headers["content-type"] ?? "").split(";")[0].toLowerCase();
      const accepted = kind === "page" ? ["text/html", "application/xhtml+xml"] : ["image/jpeg", "image/png", "image/webp"];
      if (response.statusCode !== 200 || !accepted.includes(contentType) || response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") { response.resume(); reject(Error("Cover resource unavailable")); return; }
      let size = 0; const parts: Buffer[] = [], max = kind === "page" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
      response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > max) { response.destroy(); reject(Error("Cover resource too large")); } else parts.push(chunk); });
      response.on("end", () => resolve({ url: current, bytes: Buffer.concat(parts), contentType }));
    });
    req.on("error", reject);
  });
  return read(url, 0);
};

export function extractPageCovers(html: string, page: URL) {
  const found: Array<{ imageUrl: string; extractionMethod: string }> = [];
  const add = (raw: unknown, method: string) => { if (typeof raw !== "string") return; const image = imageForPage(raw, page); if (image && !found.some(row => row.imageUrl === image.href)) found.push({ imageUrl: image.href, extractionMethod: method }); };
  type Node = DefaultTreeAdapterMap["node"];
  function visit(node: Node) {
    if ("tagName" in node) {
      const attrs = Object.fromEntries(node.attrs.map(attr => [attr.name, attr.value]));
      if (node.tagName === "meta" && ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"].includes((attrs.property || attrs.name || "").toLowerCase())) add(attrs.content, "PAGE_META");
      if (node.tagName === "img" && /封面|海报|cover|poster/i.test([attrs.alt, attrs.class, attrs.id].join(" ")) && !/logo|icon|头像|人物/i.test(attrs.alt ?? "")) add(attrs.src || attrs["data-src"], "LABELED_IMAGE");
      if (node.tagName === "script" && attrs.type === "application/ld+json") {
        const text = node.childNodes.filter((child): child is DefaultTreeAdapterMap["textNode"] => child.nodeName === "#text").map(child => child.value).join("");
        try {
          const data = JSON.parse(text);
          function images(value: unknown, depth = 0) {
            if (!value || depth > 5) return;
            if (Array.isArray(value)) { value.slice(0, 20).forEach(item => images(item, depth + 1)); return; }
            if (typeof value !== "object") return;
            const object = value as Record<string, unknown>;
            if (/Book|Movie|TVSeries|VideoGame|Product/i.test(String(object["@type"]))) {
              for (const image of Array.isArray(object.image) ? object.image : [object.image]) add(typeof image === "object" && image ? (image as { url?: unknown }).url : image, "STRUCTURED_DATA");
            }
            images(object["@graph"], depth + 1);
          }
          images(data);
        } catch { /* Broken structured data must not erase usable metadata. */ }
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(parse(html));
  return found.sort((a, b) => Number(a.extractionMethod === "LABELED_IMAGE") - Number(b.extractionMethod === "LABELED_IMAGE")).slice(0, 6);
}
export function imageDimensions(bytes: Buffer, type: string): { width: number | null; height: number | null } | null {
  if (type === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (type === "image/webp" && bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    if (bytes.toString("ascii", 12, 16) === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    return { width: null, height: null }; // Browser decoding remains required for VP8 / VP8L.
  }
  if (type === "image/jpeg" && bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset++] !== 255) continue;
      const marker = bytes[offset++]; if (marker === 216 || marker === 217 || marker === 0) continue;
      const length = bytes.readUInt16BE(offset); if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      offset += length;
    }
  }
  return null;
}
const name = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function matchesCoverTitle(work: CoverWork, title: string) {
  return [work.title, ...(work.originalTitle?.split(/\s+\/\s+/) ?? [])].some(value => value && name(value).length >= 2 && name(title).includes(name(value)));
}
export async function discoverCovers(work: CoverWork, mediaType: string, signal: AbortSignal, read: CoverRead = readCoverResource, search = searchWebPages) {
  const candidates: CoverCandidate[] = [], failures: string[] = [];
  let pageCalls = 0, imageCalls = 0, searchCalls = 0;
  const seen = new Set<string>(), seenImages = new Set<string>();
  async function pages(sources: CoverWork["sources"]) {
    // Sequential reads keep source load low and bound both pages and image probes.
    for (const source of sources) {
      signal.throwIfAborted();
      const page = coverPageUrl(source.url); if (!page || seen.has(page.href) || pageCalls >= 3) continue;
      seen.add(page.href); pageCalls++;
      try {
        const response = await read(page, "page", page, signal);
        const images = extractPageCovers(response.bytes.toString("utf8"), response.url);
        for (const image of images) {
          if (imageCalls >= 6 || candidates.length >= 6 || seenImages.has(image.imageUrl)) continue;
          seenImages.add(image.imageUrl); imageCalls++;
          try {
            const checked = await read(new URL(image.imageUrl), "image", response.url, signal);
            const dimensions = imageDimensions(checked.bytes, checked.contentType);
            if (!dimensions || dimensions.width !== null && (dimensions.width < 120 || dimensions.height! < 100 || dimensions.width > 12000 || dimensions.height! > 12000)) continue;
            candidates.push({ id: createHash("sha256").update(response.url.href + "\n" + checked.url.href).digest("hex").slice(0, 32), imageUrl: checked.url.href, sourcePageUrl: response.url.href, sourceTitle: plain(source.title, 200) ?? work.title, extractionMethod: image.extractionMethod, kind: mediaType === "SERIES" && response.url.hostname.endsWith("wikipedia.org") ? "UNCONFIRMED" : mediaType === "BOOK" ? "COVER" : mediaType === "GAME" || dimensions.width !== null && dimensions.height !== null && dimensions.width > dimensions.height ? "ARTWORK" : "POSTER", ...dimensions, needsReview: true });
          } catch { failures.push("IMAGE_UNAVAILABLE"); }
        }
      } catch { failures.push("PAGE_UNAVAILABLE"); }
      if (candidates.length >= 6) break;
    }
  }
  try {
    await pages(work.sources);
    if (!candidates.some(candidate => candidate.kind !== "UNCONFIRMED") && pageCalls < 3 && !signal.aborted) {
      searchCalls = 1;
      const title = (mediaType === "BOOK" ? work.title : work.originalTitle || work.title).split(/\s+\/\s+/)[0].replace(/"/g, " ");
      const scope = mediaType === "SERIES" ? "アニメ 公式 ビジュアル" : mediaType === "GAME" ? "site:store.steampowered.com/app/" : mediaType === "BOOK" ? "(site:sanmin.com.tw/product OR site:standardebooks.org/ebooks OR site:gutenberg.org/ebooks)" : "site:en.wikipedia.org/wiki/";
      const queryTitle = title.slice(0, Math.min(64, 128 - scope.length - 3));
      const query = `"${queryTitle}" ${scope}`;
      const found = await search(query, 5, signal);
      await pages(found.results.filter(row => matchesCoverTitle(work, row.title)));
    }
    signal.throwIfAborted();
    return { candidates: candidates.sort((a,b) => Number(a.kind === "UNCONFIRMED") - Number(b.kind === "UNCONFIRMED")), failures: [...new Set(failures)], pageCalls, imageCalls, searchCalls };
  } catch (error) { throw Object.assign(error instanceof Error ? error : Error("Cover lookup failed"), { pageCalls, imageCalls, searchCalls }); }
}
