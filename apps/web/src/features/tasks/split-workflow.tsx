import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ApiError, type Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { CategoryQuickManager, useCategoryOptions } from "../categories";
import { ProjectQuickManager, isAssignableProject, useProjects } from "../projects";
import { CloseButton, ModalPortal } from "./task-ui";
import { SplitCandidateEditor } from "./split-candidate";
import { newSplitDraft, readSplitDraft, splitDraftExists, writeSplitDraft, type SplitCandidate, type SplitDraft } from "./split-draft";
import "./split.css";
export { clearTaskSplitDrafts } from "./split-draft";
type Generation = {
    status: string;
    result: {
        candidates: Omit<SplitCandidate, "selected">[];
        hasMore: boolean;
        unprocessedTextSpans: string[];
    } | null;
};
export function TaskSplitWorkflow({ request, userId, timezone, onError, onChanged, initiallyOpen = false, onClose }: {
    request: Request;
    userId: number;
    timezone?: string;
    onError: (message: string, title?: string) => void;
    onChanged: () => void | Promise<void>;
    initiallyOpen?: boolean;
    onClose?: () => void;
}) {
    const [open, setOpen] = useState(initiallyOpen), [error, setError] = useState(""), [draft, setDraft] = useState<SplitDraft>(() => { try {
        return readSplitDraft(userId);
    }
    catch (e) {
        return { ...newSplitDraft(), revision: "invalid", text: String(e) };
    } });
    const current = useRef(draft), revision = useRef<string | null>(splitDraftExists(userId) ? draft.revision : null), alive = useRef(true), busy = useRef(false), abort = useRef<AbortController | null>(null);
    const [pending, setPending] = useState(false), [manager, setManager] = useState<{
        kind: "category" | "project";
        candidateId: string;
        name: string;
    } | null>(null), secondaryPending = useRef(false);
    const categories = useCategoryOptions(request, userId, [], open), projects = useProjects(request, userId, "active", open);
    const categoryOptions = categories.data ?? [], projectOptions = Array.isArray(projects.data) ? projects.data.filter(isAssignableProject) : [];
    const context = useQuery({ queryKey: ["task-split-context", userId], queryFn: () => request<{
            projects: Array<{
                id: number;
                name: string;
            }>;
            categories: Array<{
                id: number;
                name: string;
            }>;
            selectionRequired: boolean;
        }>("/api/tasks/split/context"), enabled: open });
    const duplicates = useQuery({ queryKey: ["task-split-existing", userId], queryFn: () => request<Array<{
            title: string;
            status: number;
        }>>("/api/tasks"), enabled: open });
    const [contextIds, setContextIds] = useState<{
        projects: number[];
        categories: number[];
    }>({ projects: [], categories: [] });
    useEffect(() => { alive.current = true; return () => { alive.current = false; abort.current?.abort(); }; }, []);
    function save(next: SplitDraft) { if (current.current.revision === "invalid")
        throw Error(tx("草稿版本无法读取，请先复制内容。")); const value = writeSplitDraft(userId, next, revision.current); revision.current = value.revision; current.current = value; if (alive.current)
        setDraft(value); return value; }
    function update(next: SplitDraft) { try {
        save(next);
    }
    catch (e) {
        setError(String(e));
    } }
    function patch(id: string, value: Partial<SplitCandidate>) { const d = current.current; update({ ...d, candidates: d.candidates.map(c => c.candidateId === id ? { ...c, ...value } : c) }); }
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
    function acceptGeneration(result: Generation) { if (!alive.current)
        return; const d = current.current; if (!d.generation)
        return; save({ ...d, generation: { ...d.generation, status: result.status, applied: d.generation.applied || result.status === "SUCCEEDED" }, ...(result.status === "SUCCEEDED" && result.result && !d.generation.applied ? { candidates: [...d.candidates.filter(c => c.publishedId), ...result.result.candidates.map(c => ({ ...c, selected: true }))], hasMore: result.result.hasMore, unprocessedTextSpans: result.result.unprocessedTextSpans } : {}) }); }
    async function queryGeneration() { await run(async () => { const generation = current.current.generation; if (!generation)
        return; try {
        acceptGeneration(await request<Generation>(`/api/tasks/split/preview/${generation.operationId}`));
    }
    catch (e) {
        if (e instanceof ApiError && e.status === 404) {
            save({ ...current.current, generation: { ...generation, status: "NOT_FOUND" } });
        }
        throw e;
    } }); }
    async function retryOriginal() { await run(async () => { const generation = current.current.generation; if (!generation || generation.status !== "NOT_FOUND")
        return; save({ ...current.current, generation: { ...generation, status: "PENDING" } }); abort.current = new AbortController(); try {
        acceptGeneration(await request<Generation>("/api/tasks/split/preview", { method: "POST", body: JSON.stringify(generation.request), signal: abort.current.signal }));
    }
    catch (e) {
        if (alive.current)
            save({ ...current.current, generation: { ...generation, status: "UNKNOWN" } });
        throw e;
    } }); }
    async function generate() {
        await run(async () => {
            const d = current.current;
            if (d.candidates.some(c => c.frozen && !c.publishedId))
                throw Error(tx("先确认待定的发布结果，再重新生成。"));
            if (d.generation && ["PENDING", "UNKNOWN", "NOT_FOUND"].includes(d.generation.status))
                throw Error(tx("先查询本次生成状态，不重复计费调用。"));
            if ((d.generation || d.candidates.length) && !window.confirm(tx("重新生成会替换未发布的编辑草稿，并产生一次新的调用；结果未知时可能已计费。继续？")))
                return;
            const operationId = crypto.randomUUID(), draftId = d.candidates.length ? crypto.randomUUID() : d.draftId;
            const body = { operationId, draftId, text: d.text, ...(context.data?.selectionRequired ? { contextSelectionIds: contextIds } : {}) };
            save({ ...d, draftId, generation: { operationId, request: body, status: "PENDING" } });
            abort.current = new AbortController();
            try {
                acceptGeneration(await request<Generation>("/api/tasks/split/preview", { method: "POST", body: JSON.stringify(body), signal: abort.current.signal }));
            }
            catch (e) {
                if (alive.current) {
                    const latest = current.current;
                    save({ ...latest, generation: { ...latest.generation!, status: "UNKNOWN" } });
                }
                throw e;
            }
        });
    }
    async function publish() {
        await run(async () => {
            if (!timezone)
                throw Error(tx("时区尚未就绪，请稍后重试。"));
            const selected = current.current.candidates.filter(c => c.selected && !c.publishedId);
            if (!selected.length)
                return;
            if (selected.some(c => !c.title.trim() || c.dueAtLocal && !c.dueAtLocal.includes("T")))
                throw Error(tx("请补齐标题；仅有日期的条目需选择时间或清空日期。"));
            if (!window.confirm(tx("确认发布所选 {value0} 条任务？不会自动接取或创建分类、项目。", { value0: selected.length })))
                return;
            // Freeze and persist every payload before the first write.
            const frozen = save({ ...current.current, candidates: current.current.candidates.map(c => !c.selected || c.publishedId || c.frozen ? c : { ...c, publishOperationId: c.publishOperationId ?? crypto.randomUUID() }) });
            save({ ...frozen, candidates: frozen.candidates.map(c => !c.selected || c.publishedId || c.frozen ? c : { ...c, frozen: { operationId: c.publishOperationId, recordTimezone: timezone, title: c.title.trim(), description: c.description, priority: c.priority, difficulty: c.difficulty, progressPercent: 0, ...(c.categoryId ? { categoryId: c.categoryId } : {}), ...(c.projectId ? { projectId: c.projectId } : {}), ...(c.dueAtLocal ? { dueAt: c.dueAtLocal } : {}), ...(c.estimatedMinutes ? { estimatedMinutes: c.estimatedMinutes } : {}) } }) });
            for (const candidate of current.current.candidates.filter(c => c.selected && !c.publishedId)) {
                if (!alive.current)
                    return;
                try {
                    const status = await request<{
                        status: string;
                        taskId?: number;
                    }>(`/api/tasks/split/publish-status/${candidate.publishOperationId}`);
                    const result = status.status === "committed" ? { id: status.taskId! } : await request<{
                        id: number;
                    }>("/api/tasks", { method: "POST", body: JSON.stringify(candidate.frozen) });
                    if (!alive.current)
                        return;
                    patch(candidate.candidateId, { publishedId: result.id, publishError: undefined });
                }
                catch (e) {
                    if (!alive.current)
                        return;
                    patch(candidate.candidateId, { publishError: e instanceof Error ? e.message : String(e), ...(e instanceof ApiError && [400, 403, 404, 409].includes(e.status) ? { frozen: undefined, publishOperationId: undefined } : {}) });
                }
            }
            await onChanged();
        });
    }
    async function manage(candidateId: string, kind: "category" | "project", name: string) {
        await run(async () => {
            save(current.current);
            if (name) {
                const { matches } = await request<{
                    matches: Array<{
                        id: number;
                        name: string;
                        available: boolean;
                    }>;
                }>(`/api/tasks/split/name-check?${new URLSearchParams({ kind, name })}`);
                if (!alive.current)
                    return;
                if (matches.length) {
                    setError(tx("已有同名项目或分类，请优先核对；不可用项可去所属页面恢复。"));
                    const match = matches.find(v => v.available);
                    if (match)
                        patch(candidateId, kind === "category" ? { categoryId: match.id } : { projectId: match.id });
                    return;
                }
            }
            setManager({ kind, candidateId, name });
        });
    }
    function onManaged(id: number) { if (!manager)
        return; patch(manager.candidateId, manager.kind === "category" ? { categoryId: id } : { projectId: id }); secondaryPending.current = false; setManager(null); void context.refetch(); }
    const unknown = draft.generation && ["PENDING", "UNKNOWN", "NOT_FOUND"].includes(draft.generation.status);
    return <>
    <Button type="button" size="sm" onClick={() => setOpen(true)}>{(draft.text ? tx("AI 整理任务 / 恢复草稿") : tx("AI 整理任务"))}</Button>
    {open ? <ModalPortal panelKey={manager?.kind ?? "split"} label={tx("AI 整理任务")} onClose={() => { if (manager) {
            if (!secondaryPending.current)
                setManager(null);
        }
        else if (!pending) {
            setOpen(false);
            onClose?.();
        } }}>
      <section className="ui-dialog split-workflow" hidden={Boolean(manager)} {...(manager ? { inert: "" } : { "data-active-task-panel": true })}>
        <header className="flex justify-between"><h2>{tx("AI 整理任务")}</h2><CloseButton onClose={() => { if (!pending) {
            setOpen(false);
            onClose?.();
        } }}/></header>
        <p>{tx("只生成草稿。发送本段文字和所选项目、分类名称及简介，不读取其他领域。刷新可恢复；发布需再次确认。")}</p>
        {error ? <p className="notes-error" role="alert">{error}</p> : null}
        {context.isError ? <p role="alert">{tx("请在设置中开启 AI 和任务权限。下方文本仍保存在本机。")}<Link to="/settings?topic=ai">{tx("打开设置")}</Link><Button type="button" onClick={() => void context.refetch()}>{tx("重试读取上下文")}</Button></p> : null}
        <label>{tx("待整理文本")}<textarea className="field" rows={6} maxLength={5000} value={draft.text} disabled={pending || Boolean(unknown)} onChange={e => update({ ...current.current, text: e.target.value })}/></label>
        {context.data?.selectionRequired ? <fieldset><legend>{tx("项目或分类较多，请选择参考范围（各最多 50）")}</legend>{(["projects", "categories"] as const).map(kind => <label key={kind}>{(kind === "projects" ? tx("参考项目") : tx("参考分类"))}<select className="field" multiple value={contextIds[kind].map(String)} onChange={e => setContextIds({ ...contextIds, [kind]: Array.from(e.target.selectedOptions).slice(0, 50).map(v => Number(v.value)) })}>{context.data![kind].map(v => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label>)}</fieldset> : <p>{tx("参考范围：当前全部可分配项目与启用分类；最多各 50 项。")}</p>}
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={pending || !draft.text.trim() || Boolean(unknown) || !context.data} onClick={() => void generate()}>{(draft.generation ? tx("重新生成（保留已发布任务）") : tx("生成可审核草稿"))}</Button>{draft.generation ? <Button type="button" disabled={pending} onClick={() => void queryGeneration()}>{tx("查询本次生成结果")}</Button> : null}{pending ? <Button type="button" onClick={() => abort.current?.abort()}>{tx("停止等待（可能已计费）")}</Button> : null}</div>
        {draft.generation?.status === "NOT_FOUND" ? <Button type="button" disabled={pending} onClick={() => void retryOriginal()}>{tx("重试原生成请求（同一操作 ID）")}</Button> : null}
        {draft.generation ? <p>{tx("生成状态：")}{draft.generation.status}</p> : null}
        {draft.hasMore ? <p role="alert">{tx("还有未拆出的内容，请核对后单独处理。")}{draft.unprocessedTextSpans.join("\n")}</p> : null}
        {draft.candidates.map((c, index) => <SplitCandidateEditor key={c.candidateId} candidate={c} index={index} categories={categoryOptions} projects={projectOptions} duplicate={(duplicates.data ?? []).some(t => t.status !== 2 && t.status !== 3 && t.title.normalize("NFKC").trim().toLowerCase() === c.title.normalize("NFKC").trim().toLowerCase())} pending={pending} onChange={patchValue => patch(c.candidateId, patchValue)} onRemove={() => update({ ...current.current, candidates: current.current.candidates.filter(v => v.candidateId !== c.candidateId) })} onManage={(kind, name) => void manage(c.candidateId, kind, name)}/>)}
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={pending || Boolean(unknown) || draft.candidates.some(c => c.frozen && !c.publishedId)} onClick={() => { if (window.confirm(tx("丢弃本机任务草稿？已发布任务仍保留。"))) {
            localStorage.removeItem("wb.task-split.v1:" + userId);
            revision.current = null;
            current.current = newSplitDraft();
            setDraft(current.current);
            setError("");
        } }}>{tx("丢弃任务草稿")}</Button><Button type="button" disabled={pending || draft.candidates.length >= 20} onClick={() => { const d = current.current; update({ ...d, candidates: [...d.candidates, { candidateId: crypto.randomUUID(), title: "", description: "", priority: 2, difficulty: 2, categoryId: null, projectId: null, categorySuggestion: null, projectSuggestion: null, dueAtLocal: null, dueEvidence: null, estimatedMinutes: null, durationEvidence: null, suggestedMinutes: null, warnings: [], selected: true }] }); }}>{tx("增加草稿")}</Button><Button type="button" variant="primary" disabled={pending || !draft.candidates.some(c => c.selected && !c.publishedId)} onClick={() => void publish()}>{tx("确认发布所选 / 重试待定项")}</Button></div>
      </section>
      {manager ? <div data-active-task-panel className="task-category-panel">{manager.kind === "category" ? <CategoryQuickManager request={request} userId={userId} initialName={manager.name} onPending={v => { secondaryPending.current = v; }} onClose={() => { if (!secondaryPending.current)
            setManager(null); }} onError={onError} onSelect={c => onManaged(c.id)} onSaved={c => onManaged(c.id)}/> : <ProjectQuickManager request={request} userId={userId} initialName={manager.name} onPending={v => { secondaryPending.current = v; }} onClose={() => { if (!secondaryPending.current)
            setManager(null); }} onError={onError} onSelect={p => onManaged(p.id)} onSaved={p => onManaged(p.id)}/>}</div> : null}
    </ModalPortal> : null}
  </>;
}
