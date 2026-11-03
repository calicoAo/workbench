import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { FeedbackActions } from "../../app/feedback";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { clearLibraryAiSearchDraft, clearLibraryAiSearchDrafts, LibraryAiSearch } from "./ai-search";
import { LibraryCoverPicker, type CoverLookup } from "./cover-picker";
import "./import.css";
export type LibrarySource = {
    id: number;
    provider: "TMDB" | "OPEN_LIBRARY" | "WEB_SEARCH";
    entityType: "MOVIE" | "SERIES" | "BOOK" | "GAME";
    stableSourceId: string;
    canonicalUrl: string;
    attribution: string;
    language: string | null;
    importedAt: string;
    references?: Array<{url:string;title:string}>;
};
type Metadata = {
    title: string;
    originalTitle: string | null;
    creator: string | null;
    releaseYear: number | null;
    description: string | null;
    coverRef: string | null;
    descriptionLanguage: string | null;
    isAnimation: boolean;
    creatorRole: string | null;
    sourceReferences?: Array<{url:string;title:string}>;
};
type Preview = {
    previewToken: string;
    fingerprint: string;
    expiresAt: number;
    source: {
        metadata: Metadata;
        canonicalUrl: string;
        attribution: string;
    };
    existingItemId: number | null;
    expectedVersion?: number;
    defaults: Metadata;
    changes: Array<{
        field: string;
        previous: unknown;
        current: unknown;
        incoming: unknown;
        preserveCurrent: boolean;
    }>;
};
type Candidate = {
    sourceId: string;
    title: string;
    releaseYear: number | null;
    isAnimation: boolean;
};
type Draft = {
    schemaVersion: 1;
    revision: string;
    provider: "TMDB" | "OPEN_LIBRARY" | "WEB_SEARCH";
    entityType: "MOVIE" | "SERIES" | "BOOK" | "GAME";
    input: string;
    targetItemId?: number;
    preview?: Preview;
    edits?: Pick<Metadata, "title" | "originalTitle" | "creator" | "releaseYear" | "description">;
    frozen?: Record<string, unknown>;
    committedId?: number;
    aiSelection?: {operationId:string;candidateIndex:number};
    omitCover?: boolean;
    coverLookup?: CoverLookup;
    selectedCoverId?: string;
};
const prefix = "wb.library-import.v1:";
export function clearLibraryImportDrafts() { for (const key of Object.keys(localStorage))
    if (key.startsWith(prefix))
        localStorage.removeItem(key); clearLibraryAiSearchDrafts(); }
