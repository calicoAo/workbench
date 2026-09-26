import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, CalendarClock, CheckCircle2, Clock3, FolderKanban, Pencil, Plus, RotateCcw, StickyNote } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Badge, Button, FilterChip, IconButton } from "../../shared/ui";
import type { TaskSnapshot } from "../tasks";
import { tx } from "../../app/i18n";

export type ProjectSummary = {
  id: number; name: string; description: string | null; status: number; priority: number;
  startDate: string | null; targetDate: string | null; notes: string | null; version: number;
  createdAt: string; updatedAt: string; archivedAt: string | null; taskCount: number;
  completedTaskCount: number; progressPercent: number | null; actualSeconds: number;
  nextTask: Pick<TaskSnapshot, "id" | "title" | "priority" | "dueAt" | "progressPercent" | "status" | "version"> | null;
};
type ProjectDetail = { project: ProjectSummary; tasks: TaskSnapshot[]; plannedSchedules: Array<{ id: number; scheduleDate: string; startTime: string; endTime: string; title: string }>; actualEntries: Array<{ id: number; source: string; startedAt?: string; endedAt?: string; actualStartedAt?: string; actualEndedAt?: string; taskTitleSnapshot?: string; title?: string }> };
type ProjectMaterial = { id: number; title: string; excerpt: string; noteDate: string; tag: string | null; archivedAt: string | null; deepLink: string };
type ProjectDraft = { name: string; description: string; priority: string; startDate: string; targetDate: string; notes: string };
const emptyDraft: ProjectDraft = { name: "", description: "", priority: "2", startDate: "", targetDate: "", notes: "" };

export function useProjects(request: Request, userId: number, view = "active") {
  return useQuery({ queryKey: queryKeys.projects(userId, view), queryFn: () => request<ProjectSummary[]>(`/api/projects?view=${view}`) });
}

export function ProjectsPage({ request, userId, onError }: { request: Request; userId: number; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"active" | "archived">("active");
  const query = useProjects(request, userId, view);
  const [editing, setEditing] = useState<ProjectSummary | "new" | null>(null);
  async function changed() { await queryClient.invalidateQueries({ queryKey: ["projects", userId] }); }
  async function archive(project: ProjectSummary) {
    try { await request(`/api/projects/${project.id}/${project.archivedAt ? "restore" : "archive"}`, { method: "PUT", body: JSON.stringify({ expectedVersion: project.version }) }); await changed(); }
    catch (error) { onError(message(error), project.archivedAt ? tx("项目没有恢复") : tx("项目没有归档")); }
  }
  return <section className="projects-route">
    <header className="projects-route-head"><div><p className="route-eyebrow">{tx("长期目标")}</p><h1>{tx("项目")}</h1><p>{tx("把需要持续推进的目标，与悬赏和真实投入放在一起。")}</p></div><Button variant="primary" onClick={() => setEditing("new")}><Plus size={16} />{tx("创建项目")}</Button></header>
    <nav className="projects-filters" aria-label={tx("项目筛选")}><FilterChip active={view === "active"} onClick={() => setView("active")}>{tx("当前项目")}</FilterChip><FilterChip active={view === "archived"} onClick={() => setView("archived")}>{tx("已归档")}</FilterChip></nav>
    {query.isPending ? <p className="route-state">{tx("正在加载项目...")}</p> : null}
    {query.isError ? <p className="notes-error" role="alert">{message(query.error)}</p> : null}
    {!query.isPending && !query.data?.length ? <div className="projects-empty"><FolderKanban size={28} /><h2>{view === "archived" ? tx("没有已归档项目") : tx("还没有项目")}</h2><p>{view === "archived" ? tx("归档后的项目会保留任务与历史投入。") : tx("项目适合管理需要持续推进的长期目标。")}</p>{view === "active" ? <Button variant="primary" onClick={() => setEditing("new")}>{tx("创建第一个项目")}</Button> : null}</div> : null}
    <div className="project-grid">{query.data?.map((project) => <article className="project-card" key={project.id}>
      <div className="project-card-head"><Link to={`/projects/${project.id}`}><strong>{project.name}</strong><span>{project.description || tx("暂无项目说明")}</span></Link><IconButton label={project.archivedAt ? tx("恢复项目") : tx("归档项目")} onClick={() => void archive(project)}>{project.archivedAt ? <RotateCcw size={17} /> : <Archive size={17} />}</IconButton></div>
      <div className="project-card-badges"><Badge tone={project.status === 1 ? "success" : project.status === 2 ? "warning" : "neutral"}>{statusLabel(project.status)}</Badge><Badge>{priorityLabel(project.priority)}</Badge>{project.targetDate ? <span>{tx("目标")} {project.targetDate}</span> : null}</div>
      <div className="project-progress"><span><strong>{project.progressPercent === null ? tx("尚无任务") : `${project.progressPercent}%`}</strong><small>{project.completedTaskCount}/{project.taskCount} {tx("完成")}</small></span><i><b style={{ width: `${project.progressPercent ?? 0}%` }} /></i></div>
      <div className="project-card-foot"><span><Clock3 size={15} />{formatSeconds(project.actualSeconds)}</span><span>{project.nextTask ? tx("下一步：{value0}", { value0: project.nextTask.title }) : tx("暂无未完成悬赏")}</span></div>
    </article>)}</div>
    {editing ? <ProjectEditor project={editing === "new" ? null : editing} request={request} onError={onError} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await changed(); }} /> : null}
  </section>;
}

