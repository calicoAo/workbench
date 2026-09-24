import { CalendarDays, Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../../shared/ui";
import { DIMENSIONS, type Category } from "../categories";
import { scheduleDurationMinutes, TimelineBoard, type Schedule, type TimelineItem } from "./timeline";

export type { Schedule, TimelineItem } from "./timeline";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Task = { id: number; title: string; version?: number; projectId?: number | null };
type Project = { id: number; name: string; status: number; archivedAt: string | null };
type Draft = { categoryId: string; projectId: string; taskId: string; kind: string; title: string; note: string; startDate: string; start: string; endDate: string; end: string; completeTask: boolean };
type CalendarState = { date: string; editorOpen: boolean; editingId: number | null; overlapConflict: boolean; draft: Draft };

export function CalendarFeature({
  request,
  selectedDate,
  loading,
  items,
  tasks,
  categories,
  projects = [],
  recordTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  initialKind,
  actualSeconds,
  onEditSleep,
  acceptedTaskIds,
  onError,
  onChanged
}: {
  request: Request;
  selectedDate: string;
  loading: boolean;
  items: TimelineItem[];
  tasks: Task[];
  categories: Category[];
  projects?: Project[];
  recordTimezone?: string;
  initialKind?: "plan" | "actual";
  actualSeconds?: number;
  onEditSleep?: () => void;
  acceptedTaskIds?: number[];
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [state, setState] = useState<CalendarState>(() => initialState(selectedDate, initialKind));
  const [remoteCandidateIds, setRemoteCandidateIds] = useState<number[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  let currentState = state;
  if (state.date !== selectedDate) {
    currentState = initialState(selectedDate, initialKind);
    setState(currentState);
  }

  const scheduleItems = items.filter((item) => !item.marker);
  const actualMinutes = scheduleItems.filter((item) => item.kind === 1).reduce((sum, item) => sum + scheduleDurationMinutes(item), 0);
  const plannedCount = scheduleItems.filter((item) => item.kind === 0).length;
  useEffect(() => {
    if (!currentState.editorOpen || currentState.draft.kind !== "1" || currentState.draft.startDate === selectedDate) { setRemoteCandidateIds(null); setCandidatesLoading(false); return; }
    let current = true;
    setCandidatesLoading(true);
    void request<{ taskIds: number[] }>(`/api/task-days?date=${currentState.draft.startDate}`).then((result) => { if (current) setRemoteCandidateIds(result.taskIds); }).catch((error) => { if (current) onError(errorMessage(error), "任务候选加载失败"); }).finally(() => { if (current) setCandidatesLoading(false); });
    return () => { current = false; };
  }, [currentState.editorOpen, currentState.draft.kind, currentState.draft.startDate, onError, request, selectedDate]);
  const editingItem = currentState.editingId ? scheduleItems.find((item) => item.id === currentState.editingId) : null;
  const candidateIds = new Set(currentState.draft.startDate === selectedDate ? acceptedTaskIds ?? tasks.map((task) => task.id) : remoteCandidateIds ?? []);
  const eligibleTasks = currentState.draft.kind === "1" ? tasks.filter((task) => candidateIds.has(task.id) || task.id === editingItem?.taskId) : tasks;
  const taskId = eligibleTasks.some((task) => String(task.id) === currentState.draft.taskId) ? currentState.draft.taskId : "";
  const categoryId = categories.some((category) => String(category.id) === currentState.draft.categoryId)
    ? currentState.draft.categoryId
    : String(categories[0]?.id ?? "");

  function updateDraft(patch: Partial<Draft>) {
    setState((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    if (!taskId && !currentState.draft.title.trim()) {
      onError("不关联任务时，需要写一下这段时间做了什么");
      return;
    }
    await saveSchedule(true);
  }

  async function saveSchedule(includeInActualTime: boolean) {
    const editing = currentState.editingId ? scheduleItems.find((item) => item.id === currentState.editingId) : null;
    try {
      const selectedTask = taskId ? eligibleTasks.find((task) => task.id === Number(taskId)) : null;
      await request(editing ? `/api/schedules/${editing.id}` : "/api/schedules", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          expectedVersion: editing?.version,
          scheduleDate: currentState.draft.startDate,
          startDate: currentState.draft.startDate,
          endDate: currentState.draft.endDate,
          startTime: currentState.draft.start,
          endTime: currentState.draft.end,
          kind: editing ? undefined : Number(currentState.draft.kind),
          taskId: taskId ? Number(taskId) : undefined,
          expectedTaskVersion: currentState.draft.completeTask ? selectedTask?.version : undefined,
          categoryId: !taskId && categoryId ? Number(categoryId) : undefined,
          projectIdAtOccurrence: Number(currentState.draft.kind) === 1 ? (currentState.draft.projectId ? Number(currentState.draft.projectId) : null) : undefined,
          title: currentState.draft.title.trim() || undefined,
          note: currentState.draft.note.trim() || undefined,
          recordTimezone,
          includeInActualTime,
          completeTask: Number(currentState.draft.kind) === 1 && currentState.draft.completeTask
        })
      });
      setState((current) => ({ ...current, editorOpen: false, editingId: null, overlapConflict: false, draft: { ...current.draft, title: "", note: "", completeTask: false } }));
      await onChanged();
    } catch (error) {
      if (Number(currentState.draft.kind) === 1 && errorMessage(error).toLowerCase().includes("overlap")) setState((current) => ({ ...current, overlapConflict: true }));
      onError(errorMessage(error), "操作没有成功");
    }
  }

  function editSchedule(item: TimelineItem) {
    if (item.marker === "sleep") { onEditSleep?.(); return; }
    if (item.source === 1 || item.actualTimeClass === 2) { onError(item.source === 1 ? "计时记录只能通过原 Session 修正。" : "历史实际记录为只读。", "此记录不可直接编辑"); return; }
    setState((current) => ({ ...current, editorOpen: true, editingId: item.id, overlapConflict: false, draft: { ...current.draft, taskId: item.taskId ? String(item.taskId) : "", categoryId: item.categoryId ? String(item.categoryId) : "", projectId: item.projectIdAtOccurrence ? String(item.projectIdAtOccurrence) : "", kind: String(item.kind), title: item.title, note: item.note ?? "", startDate: item.scheduleDate ?? selectedDate, endDate: item.scheduleDate ?? selectedDate, start: item.startTime.slice(0, 5), end: item.endTime.slice(0, 5), completeTask: false } }));
  }

  async function deleteSchedule(id: number) {
    try {
      const schedule = scheduleItems.find((item) => item.id === id);
      const body = JSON.stringify({ operationId: crypto.randomUUID(), expectedVersion: schedule?.version ?? 1 });
      await request(`/api/schedules/${id}`, { method: "DELETE", body });
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  return (
    <>
      <section className="glass-panel p-3 xl:h-full">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <span className="text-mint-700"><CalendarDays size={16} /></span>
            <h2 className="section-title">小时记录</h2>
          </div>
          <Button variant="primary" size="sm" type="button" onClick={() => setState((current) => ({ ...current, editorOpen: true, editingId: null, overlapConflict: false }))}>
            <Plus size={14} />
            记录
          </Button>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <Metric label="已记录" value={actualSeconds === undefined ? formatDuration(actualMinutes) : formatSeconds(actualSeconds)} />
          <Metric label="安排" value={`${plannedCount}段`} />
        </div>
        <div className="mb-2 flex items-center gap-3 px-1 text-[10px] text-soft">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-mint-500" />实际</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full border border-dashed border-pink-300 bg-white/80" />安排</span>
        </div>

        {loading && <EmptyText text="加载中..." />}
        {!loading && !items.length && <EmptyText text="这一天还没有时间记录。" />}
        {!!items.length && <TimelineBoard items={items} onDelete={deleteSchedule} onEdit={editSchedule} />}
      </section>

      {currentState.editorOpen && (
        <TimeBlockDialog
          categories={categories}
          tasks={eligibleTasks}
          candidatesLoading={candidatesLoading}
          projects={projects}
          draft={{ ...currentState.draft, taskId, categoryId }}
          onChange={updateDraft}
          onClose={() => setState((current) => ({ ...current, editorOpen: false }))}
          onSubmit={createSchedule}
          editing={Boolean(currentState.editingId)}
          overlapConflict={currentState.overlapConflict}
          onKeepExcluded={() => void saveSchedule(false)}
        />
      )}
    </>
  );
}

function TimeBlockDialog({ categories, tasks, projects, draft, editing, overlapConflict, candidatesLoading, onChange, onClose, onSubmit, onKeepExcluded }: {
  categories: Category[];
  tasks: Task[];
  projects: Project[];
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  editing: boolean;
  overlapConflict: boolean;
  candidatesLoading: boolean;
  onKeepExcluded: () => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(shellRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? []);
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); trigger?.focus(); };
  }, []);
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div ref={shellRef} className="modal-shell" role="dialog" aria-modal="true" aria-label={editing ? "修正时间块" : "记录时间块"} onMouseDown={(event) => event.stopPropagation()}>
        <form className="time-modal" onSubmit={onSubmit}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editing ? "修正时间块" : "记录时间块"}</h3>
            <IconButton size="sm" label="关闭" type="button" onClick={onClose}><X size={15} /></IconButton>
          </div>

          <div className="time-editor-primary-grid">
            <select aria-label="关联任务" className="field" value={draft.taskId} onChange={(event) => { const task = tasks.find((item) => String(item.id) === event.target.value); onChange({ taskId: event.target.value, projectId: task?.projectId ? String(task.projectId) : "" }); }}>
              <option value="">{candidatesLoading ? "正在读取当日接取任务..." : draft.kind === "1" ? "不关联任务" : "不关联任务"}</option>
              {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
            <select aria-label="记录类型" className="field" value={draft.kind} onChange={(event) => onChange({ kind: event.target.value })}>
              <option value="1">实际</option>
              <option value="0">安排</option>
            </select>
          </div>

          {draft.kind === "1" ? <label className="task-form-field mt-2"><span>发生时项目</span><select aria-label="发生时项目" className="field" value={draft.projectId} onChange={(event) => onChange({ projectId: event.target.value })}><option value="">Inbox / 无项目</option>{projects.filter((project) => !project.archivedAt && project.status !== 3).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label> : null}

          {!draft.taskId && (
            <div className="mt-2 grid grid-cols-[1fr_128px] gap-2">
              <input aria-label="时间块标题" className="field" placeholder="这段时间做了什么" value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
              <select aria-label="时间块分类" className="field" value={draft.categoryId} onChange={(event) => onChange({ categoryId: event.target.value })}>
                <CategoryOptions categories={categories} />
              </select>
            </div>
          )}

          <div className="time-editor-date-grid">
            <label className="text-[11px] text-soft">开始日期<input aria-label="开始日期" className="field mt-1" type="date" value={draft.startDate} onChange={(event) => onChange({ startDate: event.target.value, ...(draft.kind === "0" ? { endDate: event.target.value } : {}) })} /></label>
            <label className="text-[11px] text-soft">开始时间<input aria-label="开始时间" className="field mt-1" type="time" value={draft.start} onChange={(event) => onChange({ start: event.target.value })} /></label>
            <label className="text-[11px] text-soft">结束日期<input aria-label="结束日期" className="field mt-1" type="date" value={draft.endDate} disabled={draft.kind === "0"} onChange={(event) => onChange({ endDate: event.target.value })} /></label>
            <label className="text-[11px] text-soft">结束时间<input aria-label="结束时间" className="field mt-1" type="time" value={draft.end} onChange={(event) => onChange({ end: event.target.value })} /></label>
          </div>
          <input aria-label="时间块备注" className="field mt-2" placeholder="备注，可不填" value={draft.note} onChange={(event) => onChange({ note: event.target.value })} />
          {draft.kind === "1" && draft.taskId ? <label className="manual-complete-option"><input type="checkbox" checked={draft.completeTask} onChange={(event) => onChange({ completeTask: event.target.checked })} />同时完成悬赏（同一事务）</label> : null}
          {draft.kind === "1" ? <p className="manual-actual-note">补录投入 ≠ 完成 Task；默认只记录实际投入。</p> : null}
          {overlapConflict ? <div className="overlap-conflict" role="alert"><strong>与已有投入重叠</strong><span>调整开始/结束时间，或保留为不计入汇总的附注。</span><button type="button" onClick={onKeepExcluded}>保留附注，不计入投入汇总</button></div> : null}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit">保存</Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function CategoryOptions({ categories }: { categories: Category[] }) {
  const unmapped = categories.filter((category) => category.dimensionKey === null);
  return <>{DIMENSIONS.map((dimension) => {
    const options = categories.filter((category) => category.dimensionKey === dimension.key);
    return options.length ? <optgroup key={dimension.key} label={dimension.label}>{options.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup> : null;
  })}{unmapped.length ? <optgroup label="暂不映射">{unmapped.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup> : null}</>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric-card"><p className="text-[11px] text-soft">{label}</p><p className="mt-0.5 text-base font-semibold">{value}</p></div>;
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{text}</p>;
}

function initialState(date: string, initialKind?: "plan" | "actual"): CalendarState {
  return { date, editorOpen: Boolean(initialKind), editingId: null, overlapConflict: false, draft: { categoryId: "", projectId: "", taskId: "", kind: initialKind === "plan" ? "0" : "1", title: "", note: "", startDate: date, start: "09:00", endDate: date, end: "10:00", completeTask: false } };
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatSeconds(seconds: number) {
  return formatDuration(Math.floor(seconds / 60));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
