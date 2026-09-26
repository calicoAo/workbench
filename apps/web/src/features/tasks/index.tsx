import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Ellipsis, Gift, GripVertical, Pencil, Play, Plus, Star, X } from "lucide-react";
import { Badge, Button, FilterChip, IconButton } from "../../shared/ui";
import { DIMENSIONS, type Category, type DimensionKey, visibleDimensions } from "../categories";
import { estimatePlannedTaskReward, type RewardEvent, type RewardGrant } from "../rewards";
import { CompleteTaskWorkflow } from "./complete-task";
import { CreateTaskWorkflow } from "./create-task";
import { EditTaskWorkflow } from "./edit-task";
import { type Confirm, type ProjectOption, type Request, type Schedule, type Task, type TimerSession, difficultyLabel, formatDateTime, perform } from "./model";
import { SelectDailyTasksWorkflow } from "./select-daily-tasks";
import { CategoryOptions, CategoryTag, CloseButton, EmptyText, ModalPortal } from "./task-ui";
import { tx } from "../../app/i18n";

export { BountyBoard } from "./bounty-board";
export { TaskDetailPage, TasksIntegrationPage, useTask, useTasks, type TaskDetailPayload, type TaskSnapshot } from "./integration";

type TaskCategoryFilter = "all" | "none" | DimensionKey;
type ContextValue = {
  panel: ReactNode;
  openCreate: (options?: { projectId?: number }) => void;
  openSelector: () => void;
  openEditor: (task: Task) => void;
  complete: (task: Task) => void | Promise<void>;
  archive: (task: Task) => void;
};

const TasksContext = createContext<ContextValue | null>(null);