export function ProjectDetailPage({ request, userId, projectId, onError, onCreateTask, onEditTask }: { request: Request; userId: number; projectId: number; onError: (message: string, title?: string) => void; onCreateTask: (options?: { projectId?: number }) => void; onEditTask: (task: TaskSnapshot) => void }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (["overview", "tasks", "time", "notes"].includes(params.get("tab") ?? "") ? params.get("tab") : "overview") as "overview" | "tasks" | "time" | "notes";
  const query = useQuery({ queryKey: queryKeys.project(userId, projectId), enabled: projectId > 0, queryFn: () => request<ProjectDetail>(`/api/projects/${projectId}`) });
  const materialsQuery = useQuery({ queryKey: queryKeys.projectMaterials(userId, projectId), enabled: projectId > 0 && tab === "notes", queryFn: () => request<{ items: ProjectMaterial[] }>(`/api/projects/${projectId}/materials`) });
  const [editing, setEditing] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const data = query.data;
  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.project(userId, projectId) }), queryClient.invalidateQueries({ queryKey: ["projects", userId] }), queryClient.invalidateQueries({ queryKey: queryKeys.tasks(userId) })]); }
  async function status(status: number, keep = false) { if (!data) return; try { await request(`/api/projects/${projectId}/status`, { method: "PUT", body: JSON.stringify({ expectedVersion: data.project.version, status, unfinishedTaskPolicy: keep ? "KEEP" : undefined }) }); setConfirmDone(false); await refresh(); } catch (error) { onError(message(error), tx("项目状态没有更新")); } }
  async function progress(task: TaskSnapshot, value: number) { try { await request(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: task.version, progressPercent: value }) }); await refresh(); } catch (error) { onError(message(error), tx("悬赏进度没有更新")); } }
  function chooseTab(next: string) { const values = new URLSearchParams(params); values.set("tab", next); setParams(values); }
  if (query.isPending) return <p className="route-state">{tx("正在加载项目...")}</p>;
  if (!data || query.isError) return <section className="route-panel"><h1>{tx("项目不存在")}</h1><Link to="/projects">{tx("返回项目")}</Link></section>;
  const project = data.project;
  const unfinished = data.tasks.filter((task) => task.status < 2);
  return <section className="project-detail">
    <header className="project-detail-head"><div><Link className="inline-command" to="/projects"><ArrowLeft size={15} />{tx("返回项目")}</Link><p className="route-eyebrow">Project #{project.id} · v{project.version}</p><h1>{project.name}</h1><p>{project.description || tx("暂无项目说明")}</p></div><div className="project-detail-actions"><Button onClick={() => setEditing(true)}><Pencil size={15} />{tx("编辑")}</Button>{project.status === 0 ? <Button variant="primary" onClick={() => void status(1)}>{tx("开始项目")}</Button> : null}{project.status === 1 ? <Button onClick={() => void status(2)}>{tx("暂停")}</Button> : null}{project.status === 2 ? <Button variant="primary" onClick={() => void status(1)}>{tx("继续")}</Button> : null}{project.status !== 3 ? <Button onClick={() => setConfirmDone(true)}><CheckCircle2 size={15} />{tx("完成项目")}</Button> : null}</div></header>
    <nav className="project-tabs" aria-label={tx("项目详情")}><button className={tab === "overview" ? "is-active" : ""} onClick={() => chooseTab("overview")}>{tx("概览")}</button><button className={tab === "tasks" ? "is-active" : ""} onClick={() => chooseTab("tasks")}>{tx("悬赏")}</button><button className={tab === "time" ? "is-active" : ""} onClick={() => chooseTab("time")}>{tx("计划与投入")}</button><button className={tab === "notes" ? "is-active" : ""} onClick={() => chooseTab("notes")}>{tx("笔记")}</button></nav>
    {confirmDone ? <div className="project-complete-confirm"><strong>{unfinished.length ? tx("仍有 {value0} 个未完成悬赏", { value0: unfinished.length }) : tx("确认完成项目")}</strong><p>{tx("完成项目不会完成、删除或归档任何悬赏。")}</p><div><Button onClick={() => { chooseTab("tasks"); setConfirmDone(false); }}>{tx("查看并处理未完成悬赏")}</Button><Button variant="primary" onClick={() => void status(3, true)}>{tx("完成项目，但保留未完成悬赏")}</Button></div></div> : null}
    {tab === "overview" ? <div className="project-overview-grid"><main><section className="project-overview-progress"><span><strong>{project.progressPercent === null ? tx("尚无任务") : `${project.progressPercent}%`}</strong><small>{tx("所有未归档悬赏等权平均；增减悬赏会改变分母。")}</small></span><i><b style={{ width: `${project.progressPercent ?? 0}%` }} /></i></section><section><h2>{tx("下一步")}</h2>{project.nextTask ? <Link className="project-next-task" to={`/tasks/${project.nextTask.id}`}><strong>{project.nextTask.title}</strong><span>{tx("进度")} {project.nextTask.progressPercent}%</span></Link> : <p className="muted">{tx("暂无未完成悬赏。")}</p>}</section><section><h2>{tx("项目说明")}</h2><p>{project.notes || tx("暂无项目笔记。")}</p></section></main><aside><Fact label={tx("状态")} value={statusLabel(project.status)} /><Fact label={tx("优先级")} value={priorityLabel(project.priority)} /><Fact label={tx("周期")} value={tx("{value0} → {value1}", { value0: project.startDate || tx("未定"), value1: project.targetDate || tx("未定") })} /><Fact label={tx("悬赏")} value={tx("{value0}/{value1} 完成", { value0: project.completedTaskCount, value1: project.taskCount })} /><Fact label={tx("真实投入")} value={formatSeconds(project.actualSeconds)} /><Button variant="primary" onClick={() => onCreateTask({ projectId })}><Plus size={15} />{tx("发布所属悬赏")}</Button></aside></div> : null}
    {tab === "tasks" ? <section className="project-section"><header><div><h2>{tx("所属悬赏")}</h2><p>{tx("当前归属会影响后续计时；过去投入仍留在发生时项目。")}</p></div><Button variant="primary" onClick={() => onCreateTask({ projectId })}><Plus size={15} />{tx("发布所属悬赏")}</Button></header>{!data.tasks.length ? <div className="project-section-empty"><p>{tx("这个项目还没有悬赏")}</p><Button onClick={() => onCreateTask({ projectId })}>{tx("发布所属悬赏")}</Button></div> : <div className="project-task-list">{data.tasks.map((task) => <div key={task.id}><Link to={`/tasks/${task.id}`}><strong>{task.title}</strong><small>{task.status === 2 ? tx("已完成") : tx("进度 {value0}%", { value0: task.progressPercent })}</small></Link><input aria-label={tx("{value0}进度", { value0: task.title })} type="number" min="0" max="100" defaultValue={task.status === 2 ? 100 : task.progressPercent} disabled={task.status === 2} onBlur={(event) => { const value = Number(event.currentTarget.value); if (Number.isFinite(value) && value !== task.progressPercent) void progress(task, value); }} /><IconButton label={tx("编辑悬赏")} onClick={() => onEditTask(task)}><Pencil size={16} /></IconButton></div>)}</div>}</section> : null}
    {tab === "time" ? <section className="project-section"><header><div><h2>{tx("计划与投入")}</h2><p>{tx("计划按 Task 当前项目组合；实际投入只按发生时 Project 快照汇总。")}</p></div><strong>{formatSeconds(project.actualSeconds)}</strong></header><div className="project-time-columns"><div><h3><CalendarClock size={16} />{tx("计划")}</h3>{data.plannedSchedules.length ? data.plannedSchedules.map((item) => <p key={item.id}><strong>{item.title}</strong><span>{item.scheduleDate} · {item.startTime.slice(0, 5)}-{item.endTime.slice(0, 5)}</span></p>) : <p className="muted">{tx("暂无计划。")}</p>}</div><div><h3><Clock3 size={16} />{tx("真实投入")}</h3>{data.actualEntries.length ? data.actualEntries.map((item) => <p key={`${item.source}:${item.id}`}><strong>{item.taskTitleSnapshot || item.title || item.source}</strong><span>{formatEntry(item)}</span></p>) : <p className="muted">{tx("还没有记录投入")}<br />{tx("从所属悬赏开始计时后，这里会自动汇总。")}</p>}</div></div></section> : null}
    {tab === "notes" ? <section className="project-section project-notes"><div className="project-note-copy"><h2>{tx("项目笔记")}</h2><p>{project.notes || tx("暂无项目笔记。编辑项目即可补充。")}</p><Button onClick={() => setEditing(true)}><Pencil size={15} />{tx("编辑笔记")}</Button></div><div className="project-materials"><header><div><h2>{tx("素材")}</h2><p>{tx("这里只展示关联随手记的摘要，原文仍由随手记拥有。")}</p></div><StickyNote size={18} /></header>{materialsQuery.isPending ? <p className="muted">{tx("正在加载素材...")}</p> : null}{materialsQuery.isError ? <p className="quick-note-error" role="alert">{tx("素材没有加载成功")}</p> : null}{!materialsQuery.isPending && !materialsQuery.data?.items.length ? <div className="project-material-empty"><p>{tx("还没有关联素材")}</p><Link to="/notes">{tx("从随手记中选择项目")}</Link></div> : null}<div className="project-material-list">{materialsQuery.data?.items.map((item) => <Link to={item.deepLink} key={item.id}><span><strong>{item.title}</strong>{item.archivedAt ? <Badge tone="warning">{tx("已归档")}</Badge> : null}</span><p>{item.excerpt}</p><small>{item.noteDate}{item.tag ? ` · #${item.tag}` : ""}</small></Link>)}</div></div></section> : null}
    {editing ? <ProjectEditor project={project} request={request} onError={onError} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await refresh(); }} /> : null}
  </section>;
}

