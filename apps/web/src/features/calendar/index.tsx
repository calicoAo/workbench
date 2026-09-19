import { CalendarDays, Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { type FormEvent, useState } from "react";
import { DIMENSIONS, type Category } from "../categories";
import { scheduleDurationMinutes, TimelineBoard, type Schedule, type TimelineItem } from "./timeline";

export type { Schedule, TimelineItem } from "./timeline";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Task = { id: number; title: string };
type Draft = { categoryId: string; taskId: string; kind: string; title: string; note: string; start: string; end: string };
type CalendarState = { date: string; editorOpen: boolean; draft: Draft };

export function CalendarFeature({
  request,
  selectedDate,
  loading,
  items,
  tasks,
  categories,
  onError,
  onChanged
}: {
  request: Request;
  selectedDate: string;
  loading: boolean;
  items: TimelineItem[];
  tasks: Task[];
  categories: Category[];
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [state, setState] = useState<CalendarState>(() => initialState(selectedDate));
  let currentState = state;
  if (state.date !== selectedDate) {
    currentState = initialState(selectedDate);
    setState(currentState);
  }

  const scheduleItems = items.filter((item) => !item.marker);
  const actualMinutes = scheduleItems.filter((item) => item.kind === 1).reduce((sum, item) => sum + scheduleDurationMinutes(item), 0);
  const plannedCount = scheduleItems.filter((item) => item.kind === 0).length;
  const taskId = tasks.some((task) => String(task.id) === currentState.draft.taskId) ? currentState.draft.taskId : "";
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
    try {
      await request("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          scheduleDate: selectedDate,
          startTime: currentState.draft.start,
          endTime: currentState.draft.end,
          kind: Number(currentState.draft.kind),
          taskId: taskId ? Number(taskId) : undefined,
          categoryId: !taskId && categoryId ? Number(categoryId) : undefined,
          title: currentState.draft.title.trim() || undefined,
          note: currentState.draft.note.trim() || undefined
        })
      });
      setState((current) => ({ ...current, editorOpen: false, draft: { ...current.draft, title: "", note: "" } }));
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  async function deleteSchedule(id: number) {
    try {
      await request(`/api/schedules/${id}`, { method: "DELETE" });
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  return (
    <>
      <section className="glass-panel p-3 xl:h-full">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-mint-700"><CalendarDays size={16} /></span>
            <h2 className="section-title">小时记录</h2>
          </div>
          <button className="primary-button h-8 gap-1 px-3 text-[11px]" type="button" onClick={() => setState((current) => ({ ...current, editorOpen: true }))}>
            <Plus size={14} />
            记录
          </button>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <Metric label="已记录" value={formatDuration(actualMinutes)} />
          <Metric label="安排" value={`${plannedCount}段`} />
        </div>
        <div className="mb-2 flex items-center gap-3 px-1 text-[10px] text-soft">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-mint-500" />实际</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full border border-dashed border-pink-300 bg-white/80" />安排</span>
        </div>

        {loading && <EmptyText text="加载中..." />}
        {!loading && !items.length && <EmptyText text="这一天还没有时间记录。" />}
        {!!items.length && <TimelineBoard items={items} onDelete={deleteSchedule} />}
      </section>

      {currentState.editorOpen && (
        <TimeBlockDialog
          categories={categories}
          tasks={tasks}
          draft={{ ...currentState.draft, taskId, categoryId }}
          onChange={updateDraft}
          onClose={() => setState((current) => ({ ...current, editorOpen: false }))}
          onSubmit={createSchedule}
        />
      )}
    </>
  );
}

function TimeBlockDialog({ categories, tasks, draft, onChange, onClose, onSubmit }: {
  categories: Category[];
  tasks: Task[];
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>
        <form className="time-modal" onSubmit={onSubmit}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">记录时间块</h3>
            <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={onClose}><X size={15} /></button>
          </div>

          <div className="grid grid-cols-[1fr_96px] gap-2">
            <select aria-label="关联任务" className="field" value={draft.taskId} onChange={(event) => onChange({ taskId: event.target.value })}>
              <option value="">不关联任务</option>
              {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
            <select aria-label="记录类型" className="field" value={draft.kind} onChange={(event) => onChange({ kind: event.target.value })}>
              <option value="1">实际</option>
              <option value="0">安排</option>
            </select>
          </div>

          {!draft.taskId && (
            <div className="mt-2 grid grid-cols-[1fr_128px] gap-2">
              <input aria-label="时间块标题" className="field" placeholder="这段时间做了什么" value={draft.title} onChange={(event) => onChange({ title: event.target.value })} />
              <select aria-label="时间块分类" className="field" value={draft.categoryId} onChange={(event) => onChange({ categoryId: event.target.value })}>
                <CategoryOptions categories={categories} />
              </select>
            </div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-soft">开始<input className="field mt-1" type="time" value={draft.start} onChange={(event) => onChange({ start: event.target.value })} /></label>
            <label className="text-[11px] text-soft">结束<input className="field mt-1" type="time" value={draft.end} onChange={(event) => onChange({ end: event.target.value })} /></label>
          </div>
          <input aria-label="时间块备注" className="field mt-2" placeholder="备注，可不填" value={draft.note} onChange={(event) => onChange({ note: event.target.value })} />

          <div className="mt-4 flex justify-end gap-2">
            <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={onClose}>取消</button>
            <button className="primary-button px-5" type="submit">保存</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function CategoryOptions({ categories }: { categories: Category[] }) {
  return <>{DIMENSIONS.map((dimension) => {
    const options = categories.filter((category) => category.dimensionKey === dimension.key);
    return options.length ? <optgroup key={dimension.key} label={dimension.label}>{options.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup> : null;
  })}</>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric-card"><p className="text-[11px] text-soft">{label}</p><p className="mt-0.5 text-base font-semibold">{value}</p></div>;
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{text}</p>;
}

function initialState(date: string): CalendarState {
  return { date, editorOpen: false, draft: { categoryId: "", taskId: "", kind: "1", title: "", note: "", start: "09:00", end: "10:00" } };
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
