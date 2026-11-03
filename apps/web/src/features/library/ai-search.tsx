import { useEffect, useState } from "react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";

type MediaType = "BOOK" | "MOVIE" | "SERIES";
type Candidate = { title: string; originalTitle: string | null; creator: string | null; releaseYear: number | null; description: string | null; sources: Array<{ url: string; title: string }> };
type Search = { operationId: string; query: string; mediaType: MediaType; status: string; result?: { candidates: Candidate[] }; searchCalls?: number; fetchCalls?: number };
const key = (userId: number) => `wb.library-ai-search.v1:${userId}`;
export function clearLibraryAiSearchDrafts() { for (const name of Object.keys(localStorage)) if (name.startsWith("wb.library-ai-search.v1:")) localStorage.removeItem(name); }
export function LibraryAiSearch({ request, userId, mediaType, onUse }: { request: Request; userId: number; mediaType: MediaType; onUse: (title: string) => void }) {
  const [query, setQuery] = useState(""), [saved, setSaved] = useState<Search | null>(() => { try { const value = localStorage.getItem(key(userId)); return value ? JSON.parse(value) as Search : null; } catch { return null; } }), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (!saved || saved.status !== "PENDING") return; let active = true; request<Search>(`/api/library/import/ai-search/${saved.operationId}`).then(value => { if (!active) return; setSaved(value); localStorage.setItem(key(userId), JSON.stringify(value)); }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => { if (saved && saved.mediaType !== mediaType && saved.status !== "PENDING") { setSaved(null); localStorage.removeItem(key(userId)); } }, [mediaType, saved, userId]);
  async function run(operationId = crypto.randomUUID(), retry = false) { const text = (query.trim() || saved?.query || "").trim(), kind = retry ? saved?.mediaType ?? mediaType : mediaType; if (!text || busy) return; setBusy(true); setError(""); const pending: Search = { operationId, query: text, mediaType: kind, status: "PENDING" }; setSaved(pending); localStorage.setItem(key(userId), JSON.stringify(pending)); try { const result = await request<Search>("/api/library/import/ai-search", { method: "POST", body: JSON.stringify({ operationId, query: pending.query, mediaType: kind }) }); setSaved(result); localStorage.setItem(key(userId), JSON.stringify(result)); } catch (e) { setError(e instanceof Error ? e.message : tx("搜索失败")); } finally { setBusy(false); } }
  async function refresh() { if (!saved) return; setBusy(true); try { const result = await request<Search>(`/api/library/import/ai-search/${saved.operationId}`); setSaved(result); localStorage.setItem(key(userId), JSON.stringify(result)); } catch (e) { setError(e instanceof Error ? e.message : tx("读取搜索结果失败")); } finally { setBusy(false); } }
  return <section className="library-ai-search" aria-label={tx("AI 搜索") }>
    <h3>{tx("AI 搜索参考")}</h3><p>{tx("AI 联网查找可能匹配的作品。选择后仍需用 TMDB 或 Open Library 核对来源、封面并确认导入。")}</p>
    <div className="library-ai-search-input"><input className="field" maxLength={160} value={query} onChange={e => setQuery(e.target.value)} placeholder={tx("输入书名、电影或剧集名称")}/><Button type="button" disabled={busy || !query.trim()} onClick={() => void run()}>{busy ? tx("搜索中") : tx("AI 搜索")}</Button></div>
    {error ? <p role="alert" className="notes-error">{error}</p> : null}
    {saved ? <div className="library-ai-results"><p>{tx("搜索状态：")}{saved.status === "SUCCEEDED" ? tx("完成") : saved.status === "PENDING" ? tx("处理中") : saved.status === "FAILED_UNKNOWN" ? tx("结果未知") : tx("失败")}</p>
      {saved.status === "PENDING" || saved.status === "FAILED_UNKNOWN" ? <Button type="button" disabled={busy} onClick={() => void refresh()}>{tx("查询本次搜索状态")}</Button> : null}
      {saved.status === "FAILED_UNKNOWN" || saved.status === "FAILED" ? <Button type="button" disabled={busy} onClick={() => void run(crypto.randomUUID(), true)}>{tx("重新搜索（可能产生费用）")}</Button> : null}
      {saved.status === "SUCCEEDED" ? <><p>{tx("联网搜索调用：")}{saved.searchCalls ?? 0} · {tx("网页读取：")}{saved.fetchCalls ?? 0}</p>{(saved.result?.candidates ?? []).map((candidate, i) => <article className="library-ai-candidate" key={`${candidate.title}:${i}`}><h4>{candidate.title}{candidate.originalTitle ? ` · ${candidate.originalTitle}` : ""}</h4><p>{[candidate.creator, candidate.releaseYear].filter(Boolean).join(" · ") || tx("创作者与年份未核实")}</p>{candidate.description ? <p>{candidate.description}</p> : null}<div className="library-ai-candidate-sources">{candidate.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</div><Button type="button" onClick={() => onUse(candidate.title)}>{tx("用此名称查可信资料")}</Button></article>)}</> : null}
    </div> : null}
  </section>;
}