export function TasksFeature({
  children,
  request,
  selectedDate,
  loading,
  tasks,
  categories,
  projects = [],
  schedules,
  dailyTaskIds,
  focusTaskIds,
  timezone,
  runningTimers,
  taskRewardEvents,
  onError,
  onConfirm,
  onChanged,
  onReward,
  onStartTimer
}: {
  children: ReactNode;
  request: Request;
  selectedDate: string;
  loading: boolean;
  tasks: Task[];
  categories: Category[];
  projects?: ProjectOption[];
  schedules: Schedule[];
  dailyTaskIds: number[];
  focusTaskIds?: number[];
  timezone?: string;
  runningTimers: TimerSession[];
  taskRewardEvents: RewardEvent[];
  onError: (message: string, title?: string) => void;
  onConfirm: Confirm;
  onChanged: () => void | Promise<void>;
  onReward: (task: Pick<Task, "id" | "title">, reward: RewardGrant | null) => void;
  onStartTimer: (taskId: number) => void | Promise<void>;
}) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<TaskCategoryFilter>("all");
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<number | null>(null);

  const taskPlans = plannedMap(schedules);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const orderedTasks = useMemo(() => sortTasksForDisplay(tasks, taskPlans), [tasks, taskPlans]);
  const activeDailyTaskIds = useMemo(() => new Set(dailyTaskIds), [dailyTaskIds]);
  const dailyOrderedTasks = useMemo(
    () => orderedTasks.filter((task) => activeDailyTaskIds.has(task.id) && task.status !== 3),
    [activeDailyTaskIds, orderedTasks]
  );
  const activeTimersByTaskId = useMemo(() => new Map(runningTimers.map((timer) => [timer.taskId, timer])), [runningTimers]);
  const activeFilter = validTaskFilter(categoryFilter, categories, tasks, dailyTaskIds) ? categoryFilter : "all";
  const filteredTasks = useMemo(() => {
    if (activeFilter === "all") return dailyOrderedTasks;
    if (activeFilter === "none") return dailyOrderedTasks.filter((task) => !task.categoryId);
    return dailyOrderedTasks.filter((task) => task.categoryId && categoryById.get(task.categoryId)?.dimensionKey === activeFilter);
  }, [activeFilter, dailyOrderedTasks, categoryById]);
  const pendingOrderedTasks = useMemo(() => dailyOrderedTasks.filter((task) => task.status !== 2), [dailyOrderedTasks]);
  const dimensionTaskCounts = useMemo(() => {
    const counts = new Map<DimensionKey, number>();
    for (const task of pendingOrderedTasks) {
      if (!task.categoryId) continue;
      const key = categoryById.get(task.categoryId)?.dimensionKey;
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [pendingOrderedTasks, categoryById]);
  const pendingTasks = filteredTasks.filter((task) => task.status !== 2);
  const uncategorizedTaskCount = pendingOrderedTasks.filter((task) => !task.categoryId).length;
  const completedTasks = useMemo(
    () => orderedTasks.filter((task) => task.status === 2).sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime()),
    [orderedTasks]
  );
  const rewardsByTaskId = useMemo(() => {
    const map = new Map<number, { xp: number; coins: number }>();
    for (const event of taskRewardEvents) {
      const taskId = Number(event.sourceId);
      if (!Number.isFinite(taskId)) continue;
      const current = map.get(taskId) ?? { xp: 0, coins: 0 };
      current.xp += event.xpDelta;
      current.coins += event.coinDelta;
      map.set(taskId, current);
    }
    return map;
  }, [taskRewardEvents]);
  function cancelDailyTask(task: Task) {
    if (!dailyTaskIds.includes(task.id)) return;
    const remainingIds = dailyTaskIds.filter((taskId) => {
      const item = tasks.find((candidate) => candidate.id === taskId);
      return taskId !== task.id && item && item.status !== 2 && item.status !== 3;
    });
    onConfirm("取消今日任务", `把「${task.title}」放回任务池吗？任务本身不会被删除。`, async () => {
      await perform(onError, async () => {
        await request("/api/task-days", {
          method: "PUT",
          body: JSON.stringify({ taskDate: selectedDate, taskIds: remainingIds })
        });
        await onChanged();
      });
    }, "取消今日");
  }

  async function updateTask(task: Task, body: Record<string, unknown>) {
    await perform(onError, async () => {
      await request(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: task.version, ...body }) });
      await onChanged();
    });
  }

  function archiveTask(task: Task) {
    onConfirm("归档悬赏", `归档「${task.title}」吗？`, async () => {
      await perform(onError, async () => {
        await request(`/api/tasks/${task.id}/archive`, { method: "PUT", body: JSON.stringify({ operationId: crypto.randomUUID(), expectedVersion: task.version }) });
        await onChanged();
      });
    }, "归档");
  }

  async function reorder(targetTaskId: number) {
    if (!draggingTaskId || draggingTaskId === targetTaskId) {
      setDraggingTaskId(null);
      setDragOverTaskId(null);
      return;
    }
    const ids = sortTasksByOrder(tasks).map((task) => task.id);
    const from = ids.indexOf(draggingTaskId);
    const to = ids.indexOf(targetTaskId);
    if (from < 0 || to < 0) {
      setDraggingTaskId(null);
      setDragOverTaskId(null);
      return;
    }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDraggingTaskId(null);
    setDragOverTaskId(null);
    await perform(onError, async () => {
      await request("/api/tasks/reorder", { method: "PUT", body: JSON.stringify({ taskIds: ids }) });
      await onChanged();
    });
  }

  function renderPanel(openCreate: () => void, openSelector: () => void, openEditor: (task: Task) => void, toggleDone: (task: Task) => void | Promise<void>) {
    const focusSet = new Set(focusTaskIds ?? []);
    const focusedTasks = pendingTasks.filter((task) => focusSet.has(task.id));
    const otherTasks = pendingTasks.filter((task) => !focusSet.has(task.id));
    const completedToday = filteredTasks.filter((task) => task.status === 2);
    const renderRow = (task: Task) => <TaskRow
      key={task.id}
      task={task}
      category={task.categoryId ? categoryById.get(task.categoryId) ?? null : null}
      categories={categories}
      plannedSchedule={taskPlans.get(task.id) ?? null}
      activeTimer={activeTimersByTaskId.get(task.id) ?? null}
      dragging={draggingTaskId === task.id}
      dragOver={dragOverTaskId === task.id && draggingTaskId !== task.id}
      onDone={() => void toggleDone(task)}
      onPinned={() => void updatePinned(task)}
      onCategoryChange={(nextCategoryId) => void updateCategory(task, nextCategoryId)}
      onProgressChange={(progress) => void updateProgress(task, progress)}
      onEdit={() => openEditor(task)}
      onStart={() => void onStartTimer(task.id)}
      onCancel={() => cancelDailyTask(task)}
      onDragStart={() => setDraggingTaskId(task.id)}
      onDragEnter={() => setDragOverTaskId(task.id)}
      onDragEnd={clearDrag}
      onDrop={() => void reorder(task.id)}
    />;
    return (
    <section className="glass-panel p-3 xl:min-h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="text-mint-700"><CheckCircle2 size={17} /></span>
          <h2 className="section-title">{tx("今日悬赏")}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" type="button" aria-label={tx("查看已完成任务")} onClick={() => setCompletedOpen(true)}>
            <CheckCircle2 size={14} />{tx("已完成")}</Button>
          <Button data-guide-anchor="task.accept" variant="secondary" size="sm" type="button" aria-label={tx("接取今日任务")} onClick={openSelector}>
            <Gift size={14} />{tx("接取")}</Button>
          <Button data-guide-anchor="task.publish" variant="primary" size="sm" type="button" onClick={openCreate}>
            <Plus size={14} />{tx("新增")}</Button>
        </div>
      </div>

      {!!dailyOrderedTasks.length && (
        <TaskDimensionTabs
          dimensions={visibleDimensions(categories)}
          active={activeFilter}
          allCount={pendingOrderedTasks.length}
          uncategorizedCount={uncategorizedTaskCount}
          dimensionCounts={dimensionTaskCounts}
          onChange={setCategoryFilter}
        />
      )}

      <div className="space-y-2 pr-1">
        {loading && <EmptyText text={tx("加载中...")} />}
        {!loading && !tasks.length && <EmptyText text={tx("任务池还没有任务，先添加一个悬赏。")} />}
        {!loading && tasks.length > 0 && !dailyOrderedTasks.length && <EmptyText text={tx("今天还没有接取任务，点击上方“接取悬赏”开始选择。")} />}
        {!!dailyOrderedTasks.length && (
          <><TaskSection title={tx("今日重点")} count={focusedTasks.length}>{focusedTasks.length ? focusedTasks.map(renderRow) : <EmptyText text={tx("还没有设置重点；可在接取面选择最多 3 项。")} />}</TaskSection><TaskSection title={tx("其他已接取")} count={otherTasks.length}>{otherTasks.length ? otherTasks.map(renderRow) : <EmptyText text={tx("暂无其他已接取悬赏。")} />}</TaskSection>{completedToday.length ? <TaskSection title={tx("已完成")} count={completedToday.length}>{completedToday.map(renderRow)}</TaskSection> : null}</>
        )}
      </div>
    </section>
    );
  }

  function clearDrag() {
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  }

  async function updatePinned(task: Task) {
    await perform(onError, async () => {
      await request(`/api/tasks/${task.id}/pinned`, { method: "PUT", body: JSON.stringify({ pinned: !task.pinned }) });
      await onChanged();
    });
  }

  async function updateCategory(task: Task, nextCategoryId: number | null) {
    if (task.categoryId === nextCategoryId) return;
    await updateTask(task, { categoryId: nextCategoryId });
  }

  async function updateProgress(task: Task, progress: number) {
    const next = Math.max(0, Math.min(100, progress));
    if (task.progressPercent === next) return;
    await updateTask(task, { progressPercent: next });
  }

  return (
    <CreateTaskWorkflow request={request} selectedDate={selectedDate} tasks={tasks} categories={categories} projects={projects} dailyTaskIds={dailyTaskIds} timezone={timezone} onError={onError} onChanged={onChanged}>
      {(openCreate) => (
        <SelectDailyTasksWorkflow request={request} selectedDate={selectedDate} tasks={tasks} categories={categories} dailyTaskIds={dailyTaskIds} focusTaskIds={focusTaskIds} onError={onError} onConfirm={onConfirm} onChanged={onChanged}>
          {(openSelector) => (
            <EditTaskWorkflow request={request} projects={projects} categories={categories} onError={onError} onChanged={onChanged}>
              {(openEditor) => (
                <CompleteTaskWorkflow request={request} selectedDate={selectedDate} timezone={timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} taskPlans={taskPlans} onError={onError} onChanged={onChanged} onReward={onReward}>
                  {(toggleDone) => (
                    <TasksContext.Provider value={{ panel: renderPanel(openCreate, openSelector, openEditor, toggleDone), openCreate, openSelector, openEditor, complete: toggleDone, archive: archiveTask }}>
                      {children}
                      {completedOpen && <CompletedTasksModal tasks={completedTasks} categories={categories} rewardsByTaskId={rewardsByTaskId} onClose={() => setCompletedOpen(false)} />}
                    </TasksContext.Provider>
                  )}
                </CompleteTaskWorkflow>
              )}
            </EditTaskWorkflow>
          )}
        </SelectDailyTasksWorkflow>
      )}
    </CreateTaskWorkflow>
  );
}

