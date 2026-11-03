import { useEffect, useRef, useState } from "react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
export type CoverOption = { id: string; imageUrl: string; sourcePageUrl: string; sourceTitle: string; width: number | null; height: number | null; kind: string };
export type CoverLookup = { operationId: string; parentOperationId: string; candidateIndex: number; status: string; result?: { candidates: CoverOption[]; failures: string[] } | null; searchCalls?: number; pageCalls?: number; imageCalls?: number; usage?: { inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null } };
export function LibraryCoverPicker({ request, selection, saved, selectedId, disabled, onChange, onChoose, onBusy }: { request: Request; selection: { operationId: string; candidateIndex: number }; saved?: CoverLookup; selectedId?: string; disabled: boolean; onChange: (lookup: CoverLookup) => void; onChoose: (operationId: string, candidateId: string) => Promise<void>; onBusy: (busy: boolean) => void }) {
  const active = useRef(true), running = useRef(false), attemptedDefault = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notClaimed, setNotClaimed] = useState(false);
  const base = `/api/library/import/ai-search/${selection.operationId}/covers`;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function run(mode: "new" | "read" | "replay") {
    if (running.current || disabled) return;
    running.current = true; setBusy(true); onBusy(true); setError(""); setNotClaimed(false);
    const pending: CoverLookup = mode === "new" || !saved ? { operationId: crypto.randomUUID(), parentOperationId: selection.operationId, candidateIndex: selection.candidateIndex, status: "PENDING" } : saved;
    try {
      if (mode === "new") { onChange(pending); attemptedDefault.current = false; }
      const value = mode === "read" ? await request<CoverLookup>(`${base}/${pending.operationId}`) : await request<CoverLookup>(base, { method: "POST", body: JSON.stringify({ operationId: pending.operationId, candidateIndex: selection.candidateIndex }) });
      if (active.current) onChange(value);
    } catch (e) { if (active.current) { setError(e instanceof Error ? e.message : tx("查找封面失败，已保留资料")); if (mode === "read" && (e as { status?: number }).status === 404) setNotClaimed(true); } }
    finally { running.current = false; if (active.current) { setBusy(false); onBusy(false); } }
  }
  // Selection is an explicit user action. Persist its identity before POST; refresh only reads.
  useEffect(() => { if (!saved) void run("new"); else if (saved.status === "PENDING") void run("read"); }, []);
  async function choose(id: string, automatic = false) {
    if (running.current || disabled || !saved || saved.status !== "SUCCEEDED") return;
    if (automatic) { if (selectedId || attemptedDefault.current) return; attemptedDefault.current = true; }
    running.current = true; setBusy(true); onBusy(true); setError("");
    try { await onChoose(saved.operationId, id); }
    catch (e) { if (active.current) setError(e instanceof Error ? e.message : tx("选择封面失败")); }
    finally { running.current = false; if (active.current) { setBusy(false); onBusy(false); } }
  }
  return <section className="library-cover-picker" aria-label={tx("选择作品封面")}>
    <h3>{tx("选择作品封面")}</h3><p>{tx("从匹配的官网、商店、图书及百科页面提取图片。请核对作品和版本；保存的是外部图片链接。")}</p>
    {saved?.status === "SUCCEEDED" ? <p className="library-ai-usage">{tx("封面阶段模型 token：0")} · {tx("补充搜索：")}{saved.searchCalls ?? 0} · {tx("页面读取：")}{saved.pageCalls ?? 0} · {tx("图片验证：")}{saved.imageCalls ?? 0}</p> : null}
    {busy ? <p role="status">{tx("正在查找或验证封面…")}</p> : null}
    {error ? <p role="alert" className="notes-error">{error}</p> : null}
    {saved?.status === "PENDING" || saved?.status === "FAILED_UNKNOWN" ? <Button type="button" disabled={busy || disabled} onClick={() => void run("read")}>{tx("查询本次封面结果")}</Button> : null}
    {notClaimed ? <Button type="button" disabled={busy || disabled} onClick={() => void run("replay")}>{tx("重试原封面请求")}</Button> : null}
    {saved?.status === "FAILED_UNKNOWN" ? <p>{tx("封面结果未知，补充搜索可能已计费。重新查找会发起新操作。")}</p> : null}
    {saved?.status === "SUCCEEDED" && !saved.result?.candidates.length ? <p>{tx("未找到可用封面，可换来源或先保存其他资料。")}</p> : null}
    <div className="library-cover-grid">{saved?.status === "SUCCEEDED" ? saved.result?.candidates.map(option => <CoverTile key={`${saved.operationId}:${option.id}`} option={option} selected={selectedId === option.id} disabled={busy || disabled} onLoad={() => { if (option.kind !== "UNCONFIRMED") void choose(option.id, true); }} onChoose={() => void choose(option.id)}/>) : null}</div>
    {saved && saved.status !== "PENDING" || !saved && error ? <Button type="button" disabled={busy || disabled} onClick={() => void run("new")}>{tx("重新查找封面（可能产生搜索费用）")}</Button> : null}
  </section>;
}
function CoverTile({ option, selected, disabled, onLoad, onChoose }: { option: CoverOption; selected: boolean; disabled: boolean; onLoad: () => void; onChoose: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  return <article className={`library-cover-option${selected ? " is-selected" : ""}`}>
    <img src={option.imageUrl} alt={tx("候选封面")} referrerPolicy="no-referrer" onLoad={async e => { const img = e.currentTarget; try { await img.decode(); if (img.naturalWidth < 120 || img.naturalHeight < 100) throw Error(); setState("ready"); onLoad(); } catch { setState("failed"); } }} onError={() => setState("failed")}/>
    <p>{option.width && option.height ? `${option.width} × ${option.height}` : tx("尺寸待核对")} · {option.kind === "UNCONFIRMED" ? tx("媒介未核实，请手动选择") : tx("请核对版本")}</p>
    <a href={option.sourcePageUrl} target="_blank" rel="noopener noreferrer">{option.sourceTitle}</a>
    {state === "failed" ? <p>{tx("图片加载失败，请选择其他封面")}</p> : null}
    <Button type="button" disabled={disabled || state !== "ready"} aria-pressed={selected} onClick={onChoose}>{selected ? tx("已选此封面") : tx("使用此封面")}</Button>
  </article>;
}
