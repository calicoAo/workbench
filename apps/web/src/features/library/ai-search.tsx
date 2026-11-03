import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";

type MediaType = "BOOK" | "MOVIE" | "SERIES" | "GAME";
type Candidate = { title: string; originalTitle: string | null; creator: string | null; releaseYear: number | null; description: string | null; coverRef?: string | null; sources: Array<{ url: string; title: string }> };
type Search = { operationId: string; query: string; mediaType: MediaType; status: string; result?: { candidates: Candidate[] }; searchCalls?: number; fetchCalls?: number };
const key = (userId: number) => `wb.library-ai-search.v1:${userId}`;
export function clearLibraryAiSearchDrafts() { for (const name of Object.keys(localStorage)) if (name.startsWith("wb.library-ai-search.v1:")) localStorage.removeItem(name); }
export function LibraryAiSearch({ request, userId, mediaType, query = "", onQuery = () => {}, disabled = false, onUse }: { request: Request; userId: number; mediaType: MediaType; query?: string; onQuery?: (query: string) => void; disabled?: boolean; onUse: (operationId: string, candidateIndex: number) => void }) {
  const [saved, setSaved] = useState<Search | null>(() => { try { const value = localStorage.getItem(key(userId)); return value ? JSON.parse(value) as Search : null; } catch { return null; } });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [unclaimed, setUnclaimed] = useState(false);
  const active = useRef(true), running = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function persist(value: Search) {
    if (!active.current) return;
    const current = localStorage.getItem(key(userId));
    if (!current || JSON.parse(current).operationId !== value.operationId) throw Error(tx("搜索已在其他窗口更改，请刷新。"));
    localStorage.setItem(key(userId), JSON.stringify(value)); setSaved(value);
  }
  async function refresh(value = saved) {
    if (!value || running.current) return;
    running.current = true; setBusy(true); setError("");
    try { persist(await request<Search>(`/api/library/import/ai-search/${value.operationId}`)); setUnclaimed(false); }
    catch (e) { if (active.current) { setError(e instanceof Error ? e.message : tx("读取搜索结果失败")); if ((e as { status?: number }).status === 404) setUnclaimed(true); } }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  useEffect(() => { if (saved?.status === "PENDING") void refresh(saved); }, []);
  async function run(retrySame = false) {
    const text = retrySame ? saved?.query : query.trim();
    if (!text || running.current || disabled) return;
    running.current = true; setBusy(true); setError(""); setUnclaimed(false);
    const pending: Search = retrySame && saved ? saved : { operationId: crypto.randomUUID(), query: text, mediaType, status: "PENDING" };
    try {
      if (!retrySame) {
        const current = localStorage.getItem(key(userId));
        if (current && JSON.parse(current).status === "PENDING") throw Error(tx("搜索已在其他窗口更改，请刷新。"));
        localStorage.setItem(key(userId), JSON.stringify(pending)); setSaved(pending);
      }
      persist(await request<Search>("/api/library/import/ai-search", { method: "POST", body: JSON.stringify({ operationId: pending.operationId, query: pending.query, mediaType: pending.mediaType }) }));
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : tx("搜索失败")); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  const waiting = saved?.status === "PENDING";
  return <section className="library-ai-search" aria-label={tx("AI 搜索")}>
    <h3>{tx("AI 网页搜索")}</h3><p>{tx("联网查找并整理作品资料，直接预览后导入，无需 TMDB。AI 资料请核对；封面仅使用搜索证据中可识别的图片，没有封面也可保存。")}</p>
    <div className="library-ai-search-input"><input className="field" aria-label={tx("AI 搜索词")} maxLength={72} value={query} disabled={busy || disabled} onChange={e => onQuery(e.target.value)} placeholder={tx("输入作品名称、作者或 ISBN")}/><Button type="button" disabled={busy || disabled || waiting || !query.trim()} onClick={() => void run()}>{busy ? tx("搜索中") : tx("AI 搜索")}</Button></div>
    {error ? <><p role="alert" className="notes-error">{error}</p><Link to="/settings?topic=ai">{tx("AI 权限与用量")}</Link></> : null}
    {saved ? <div className="library-ai-results"><p>{saved.query} · {tx("搜索状态：")}{saved.status === "SUCCEEDED" ? tx("完成") : waiting ? tx("处理中") : saved.status === "FAILED_UNKNOWN" ? tx("结果未知，可能已计费") : tx("失败")}</p>
      {waiting || saved.status === "FAILED_UNKNOWN" ? <Button type="button" disabled={busy} onClick={() => void refresh()}>{tx("查询本次搜索状态")}</Button> : null}
      {unclaimed ? <Button type="button" disabled={busy || disabled} onClick={() => void run(true)}>{tx("重试同一次搜索请求")}</Button> : null}
      {saved.status === "FAILED_UNKNOWN" || saved.status === "FAILED" ? <p>{tx("确认重新搜索会使用新的操作 ID，可能再次产生费用。请核对输入后点击 AI 搜索。")}</p> : null}
      {saved.mediaType !== mediaType ? <p>{tx("这是其他作品类型的搜索结果，请切回对应类型后选择。")}</p> : null}
      {saved.status === "SUCCEEDED" ? <><p>{tx("联网搜索调用：")}{saved.searchCalls ?? 0}</p>{!saved.result?.candidates.length ? <p>{tx("未找到有可靠出处的候选。请补充作者、年份或 ISBN 后重新搜索，也可手动录入。")}</p> : null}{(saved.result?.candidates ?? []).map((candidate, i) => <article className="library-ai-candidate" key={`${candidate.title}:${i}`}><h4>{candidate.title}{candidate.originalTitle ? ` · ${candidate.originalTitle}` : ""}</h4><p>{[candidate.creator, candidate.releaseYear].filter(Boolean).join(" · ") || tx("创作者与年份未核实")}</p>{candidate.description ? <p>{candidate.description}</p> : null}<p>{candidate.coverRef ? tx("包含待核对封面，进入预览查看") : tx("未找到可靠封面")}</p><div className="library-ai-candidate-sources">{candidate.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</div><Button type="button" disabled={disabled || busy || saved.mediaType !== mediaType} onClick={() => onUse(saved.operationId, i)}>{tx("预览此作品资料")}</Button></article>)}</> : null}
    </div> : null}
  </section>;
}