export function MediaImportWorkflow({ request, userId, target, onSaved, onConfirm }: {
    request: Request;
    onConfirm: FeedbackActions["confirm"];
    userId: number;
    target?: {
        id: number;
        version: number;
        type: string;
        source?: LibrarySource;
    };
    onSaved: (id: number) => void | Promise<void>;
}) {
    const key = prefix + userId, alive = useRef(true), busy = useRef(false), revision = useRef<string | null>(null);
    const [draft, setDraft] = useState<Draft>(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.schemaVersion !== 1 || typeof parsed.revision !== "string")
                    throw Error("Unsupported saved draft");
                if (!parsed.committedId) {
                    revision.current = parsed.revision;
                    return parsed;
                }
                localStorage.removeItem(key);
                if (parsed.aiSelection) clearLibraryAiSearchDraft(userId, parsed.aiSelection.operationId);
            }
        }
        catch {
            return { schemaVersion: 1, revision: "invalid", provider: "WEB_SEARCH", entityType: "MOVIE", input: "" };
        }
        return { schemaVersion: 1, revision: crypto.randomUUID(), provider: target?.source?.provider ?? "WEB_SEARCH", entityType: target?.type === "GAME" ? "GAME" : target?.type === "BOOK" ? "BOOK" : target?.type === "SERIES" ? "SERIES" : "MOVIE", input: target?.source?.provider === "WEB_SEARCH" ? "" : target?.source?.stableSourceId ?? "", targetItemId: target?.id };
    });
    const [coverPending, setCoverPending] = useState(false);
    const [error, setError] = useState(""), [pending, setPending] = useState(false), [candidates, setCandidates] = useState<Candidate[]>([]), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        if (!draft.frozen || draft.committedId) return;
        let cancelled = false;
        setPending(true);
        void request<{status:string;itemId?:number}>(`/api/library/import/operations/${draft.frozen.operationId}`)
            .then(async state => {
                if (!cancelled && state.status === "committed") await acknowledge(draft, state.itemId!);
            })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
            .finally(() => { if (!cancelled) setPending(false); });
        return () => { cancelled = true; };
    }, []);
    async function acknowledge(submitted: Draft, id: number) {
        // Clear only this acknowledged submission, never another tab's newer draft.
        const raw = localStorage.getItem(key);
        if (raw && JSON.parse(raw).revision === submitted.revision) {
            localStorage.removeItem(key);
            revision.current = null;
            if (submitted.aiSelection) clearLibraryAiSearchDraft(userId, submitted.aiSelection.operationId);
        }
        if (!alive.current) return;
        setDraft({ ...submitted, committedId: id });
        await onSaved(id);
    }
    function save(next: Draft) {
        const raw = localStorage.getItem(key);
        const stored = raw ? JSON.parse(raw) : null;
        if (draft.revision === "invalid" || stored && stored.revision !== revision.current || !stored && revision.current)
            throw Error(tx("草稿已在另一窗口更改，请复制当前内容后刷新。"));
        const value = { ...next, revision: crypto.randomUUID() };
        localStorage.setItem(key, JSON.stringify(value));
        revision.current = value.revision;
        setDraft(value);
        return value;
    }
    function update(patch: Partial<Draft>) { try {
        save({ ...draft, ...patch });
    }
    catch (e) {
        setError(String(e));
    } }
    async function run(job: () => Promise<void>) { if (busy.current)
        return; busy.current = true; setPending(true); setError(""); try {
        await job();
    }
    catch (e) {
        if (alive.current)
            setError(e instanceof Error ? e.message : String(e));
    }
    finally {
        busy.current = false;
        if (alive.current)
            setPending(false);
    } }
    async function resolve(input: string) { await run(async () => { save({ ...draft, input, preview: undefined, frozen: undefined, committedId: undefined }); const preview = await request<Preview>("/api/library/import/resolve", { method: "POST", body: JSON.stringify({ provider: draft.provider, entityType: draft.entityType, sourceIdOrInput: input, ...(target ? { targetItemId: target.id } : {}) }) }); if (!alive.current)
        return; const m = preview.defaults; save({ ...draft, input, targetItemId: target?.id, preview, edits: (draft.preview?.source.canonicalUrl === preview.source.canonicalUrl ? draft.edits : undefined) ?? { title: m.title, originalTitle: m.originalTitle, creator: m.creator, releaseYear: m.releaseYear, description: m.description } }); }); }
    async function useAiCandidate(operationId: string, candidateIndex: number, coverOperationId?: string, coverCandidateId?: string) { await run(async () => {
        const selection = { operationId, candidateIndex };
        const preview = await request<Preview>(`/api/library/import/ai-search/${operationId}/preview`, { method: "POST", body: JSON.stringify({ candidateIndex, ...(coverOperationId ? { coverOperationId, coverCandidateId } : {}), ...(target ? { targetItemId: target.id } : {}) }) });
        if (!alive.current) return;
        const m = preview.defaults;
        save({ ...draft, aiSelection: selection, ...(draft.aiSelection?.operationId === operationId && draft.aiSelection.candidateIndex === candidateIndex ? {} : {coverLookup:undefined, selectedCoverId:undefined, omitCover:false}), ...(coverCandidateId ? {selectedCoverId:coverCandidateId,omitCover:false} : {}), targetItemId: target?.id, preview, frozen: undefined, committedId: undefined, edits: (draft.preview?.source.canonicalUrl === preview.source.canonicalUrl ? draft.edits : undefined) ?? {title:m.title,originalTitle:m.originalTitle,creator:m.creator,releaseYear:m.releaseYear,description:m.description} });
    }); }
    async function search(nextPage = 1) { await run(async () => { save(draft); const result = await request<{
        candidates: Candidate[];
        hasMore: boolean;
    }>(`/api/library/import/search?${new URLSearchParams({ provider: draft.provider, entityType: draft.entityType, q: draft.input, page: String(nextPage) })}`); if (alive.current) {
        setCandidates(result.candidates);
        setPage(nextPage);
        setHasMore(result.hasMore);
    } }); }
    async function confirm() {
        await run(async () => {
            const preview = draft.preview;
            if (!preview || !draft.edits)
                return;
            const frozen = draft.frozen ?? { previewToken: preview.previewToken, fingerprint: preview.fingerprint, operationId: crypto.randomUUID(), mode: target?.source ? "refresh" : target ? "attach" : "create", ...(target ? { targetItemId: target.id, expectedVersion: preview.expectedVersion } : {}), edits: draft.edits, omitCover: draft.omitCover ?? false };
            const submitted = save({ ...draft, frozen });
            const state = await request<{
                status: string;
                itemId?: number;
            }>(`/api/library/import/operations/${frozen.operationId}`);
            if (state.status !== "committed" && Date.now() > preview.expiresAt) {
                save({ ...draft, frozen: undefined });
                throw Error(tx("预览已过期且未发现保存回执；请重新解析，已编辑内容保留。"));
            }
            const result = state.status === "committed" ? { id: state.itemId! } : await request<{
                id: number;
            }>("/api/library/import/confirm", { method: "POST", body: JSON.stringify(frozen) });
            await acknowledge(submitted, result.id);
        });
    }
    const mismatch = draft.targetItemId !== target?.id;
    function reset() { if (pending)
        return; localStorage.removeItem(key); revision.current = null; setDraft({ schemaVersion: 1, revision: crypto.randomUUID(), provider: target?.source?.provider ?? "WEB_SEARCH", entityType: target?.type === "GAME" ? "GAME" : target?.type === "BOOK" ? "BOOK" : target?.type === "SERIES" ? "SERIES" : "MOVIE", input: target?.source?.provider === "WEB_SEARCH" ? "" : target?.source?.stableSourceId ?? "", targetItemId: target?.id }); setError(""); setCandidates([]); }
    return <section className="media-import glass-panel" aria-label={tx("导入作品资料")}>
    <h2>{(target?.source ? tx("刷新来源资料") : target ? tx("为已有作品关联来源") : tx("导入作品资料"))}</h2>
    <p>{tx("默认使用 AI 网页搜索，可直接导入图书、影视、动画和游戏资料。确认后才会保存；失败时保留草稿。")}</p>
    {error ? <p role="alert" className="notes-error">{error}</p> : null}
    {mismatch ? <p role="alert">{tx("有另一条目的导入草稿，请先恢复原条目或明确丢弃。")}{draft.targetItemId ? <Link to={`/library/${draft.targetItemId}`}>{tx("打开原条目")}</Link> : null}</p> : null}
    <fieldset disabled={(pending || coverPending) || Boolean(draft.frozen) || mismatch || draft.revision === "invalid"}>
      <label>{tx("来源与类型")}<select className="field" value={`${draft.provider}:${draft.entityType}`} onChange={e => { const [provider, entityType] = e.target.value.split(":") as [
        Draft["provider"],
        Draft["entityType"]
    ]; update({ provider, entityType, preview: undefined, edits: undefined, aiSelection: undefined, coverLookup:undefined, selectedCoverId:undefined, omitCover: false }); }}><option value="WEB_SEARCH:MOVIE">{tx("AI 网页搜索 · 电影（含动画）")}</option><option value="WEB_SEARCH:SERIES">{tx("AI 网页搜索 · 整部剧集（含动画）")}</option><option value="WEB_SEARCH:BOOK">{tx("AI 网页搜索 · 图书")}</option><option value="WEB_SEARCH:GAME">{tx("AI 网页搜索 · 游戏")}</option><option value="TMDB:MOVIE">{tx("TMDB 电影（含动画）")}</option><option value="TMDB:SERIES">{tx("TMDB 整部剧集（含动画）")}</option><option value="OPEN_LIBRARY:BOOK">{tx("Open Library 图书")}</option></select></label>
      {draft.provider !== "WEB_SEARCH" ? <><input className="field" aria-label={tx("搜索词或来源网址")} maxLength={500} value={draft.input} onChange={e => update({ input: e.target.value })}/>
      <div className="flex gap-2"><Button type="button" onClick={() => void search()} disabled={!draft.input}>{tx("搜索候选")}</Button><Button type="button" onClick={() => void resolve(draft.input)} disabled={!draft.input}>{tx("按网址 / ID 解析")}</Button></div></> : null}
    </fieldset>
    {draft.provider === "WEB_SEARCH" ? <LibraryAiSearch request={request} userId={userId} mediaType={draft.entityType} query={draft.input} onQuery={input => update({input})} disabled={(pending || coverPending) || Boolean(draft.frozen) || mismatch || draft.revision === "invalid"} onUse={(operationId, index) => void useAiCandidate(operationId, index)}/> : null}
    {draft.aiSelection && !draft.frozen ? <Button disabled={pending || coverPending || mismatch} onClick={() => void useAiCandidate(draft.aiSelection!.operationId, draft.aiSelection!.candidateIndex, draft.selectedCoverId ? draft.coverLookup?.operationId : undefined, draft.selectedCoverId)}>{tx("重新预览已选资料（不重新搜索）")}</Button> : null}
    {candidates.map(c => <Button key={c.sourceId} type="button" disabled={(pending || coverPending) || Boolean(draft.frozen)} onClick={() => void resolve(c.sourceId)}>{c.title} · {c.releaseYear ?? "—"}{c.isAnimation ? tx(" · 动画") : ""}</Button>)}
    {candidates.length ? <div><Button type="button" disabled={pending || page <= 1} onClick={() => void search(page - 1)}>{tx("上一页")}</Button><span>{page}</span><Button type="button" disabled={pending || !hasMore} onClick={() => void search(page + 1)}>{tx("下一页")}</Button></div> : null}
    {draft.preview && draft.edits ? <>
      <p><a href={draft.preview.source.canonicalUrl} target="_blank" rel="noopener noreferrer">{tx("查看来源")}</a> · {draft.preview.source.metadata.descriptionLanguage || tx("来源未标注语言")}{draft.preview.source.metadata.descriptionLanguage === "en-US" ? tx("（非中文简介）") : ""} · {draft.preview.source.metadata.creator || tx("创作者缺失")}</p>
      {draft.aiSelection ? <LibraryCoverPicker key={`${draft.aiSelection.operationId}:${draft.aiSelection.candidateIndex}`} request={request} selection={draft.aiSelection} saved={draft.coverLookup} selectedId={draft.omitCover ? "__omit__" : draft.selectedCoverId} disabled={pending || Boolean(draft.frozen) || mismatch} onChange={coverLookup => { save({...draft, coverLookup, ...(draft.coverLookup?.operationId !== coverLookup.operationId ? {selectedCoverId:undefined} : {})}); }} onBusy={setCoverPending} onChoose={async (op, id) => { await useAiCandidate(draft.aiSelection!.operationId, draft.aiSelection!.candidateIndex, op, id); }}/> : null}
      {!draft.selectedCoverId ? <PreviewCover key={draft.preview.source.metadata.coverRef} url={draft.preview.source.metadata.coverRef}/> : null}
      {draft.preview.source.metadata.sourceReferences?.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}
      {draft.preview.existingItemId && !target ? <p><Link to={`/library/${draft.preview.existingItemId}`}>{tx("该来源已导入，打开已有条目")}</Link></p> : null}
      {target ? <details><summary>{tx("查看逐字段差异（已编辑字段默认保留）")}</summary>{draft.preview.changes.map(c => <p key={c.field}><strong>{c.field}</strong><br />{tx("当前：")}{String(c.current ?? "—")}<br />{tx("来源：")}{String(c.incoming ?? "—")}</p>)}</details> : null}
      <fieldset disabled={(pending || coverPending) || Boolean(draft.frozen) || mismatch}>
        {(["title", "originalTitle", "creator"] as const).map((key, index) => <label key={key}>{[tx("标题"), tx("原名"), tx("创作者")][index]}<input className="field" maxLength={key === "creator" ? 160 : 200} value={draft.edits![key] ?? ""} onChange={e => update({ edits: { ...draft.edits!, [key]: e.target.value || null } })}/></label>)}
        <label>{tx("发行年份")}<input className="field" type="number" min={1} max={9999} value={draft.edits.releaseYear ?? ""} onChange={e => update({ edits: { ...draft.edits!, releaseYear: e.target.value ? Number(e.target.value) : null } })}/></label>
        <label>{tx("作品简介（个人短评另行填写）")}<textarea className="field" rows={7} maxLength={10000} value={draft.edits.description ?? ""} onChange={e => update({ edits: { ...draft.edits!, description: e.target.value || null } })}/></label>
        {draft.preview.source.metadata.coverRef ? <label><input type="checkbox" checked={draft.omitCover ?? false} onChange={e => update({omitCover:e.target.checked})}/>{tx("不导入此封面")}</label> : null}
      </fieldset>
      <p className="text-xs">{draft.preview.source.attribution}</p>
      {!draft.committedId ? <Button type="button" variant="primary" disabled={pending || coverPending || mismatch || !draft.edits.title} onClick={() => void confirm()}>{(draft.frozen ? tx("查询结果 / 重试原确认") : tx("确认保存资料"))}</Button> : <Link to={`/library/${draft.committedId}`}>{tx("已保存，打开作品")}</Link>}
      {draft.frozen && !draft.committedId ? <p>{tx("请求结果未确认前，保持本次内容与操作 ID。可先查询结果，再重试原确认。")}</p> : null}
    </> : null}
    <Button type="button" variant="ghost" disabled={pending || coverPending} onClick={() => onConfirm(tx("丢弃导入草稿"), tx("确定丢弃导入草稿？已保存的作品仍保留。"), reset)}>{tx("丢弃草稿 / 重新开始")}</Button>
  </section>;
}

function PreviewCover({url}:{url:string|null}) {
  const [failed,setFailed]=useState(false);
  return url&&!failed?<img className="media-preview-cover" src={url} alt={tx("来源封面")} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<p className="text-soft">{tx("封面暂不可用，仍可保存其他资料。")}</p>;
}