function ProjectEditor({ project, request, onError, onClose, onSaved }: { project: ProjectSummary | null; request: Request; onError: (message: string, title?: string) => void; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [pending, setPending] = useState(false);
  useEffect(() => { setDraft(project ? { name: project.name, description: project.description ?? "", priority: String(project.priority), startDate: project.startDate ?? "", targetDate: project.targetDate ?? "", notes: project.notes ?? "" } : emptyDraft); }, [project]);
  async function submit(event: FormEvent) { event.preventDefault(); setPending(true); try { await request(project ? `/api/projects/${project.id}` : "/api/projects", { method: project ? "PUT" : "POST", body: JSON.stringify({ ...(project ? { expectedVersion: project.version } : {}), name: draft.name.trim(), description: draft.description.trim() || null, priority: Number(draft.priority), startDate: draft.startDate || null, targetDate: draft.targetDate || null, notes: draft.notes.trim() || null }) }); await onSaved(); } catch (error) { onError(message(error), tx("项目没有保存")); } finally { setPending(false); } }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="time-modal project-editor" onSubmit={submit}><header><div><p className="route-eyebrow">{project ? tx("编辑项目") : tx("新项目")}</p><h2>{project ? project.name : tx("创建长期目标")}</h2></div><IconButton label={tx("关闭")} type="button" onClick={onClose}>×</IconButton></header><label>{tx("项目名称")}<input className="field" autoFocus required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>{tx("说明")}<textarea value={draft.description} maxLength={4000} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="project-editor-row"><label>{tx("优先级")}<select className="field" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="1">{tx("低")}</option><option value="2">{tx("中")}</option><option value="3">{tx("高")}</option></select></label><label>{tx("开始日期")}<input className="field" type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label><label>{tx("目标日期")}<input className="field" type="date" value={draft.targetDate} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })} /></label></div><label>{tx("项目笔记")}<textarea value={draft.notes} maxLength={10000} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><footer><Button type="button" onClick={onClose}>{tx("取消")}</Button><Button variant="primary" loading={pending} type="submit">{tx("保存")}</Button></footer></form></div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="project-fact"><span>{tx(label)}</span><strong>{value}</strong></div>; }
function statusLabel(status: number) { return tx(["规划中", "进行中", "已暂停", "已完成"][status] ?? "未知"); }
function priorityLabel(priority: number) { return tx(["", "低优先", "中优先", "高优先"][priority] ?? "中优先"); }
function formatSeconds(seconds: number) { const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function formatEntry(item: ProjectDetail["actualEntries"][number]) { const start = item.startedAt || item.actualStartedAt; const end = item.endedAt || item.actualEndedAt; if (!start || !end) return tx("历史时间未知"); const seconds = Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 1000); return formatSeconds(seconds); }
function message(error: unknown) { return error instanceof Error ? error.message : tx("操作失败"); }