export function TasksPanel() {
  const value = useContext(TasksContext);
  if (!value) throw new Error("TasksPanel must be rendered inside TasksFeature");
  return value.panel;
}

export function useTaskSurfaces() {
  const value = useContext(TasksContext);
  if (!value) throw new Error("useTaskSurfaces must be used inside TasksFeature");
  return value;
}

function CompletedTasksModal({ tasks, categories, rewardsByTaskId, onClose }: {
  tasks: Task[]; categories: Category[]; rewardsByTaskId: Map<number, { xp: number; coins: number }>; onClose: () => void;
}) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  return (
    <ModalPortal onClose={onClose}>
      <section className="task-selection-modal">
        <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-[11px] text-soft">{tx("已完成任务")}</p><h3 className="text-sm font-semibold">{tx("完成记录")}</h3></div><CloseButton onClose={onClose} /></div>
        <div className="task-pool-list">
          {tasks.length ? tasks.map((task) => {
            const category = task.categoryId ? categoryById.get(task.categoryId) : null;
            const reward = rewardsByTaskId.get(task.id);
            return (
              <article className="completed-task-row" key={task.id}>
                <span className="task-pool-line"><strong>{task.title}</strong>{category ? <CategoryTag category={category} /> : <span className="task-pool-empty-category">{tx("未分类")}</span>}<span className="task-pool-inline-meta">{tx("完成")} {formatDateTime(task.completedAt)}</span><span className="completed-reward-pill">{reward ? tx("+{value0} XP +{value1} 金币", { value0: reward.xp, value1: reward.coins }) : tx("未记录奖励")}</span></span>
                {task.completionNote?.trim() ? <p className="mt-1 truncate text-[10px] text-soft" title={task.completionNote}>{tx("感想：")}{task.completionNote}</p> : null}
              </article>
            );
          }) : <EmptyText text={tx("还没有已完成任务。")} />}
        </div>
      </section>
    </ModalPortal>
  );
}

