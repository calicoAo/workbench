import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, type Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button, IconButton } from "../../shared/ui";
import type { ProjectDetail, ProjectSummary } from ".";
import { commitProject, isAssignableProject } from "./queries";

type Draft = { name: string; description: string; priority: string; startDate: string; targetDate: string; notes: string };
const draftFor = (project: ProjectSummary | null): Draft => ({ name: project?.name ?? "", description: project?.description ?? "", priority: String(project?.priority ?? 2), startDate: project?.startDate ?? "", targetDate: project?.targetDate ?? "", notes: project?.notes ?? "" });
const valuesFor = (draft: Draft) => ({ name: draft.name.trim(), description: draft.description.trim() || null, priority: Number(draft.priority), startDate: draft.startDate || null, targetDate: draft.targetDate || null, notes: draft.notes.trim() || null });

/** One Projects-owned editor, embedded in Tasks or framed by the full Projects page. */
export function ProjectEditor({ project, request, userId, onError, onClose, onSaved, embedded = false, onPending }: {
  project: ProjectSummary | null; request: Request; userId: number; onError: (message: string, title?: string) => void;
  onClose: () => void; onSaved: (project: ProjectSummary, created: boolean) => void | Promise<void>;
  embedded?: boolean; onPending?: (pending: boolean) => void;
}) {
  const [initial] = useState(() => draftFor(project));
  const [draft, setDraft] = useState(initial);
  const [version, setVersion] = useState(project?.version);
  const [pending, setPending] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<ProjectSummary | null>(null);
  const busy = useRef(false);
  const lifetime = useRef({ active: true, userId });
  lifetime.current.userId = userId;
  useEffect(() => { lifetime.current.active = true; return () => { lifetime.current.active = false; }; }, []);
  const client = useQueryClient();
  const close = () => { if (!busy.current) onClose(); };

  async function run(action: "save" | "resolve" | "reconcile") {
    if (busy.current || (action === "save" && (savedId || conflict || !draft.name.trim()))) return;
    if (action === "save" && draft.startDate && draft.targetDate && draft.targetDate < draft.startDate) { setError(tx("目标日期不能早于开始日期")); return; }
    const values = valuesFor(draft), original = valuesFor(initial);
    const changed = project ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== original[key as keyof typeof original])) : values;
    if (action === "save" && project && !Object.keys(changed).length) { onClose(); return; }
    const owner = userId;
    const current = () => lifetime.current.active && lifetime.current.userId === owner;
    busy.current = true; setPending(true); onPending?.(true); setError("");
    let confirmed = savedId;
    try {
      if (action === "save") {
        const receipt = await request<{ id: number; version: number }>(project ? `/api/projects/${project.id}` : "/api/projects", { method: project ? "PUT" : "POST", body: JSON.stringify({ ...changed, ...(project ? { expectedVersion: version } : {}) }) });
        if (!current()) return;
        confirmed = receipt.id; setSavedId(receipt.id);
      }
      const id = action === "reconcile" ? project!.id : confirmed!;
      const detail = await request<ProjectDetail>(`/api/projects/${id}`);
      if (!current()) return;
      if (detail.project.id !== id) throw new Error(tx("项目详情与保存身份不一致"));
      commitProject(client, owner, detail);
      if (action === "reconcile") {
        setLatest(detail.project); setVersion(detail.project.version); setConflict(false);
        setError(tx("已载入最新版本，请核对草稿后再次保存。"));
      } else {
        if (embedded && !isAssignableProject(detail.project)) { setError(tx("项目已保存，但当前不可用于新悬赏。请刷新或选择其他项目。")); return; }
        void Promise.resolve(onSaved(detail.project, !project)).catch((failure: unknown) => { if (current()) onError(failure instanceof Error ? failure.message : tx("操作失败"), tx("项目列表加载失败")); });
      }
    } catch (failure) {
      if (!current()) return;
      const stale = failure instanceof ApiError && failure.status === 409 && !confirmed;
      if (stale) setConflict(true);
      const message = confirmed ? tx("项目已保存，详情尚未加载成功。请重试读取，无需再次创建。")
        : stale ? tx("项目已被更新。请读取最新版本并核对草稿后重试。")
        : failure instanceof ApiError && (failure.status === 0 || failure.status >= 500) ? tx("保存结果尚未确认，请先刷新项目列表核实，再决定是否重试。")
        : failure instanceof Error ? failure.message : tx("操作失败");
      setError(message); onError(message, confirmed ? tx("项目已保存") : tx("项目没有保存"));
    } finally {
      if (current()) { busy.current = false; setPending(false); onPending?.(false); }
    }
  }

  const locked = pending || savedId !== null;
  const form = <form className="time-modal project-editor" onSubmit={(event: FormEvent) => { event.preventDefault(); event.stopPropagation(); void run("save"); }}>
    <header><div><p className="route-eyebrow">{project ? tx("编辑项目") : tx("新项目")}</p><h2 id="project-editor-title">{project ? project.name : tx("创建长期目标")}</h2></div><IconButton label={tx("关闭")} type="button" disabled={pending} onClick={close}>×</IconButton></header>
    <label>{tx("项目名称")}<input className="field" autoFocus data-dialog-initial-focus required maxLength={120} disabled={locked} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>{tx("说明")}<textarea disabled={locked} value={draft.description} maxLength={4000} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <div className="project-editor-row"><label>{tx("优先级")}<select className="field" disabled={locked} value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="1">{tx("低")}</option><option value="2">{tx("中")}</option><option value="3">{tx("高")}</option></select></label><label>{tx("开始日期")}<input className="field" type="date" disabled={locked} value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label><label>{tx("目标日期")}<input className="field" type="date" disabled={locked} value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} /></label></div>
    <label>{tx("项目笔记")}<textarea disabled={locked} value={draft.notes} maxLength={10000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    {error ? <div className="notes-error" role="alert"><p>{error}</p>{savedId ? <><small>Project #{savedId}</small><Button type="button" disabled={pending} onClick={() => void run("resolve")}>{tx("重试读取项目")}</Button></> : conflict ? <Button type="button" disabled={pending} onClick={() => void run("reconcile")}>{tx("读取最新项目版本")}</Button> : null}</div> : null}
    {latest ? <details className="project-latest"><summary>{tx("最新服务器版本")} · v{latest.version}</summary><p>{latest.name}</p><p>{latest.description}</p><p>{tx("优先级")} {latest.priority} · {latest.startDate} → {latest.targetDate}</p><p>{latest.notes}</p></details> : null}
    <footer><Button type="button" disabled={pending} onClick={close}>{tx("取消")}</Button><Button variant="primary" loading={pending} disabled={savedId !== null || conflict || !draft.name.trim()} type="submit">{tx("保存")}</Button></footer>
  </form>;
  return embedded ? form : <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div role="dialog" aria-modal="true" aria-labelledby="project-editor-title">{form}</div></div>;
}
