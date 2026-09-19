import { type FormEvent, type ReactNode, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import type { Category } from "../categories";
import { type Confirm, type Request, type Task, difficultyLabel, formatDateTime, perform } from "./model";
import { CategoryOptions, CategoryTag, CloseButton, EmptyText, ModalPortal } from "./task-ui";

export function SelectDailyTasksWorkflow({ children, request, selectedDate, tasks, categories, dailyTaskIds, onError, onConfirm, onChanged }: {
  children: (open: () => void) => ReactNode;
  request: Request;
  selectedDate: string;
  tasks: Task[];
  categories: Category[];
  dailyTaskIds: number[];
  onError: (message: string, title?: string) => void;
  onConfirm: Confirm;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [filter, setFilter] = useState("all");
  const poolTasks = tasks.filter((task) => task.status !== 2 && task.status !== 3);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const filtered = poolTasks.filter((task) => filter === "all" || (filter === "none" ? !task.categoryId : String(task.categoryId) === filter));

  function show() {
    const poolTaskIds = new Set(poolTasks.map((task) => task.id));
    setSelectedIds(dailyTaskIds.filter((taskId) => poolTaskIds.has(taskId)));
    setFilter("all");
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedIds.length) {
      onError("至少接取一个任务，今天才有一块可以推进的悬赏。");
      return;
    }
    await perform(onError, async () => {
      await request("/api/task-days", {
        method: "PUT",
        body: JSON.stringify({ taskDate: selectedDate, taskIds: selectedIds })
      });
      setOpen(false);
      await onChanged();
    });
  }

  function remove(task: Task) {
    onConfirm("删除任务", "删除这个任务吗？关联的时间轴记录也会一起删除。", async () => {
      await perform(onError, async () => {
        await request(`/api/tasks/${task.id}`, { method: "DELETE" });
        setSelectedIds((ids) => ids.filter((id) => id !== task.id));
        await onChanged();
      });
    }, "删除");
  }

  return <>
    {children(show)}
    {open && (
      <ModalPortal onClose={() => setOpen(false)}>
        <form className="task-selection-modal" onSubmit={submit}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div><p className="text-[11px] text-soft">{selectedDate} · 任务池</p><h3 className="text-sm font-semibold">接取今天的悬赏</h3></div>
            <CloseButton onClose={() => setOpen(false)} />
          </div>
          <p className="mb-3 text-[11px] leading-5 text-soft">挑选今天真正要推进的任务。未接取的任务仍会留在任务池里，不会消失。</p>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-soft">任务池 {poolTasks.length} 个</span>
            <select className="field h-8 max-w-[220px] text-[11px]" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">全部分类</option><option value="none">未分类</option><CategoryOptions categories={categories} />
            </select>
          </div>
          <div className="task-pool-list">
            {filtered.length ? filtered.map((task) => {
              const category = task.categoryId ? categoryById.get(task.categoryId) : null;
              const selected = selectedIds.includes(task.id);
              return (
                <div className={`task-pool-option ${selected ? "task-pool-option-selected" : ""}`} key={task.id}>
                  <label className="task-pool-main">
                    <input type="checkbox" checked={selected} onChange={() => setSelectedIds((ids) => ids.includes(task.id) ? ids.filter((id) => id !== task.id) : [...ids, task.id])} />
                    <span className="min-w-0 flex-1"><span className="task-pool-line">
                      {task.pinned ? <Star className="shrink-0 text-pink-500" size={14} fill="currentColor" /> : null}
                      <strong>{task.title}</strong>
                      {category ? <CategoryTag category={category} /> : <span className="task-pool-empty-category">未分类</span>}
                      <span className="task-pool-inline-meta">发布 {formatDateTime(task.createdAt)}</span>
                      <span className="task-pool-inline-meta">{task.dueAt ? `截止 ${formatDateTime(task.dueAt)}` : "暂无截止"}</span>
                      <span className="task-pool-inline-meta">{difficultyLabel(task.difficulty)}</span>
                      {task.description?.trim() ? <span className="task-pool-inline-meta task-pool-description" title={task.description}>{task.description}</span> : null}
                    </span></span>
                  </label>
                  <button className="task-pool-delete" type="button" aria-label="删除任务" title="删除任务" onClick={() => remove(task)}><Trash2 size={14} /></button>
                </div>
              );
            }) : <EmptyText text={poolTasks.length ? "这个分类下没有未完成任务。" : "任务池里还没有未完成任务。"} />}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-soft">已接取 {selectedIds.length} 个</span>
            <div className="flex gap-2"><button className="icon-button w-auto px-4" type="button" onClick={() => setOpen(false)}>取消</button><button className="primary-button px-5" type="submit">确认接取</button></div>
          </div>
        </form>
      </ModalPortal>
    )}
  </>;
}