function TaskDimensionTabs({ dimensions, active, allCount, uncategorizedCount, dimensionCounts, onChange }: {
  dimensions: ReadonlyArray<(typeof DIMENSIONS)[number]>; active: TaskCategoryFilter; allCount: number;
  uncategorizedCount: number; dimensionCounts: Map<DimensionKey, number>; onChange: (value: TaskCategoryFilter) => void;
}) {
  return (
    <div className="task-tabs" aria-label={tx("能力维度筛选")}>
      <FilterChip active={active === "all"} count={allCount} onClick={() => onChange("all")}>{tx("全部")}</FilterChip>
      {dimensions.map((dimension) => <FilterChip active={active === dimension.key} count={dimensionCounts.get(dimension.key) ?? 0} dotColor={dimension.color} key={dimension.key} onClick={() => onChange(dimension.key)}>{tx(dimension.label)}</FilterChip>)}
      {uncategorizedCount ? <FilterChip active={active === "none"} count={uncategorizedCount} onClick={() => onChange("none")}>{tx("未分类")}</FilterChip> : null}
    </div>
  );
}

function TaskSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section className="task-section"><div className="task-section-head"><span>{tx(title)}</span><Badge>{count}</Badge></div><div className="space-y-2">{children}</div></section>;
}

function TaskRow(props: {
  task: Task; category: Category | null; categories: Category[]; plannedSchedule: Schedule | null;
  activeTimer: TimerSession | null; dragging: boolean; dragOver: boolean; onDone: () => void;
  onPinned: () => void; onCategoryChange: (categoryId: number | null) => void;
  onProgressChange: (progress: number) => void; onEdit: () => void; onStart: () => void;
  onCancel: () => void;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onDrop: () => void;
}) {
  const [editingProgress, setEditingProgress] = useState(false);
  const [, setTimerTick] = useState(0);
  useEffect(() => {
    if (props.activeTimer?.status !== 0) return;
    const timer = window.setInterval(() => setTimerTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [props.activeTimer?.status]);
  const estimatedReward = estimatePlannedTaskReward(props.task, props.plannedSchedule);
  const saveProgress = (value: string) => {
    setEditingProgress(false);
    const next = Number(value);
    if (Number.isFinite(next)) props.onProgressChange(next);
  };
  return (
    <div className={`task-row ${props.activeTimer ? "task-row-active" : ""} ${props.dragging ? "task-row-dragging" : ""} ${props.dragOver ? "task-row-drop" : ""}`} onDragEnd={props.onDragEnd} onDragEnter={(event) => { event.preventDefault(); props.onDragEnter(); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); props.onDrop(); }}>
      <div className="task-row-main">
        <span className="task-row-leading">
          <span className="drag-handle" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(props.task.id)); props.onDragStart(); }} onDragEnd={props.onDragEnd} title={tx("拖拽排序")}><GripVertical size={16} /></span>
          <button className={`task-pin ${props.task.pinned ? "text-pink-500" : "text-soft"}`} aria-label={tx("重要标记")} onClick={props.onPinned}><Star size={17} fill={props.task.pinned ? "currentColor" : "none"} /></button>
          <label className="task-check-target"><input aria-label={tx("完成{value0}", { value0: props.task.title })} className="task-row-checkbox accent-mint-500" type="checkbox" checked={props.task.status === 2} onChange={props.onDone} /></label>
        </span>
        <span className="task-row-copy">
          <span className="task-row-heading"><span className={`task-title ${props.task.status === 2 ? "text-soft line-through" : ""}`}>{props.task.title}</span><span className="task-row-desktop-meta"><span className="task-created-inline">{tx("创建")} {formatDateTime(props.task.createdAt)}</span>{props.category ? <CategoryTag category={props.category} /> : null}<Badge tone="warning">{difficultyLabel(props.task.difficulty)}</Badge></span></span>
          <span className="task-row-mobile-meta"><strong>{props.activeTimer ? `${props.activeTimer.status === 0 ? "RUNNING" : "PAUSED"} · ${elapsedText(props.activeTimer.startTime)}` : props.task.status === 2 ? tx("已完成") : tx("待执行")}</strong><span>{props.category?.name ?? tx("未分类")}</span></span>
          <span className="task-row-detail-stack">
            <span className="task-meta">{props.plannedSchedule ? tx("{value0}-{value1} · 安排", { value0: props.plannedSchedule.startTime.slice(0, 5), value1: props.plannedSchedule.endTime.slice(0, 5) }) : tx("未安排时段")}</span>
            {props.task.description?.trim() ? <span className="task-meta" title={props.task.description}>{tx("详情：")}{props.task.description}</span> : null}
            {estimatedReward ? <span className="task-reward-estimate">{tx("预计 +")}{estimatedReward.xp} XP +{estimatedReward.coins} {tx("金币")}</span> : null}
            {props.task.dueAt ? <span className="task-meta">{tx("截止")} {formatDateTime(props.task.dueAt)}</span> : null}
            <span className="task-progress-line"><button className="task-progress-track" type="button" aria-label={tx("编辑任务完成百分比")} title={tx("进度 {value0}%，点击编辑", { value0: props.task.progressPercent })} onClick={() => setEditingProgress(true)}><span className="task-progress-fill" style={{ width: `${props.task.progressPercent}%` }} /></button>{editingProgress ? <input className="field task-progress-input" type="number" min={0} max={100} defaultValue={props.task.progressPercent} autoFocus aria-label={tx("任务完成百分比")} onBlur={(event) => saveProgress(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEditingProgress(false); }} /> : null}</span>
          </span>
        </span>
      </div>
      <details className="task-row-more">
        <summary aria-label={tx("更多任务操作")} title={tx("更多任务操作")}><Ellipsis size={19} /></summary>
        <div>
          <button type="button" aria-label={tx("在更多菜单中编辑任务")} onClick={props.onEdit}><Pencil size={15} />{tx("编辑任务")}</button>
          <label>{tx("能力分类")}<select aria-label={tx("移动端修改事件类型")} value={props.task.categoryId ?? ""} onChange={(event) => props.onCategoryChange(event.target.value ? Number(event.target.value) : null)}><option value="">{tx("未分类")}</option><CategoryOptions categories={props.categories} /></select></label>
          {props.task.status === 2 ? null : <button className="danger-command" type="button" onClick={props.onCancel}><X size={15} />{tx("取消今日")}</button>}
        </div>
      </details>
      <div className="task-row-controls">
        {props.activeTimer ? <Badge tone="success" className="task-row-execution-badge">{props.activeTimer.status === 0 ? "RUNNING" : "PAUSED"} · {elapsedText(props.activeTimer.startTime)}</Badge> : null}
        {props.task.status < 2 && !props.activeTimer ? <IconButton data-guide-anchor="task.start" data-guide-task-id={props.task.id} size="sm" className="task-row-primary-action" label={tx("开始计时")} onClick={props.onStart}><Play size={16} /></IconButton> : null}
      </div>
    </div>
  );
}

