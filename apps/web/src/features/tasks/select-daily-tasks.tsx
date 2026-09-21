import { type FormEvent, type ReactNode, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { Button } from "../../shared/ui";
import type { Category } from "../categories";
import { type Confirm, type Request, type Task, difficultyLabel, formatDateTime, perform } from "./model";
import { CategoryOptions, CategoryTag, CloseButton, EmptyText, ModalPortal } from "./task-ui";

export function SelectDailyTasksWorkflow({ children, request, selectedDate, tasks, categories, dailyTaskIds, focusTaskIds, onError, onConfirm, onChanged }: {
  children: (open: () => void) => ReactNode;
  request: Request;
  selectedDate: string;
  tasks: Task[];
  categories: Category[];
  dailyTaskIds: number[];
  focusTaskIds?: number[];
  onError: (message: string, title?: string) => void;
  onConfirm: Confirm;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [focusedIds, setFocusedIds] = useState<number[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const poolTasks = tasks.filter((task) => task.status !== 2 && task.status !== 3);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const filtered = poolTasks.filter((task) => {
    const categoryMatch = categoryFilter === "all" || (categoryFilter === "none" ? !task.categoryId : String(task.categoryId) === categoryFilter);
    const priorityMatch = priorityFilter === "all" || String(task.priority) === priorityFilter;
    const dueSoon = Boolean(task.dueAt) && new Date(task.dueAt!).getTime() <= Date.now() + 7 * 86400000;
    const deadlineMatch = deadlineFilter === "all" || (deadlineFilter === "soon" && dueSoon);
    const keywordMatch = !keyword.trim() || `${task.title} ${task.description ?? ""}`.toLowerCase().includes(keyword.trim().toLowerCase());
    return categoryMatch && priorityMatch && deadlineMatch && keywordMatch;
  });
  const selectedMinutes = selectedIds.reduce((sum, id) => sum + (tasks.find((task) => task.id === id)?.estimatedMinutes ?? 0), 0);

  function show() {
    const poolTaskIds = new Set(poolTasks.map((task) => task.id));
    setSelectedIds(dailyTaskIds.filter((taskId) => poolTaskIds.has(taskId)));
    setFocusedIds((focusTaskIds ?? []).filter((taskId) => poolTaskIds.has(taskId)));
    setCategoryFilter("all");
    setPriorityFilter("all");
    setDeadlineFilter("all");
    setKeyword("");
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await perform(onError, async () => {
      await request("/api/task-days", { method: "PUT", body: JSON.stringify({ taskDate: selectedDate, taskIds: selectedIds, ...(focusTaskIds !== undefined ? { focusTaskIds: focusedIds.filter((id) => selectedIds.includes(id)) } : {}) }) });
      setOpen(false);
      await onChanged();
    });
  }

  function toggleTask(taskId: number, selected: boolean) {
    setSelectedIds((ids) => selected ? ids.filter((id) => id !== taskId) : [...ids, taskId]);
    if (selected) setFocusedIds((ids) => ids.filter((id) => id !== taskId));
  }

  function remove(task: Task) {
    onConfirm("删除任务", "删除这个任务吗？关联的时间轴记录也会一起删除。", async () => {
      await perform(onError, async () => {
        await request(`/api/tasks/${task.id}`, { method: "DELETE", body: JSON.stringify({ operationId: crypto.randomUUID(), expectedVersion: task.version }) });
        setSelectedIds((ids) => ids.filter((id) => id !== task.id));
        setFocusedIds((ids) => ids.filter((id) => id !== task.id));
        await onChanged();
      });
    }, "删除");
  }

  return <>
    {children(show)}
    {open && <ModalPortal onClose={() => setOpen(false)}>
      <form className="task-selection-modal" onSubmit={submit}>
        <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-[11px] text-soft">{selectedDate} · 任务池</p><h3 className="text-sm font-semibold">接取今天的悬赏</h3></div><CloseButton onClose={() => setOpen(false)} /></div>
        <p className="mb-3 text-[11px] leading-5 text-soft">可接取任意数量；今日重点建议不超过 3 项。未接取任务仍保留在悬赏池。</p>
        <div className="task-selector-summary"><strong>已接取 {selectedIds.length} 个</strong><span>预计 {selectedMinutes} 分钟</span><span>重点 {focusedIds.filter((id) => selectedIds.includes(id)).length}/3</span></div>
        <div className="task-selector-filters">
          <input className="field" aria-label="搜索悬赏" placeholder="搜索标题或详情" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select className="field" aria-label="分类筛选" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">全部分类</option><option value="none">Inbox / 未分类</option><CategoryOptions categories={categories} /></select>
          <select className="field" aria-label="优先级筛选" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">全部优先级</option><option value="3">高优先级</option><option value="2">中优先级</option><option value="1">低优先级</option></select>
          <select className="field" aria-label="截止筛选" value={deadlineFilter} onChange={(event) => setDeadlineFilter(event.target.value)}><option value="all">全部截止时间</option><option value="soon">7 天内到期</option></select>
        </div>
        <div className="task-pool-list">
          {filtered.length ? filtered.map((task) => {
            const category = task.categoryId ? categoryById.get(task.categoryId) : null;
            const selected = selectedIds.includes(task.id);
            const focused = focusedIds.includes(task.id);
            return <div className={`task-pool-option ${selected ? "task-pool-option-selected" : ""}`} key={task.id}>
              <label className="task-pool-main"><input type="checkbox" checked={selected} onChange={() => toggleTask(task.id, selected)} /><span className="min-w-0 flex-1"><span className="task-pool-line"><strong>{task.title}</strong>{category ? <CategoryTag category={category} /> : <span className="task-pool-empty-category">未分类</span>}<span className="task-pool-inline-meta">发布 {formatDateTime(task.createdAt)}</span><span className="task-pool-inline-meta">{task.dueAt ? `截止 ${formatDateTime(task.dueAt)}` : "暂无截止"}</span><span className="task-pool-inline-meta">{difficultyLabel(task.difficulty)} · {task.estimatedMinutes ? `${task.estimatedMinutes}m` : "未估时"}</span></span></span></label>
              <button className={`task-pool-delete ${focused ? "text-pink-500" : ""}`} disabled={!selected || (!focused && focusedIds.length >= 3)} type="button" aria-label={`${focused ? "取消重点" : "设为重点"}${task.title}`} onClick={() => setFocusedIds((ids) => focused ? ids.filter((id) => id !== task.id) : [...ids, task.id])}><Star size={14} fill={focused ? "currentColor" : "none"} /></button>
              <button className="task-pool-delete" type="button" aria-label={`删除${task.title}`} onClick={() => remove(task)}><Trash2 size={14} /></button>
            </div>;
          }) : <EmptyText text={poolTasks.length ? "没有符合筛选条件的悬赏。" : "任务池里还没有未完成任务。"} />}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>取消</Button><Button variant="primary" type="submit">确认接取</Button></div>
      </form>
    </ModalPortal>}
  </>;
}