function validTaskFilter(filter: TaskCategoryFilter, categories: Category[], tasks: Task[], dailyTaskIds: number[]) {
  const dailyIds = new Set(dailyTaskIds);
  const visibleTasks = tasks.filter((task) => task.status !== 3 && dailyIds.has(task.id));
  if (filter === "all") return true;
  if (filter === "none") return visibleTasks.some((task) => !task.categoryId);
  return visibleTasks.some((task) => task.categoryId && categories.some((category) => category.id === task.categoryId && category.dimensionKey === filter));
}

function plannedMap(schedules: Schedule[]) {
  const map = new Map<number, Schedule>();
  for (const schedule of schedules) if (schedule.kind === 0 && schedule.taskId && !map.has(schedule.taskId)) map.set(schedule.taskId, schedule);
  return map;
}

function sortTasksByOrder(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder || b.id - a.id);
}

function sortTasksForDisplay(tasks: Task[], plans: Map<number, Schedule>) {
  return sortTasksByOrder(tasks).sort((a, b) => {
    const aPlan = plans.get(a.id);
    const bPlan = plans.get(b.id);
    if (aPlan && bPlan) return timeToMinutes(aPlan.startTime) - timeToMinutes(bPlan.startTime) || a.sortOrder - b.sortOrder;
    if (aPlan) return -1;
    if (bPlan) return 1;
    return a.sortOrder - b.sortOrder || b.id - a.id;
  });
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function elapsedText(start: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
