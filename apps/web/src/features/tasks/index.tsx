import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { CheckCircle2, Gift, GripVertical, Pause, Pencil, Play, Plus, Square, Star, X } from "lucide-react";
import { DIMENSIONS, type Category, type DimensionKey, visibleDimensions } from "../categories";
import { estimatePlannedTaskReward, type RewardEvent, type RewardGrant } from "../rewards";
import { CompleteTaskWorkflow } from "./complete-task";
import { CreateTaskWorkflow } from "./create-task";
import { EditTaskWorkflow } from "./edit-task";
import { type Confirm, type Request, type Schedule, type Task, type TimerSession, difficultyLabel, formatDateTime, perform } from "./model";
import { SelectDailyTasksWorkflow } from "./select-daily-tasks";
import { CategoryOptions, CategoryTag, CloseButton, EmptyText, ModalPortal } from "./task-ui";

export { TaskDetailPage, TasksIntegrationPage, useTask, useTasks, type TaskSnapshot } from "./integration";

type TaskCategoryFilter = "all" | "none" | DimensionKey;
type ContextValue = { panel: ReactNode };

const TasksContext = createContext<ContextValue | null>(null);

export function TasksFeature({
  children,
  request,
  selectedDate,
  loading,
  tasks,
  categories,
  schedules,
  dailyTaskIds,
  runningTimers,
  taskRewardEvents,
  onError,
  onConfirm,
  onChanged,
  onReward,
  onStartTimer,
  onPauseTimer,
  onFinishTimer
}: {
  children: ReactNode;
  request: Request;
  selectedDate: string;
  loading: boolean;
  tasks: Task[];
  categories: Category[];
  schedules: Schedule[];
  dailyTaskIds: number[];
  runningTimers: TimerSession[];
  taskRewardEvents: RewardEvent[];
  onError: (message: string, title?: string) => void;
  onConfirm: Confirm;
  onChanged: () => void | Promise<void>;
  onReward: (task: Pick<Task, "id" | "title">, reward: RewardGrant | null) => void;
  onStartTimer: (taskId: number) => void | Promise<void>;
  onPauseTimer: (timerId: number) => void | Promise<void>;
  onFinishTimer: (timer: TimerSession) => void;
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
    if (!remainingIds.length) {
      onError("今天至少保留一个已接取任务。可以先接取新的任务，再取消这一个。");
      return;
    }
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
      await request(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify(body) });
      await onChanged();
    });
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
    return (
    <section className="glass-panel p-3 xl:min-h-full">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-mint-700"><CheckCircle2 size={17} /></span>
          <h2 className="section-title">主要任务</h2>
        </div>
        <div className="flex items-center gap-1">
          <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" aria-label="查看已完成任务" onClick={() => setCompletedOpen(true)}>
            <CheckCircle2 size={14} />已完成
          </button>
          <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" aria-label="接取今日任务" onClick={openSelector}>
            <Gift size={14} />接取
          </button>
          <button className="primary-button h-8 gap-1 px-3 text-[11px]" type="button" onClick={openCreate}>
            <Plus size={14} />新增
          </button>
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

      <div className="space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-245px)]">
        {loading && <EmptyText text="加载中..." />}
        {!loading && !tasks.length && <EmptyText text="任务池还没有任务，先添加一个悬赏。" />}
        {!loading && tasks.length > 0 && !dailyOrderedTasks.length && <EmptyText text="今天还没有接取任务，点击上方“接取悬赏”开始选择。" />}
        {!!dailyOrderedTasks.length && (
          <TaskSection title="待完成" count={pendingTasks.length}>
            {pendingTasks.length ? pendingTasks.map((task) => (
              <TaskRow
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
                onPause={(timerId) => void onPauseTimer(timerId)}
                onFinish={onFinishTimer}
                onCancel={() => cancelDailyTask(task)}
                onDragStart={() => setDraggingTaskId(task.id)}
                onDragEnter={() => setDragOverTaskId(task.id)}
                onDragEnd={clearDrag}
                onDrop={() => void reorder(task.id)}
              />
            )) : <EmptyText text="今天的悬赏都完成了。" />}
          </TaskSection>
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
    <CreateTaskWorkflow request={request} selectedDate={selectedDate} tasks={tasks} categories={categories} dailyTaskIds={dailyTaskIds} onError={onError} onChanged={onChanged}>
      {(openCreate) => (
        <SelectDailyTasksWorkflow request={request} selectedDate={selectedDate} tasks={tasks} categories={categories} dailyTaskIds={dailyTaskIds} onError={onError} onConfirm={onConfirm} onChanged={onChanged}>
          {(openSelector) => (
            <EditTaskWorkflow request={request} onError={onError} onChanged={onChanged}>
              {(openEditor) => (
                <CompleteTaskWorkflow request={request} selectedDate={selectedDate} taskPlans={taskPlans} onError={onError} onChanged={onChanged} onReward={onReward}>
                  {(toggleDone) => (
                    <TasksContext.Provider value={{ panel: renderPanel(openCreate, openSelector, openEditor, toggleDone) }}>
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

function CompletedTasksModal({ tasks, categories, rewardsByTaskId, onClose }: {
  tasks: Task[]; categories: Category[]; rewardsByTaskId: Map<number, { xp: number; coins: number }>; onClose: () => void;
}) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  return (
    <ModalPortal onClose={onClose}>
      <section className="task-selection-modal">
        <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-[11px] text-soft">已完成任务</p><h3 className="text-sm font-semibold">完成记录</h3></div><CloseButton onClose={onClose} /></div>
        <div className="task-pool-list">
          {tasks.length ? tasks.map((task) => {
            const category = task.categoryId ? categoryById.get(task.categoryId) : null;
            const reward = rewardsByTaskId.get(task.id);
            return (
              <article className="completed-task-row" key={task.id}>
                <span className="task-pool-line"><strong>{task.title}</strong>{category ? <CategoryTag category={category} /> : <span className="task-pool-empty-category">未分类</span>}<span className="task-pool-inline-meta">完成 {formatDateTime(task.completedAt)}</span><span className="completed-reward-pill">{reward ? `+${reward.xp} XP +${reward.coins} 金币` : "未记录奖励"}</span></span>
                {task.completionNote?.trim() ? <p className="mt-1 truncate text-[10px] text-soft" title={task.completionNote}>感想：{task.completionNote}</p> : null}
              </article>
            );
          }) : <EmptyText text="还没有已完成任务。" />}
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
    <div className="task-tabs" aria-label="能力维度筛选">
      <button className={`task-tab ${active === "all" ? "task-tab-active" : ""}`} type="button" onClick={() => onChange("all")}>全部 <span>{allCount}</span></button>
      {dimensions.map((dimension) => <button className={`task-tab ${active === dimension.key ? "task-tab-active" : ""}`} type="button" key={dimension.key} onClick={() => onChange(dimension.key)}><i style={{ backgroundColor: dimension.color }} />{dimension.label}<span>{dimensionCounts.get(dimension.key) ?? 0}</span></button>)}
      {uncategorizedCount ? <button className={`task-tab ${active === "none" ? "task-tab-active" : ""}`} type="button" onClick={() => onChange("none")}>未分类 <span>{uncategorizedCount}</span></button> : null}
    </div>
  );
}

function TaskSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <section className="task-section"><div className="task-section-head"><span>{title}</span><span className="badge-gray">{count}</span></div><div className="space-y-2">{children}</div></section>;
}

function TaskRow(props: {
  task: Task; category: Category | null; categories: Category[]; plannedSchedule: Schedule | null;
  activeTimer: TimerSession | null; dragging: boolean; dragOver: boolean; onDone: () => void;
  onPinned: () => void; onCategoryChange: (categoryId: number | null) => void;
  onProgressChange: (progress: number) => void; onEdit: () => void; onStart: () => void;
  onPause: (timerId: number) => void; onFinish: (timer: TimerSession) => void; onCancel: () => void;
  onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void; onDrop: () => void;
}) {
  const [editingProgress, setEditingProgress] = useState(false);
  const estimatedReward = estimatePlannedTaskReward(props.task, props.plannedSchedule);
  const saveProgress = (value: string) => {
    setEditingProgress(false);
    const next = Number(value);
    if (Number.isFinite(next)) props.onProgressChange(next);
  };
  return (
    <div className={`task-row ${props.activeTimer ? "task-row-active" : ""} ${props.dragging ? "task-row-dragging" : ""} ${props.dragOver ? "task-row-drop" : ""}`} onDragEnd={props.onDragEnd} onDragEnter={(event) => { event.preventDefault(); props.onDragEnter(); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); props.onDrop(); }}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="drag-handle" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(props.task.id)); props.onDragStart(); }} onDragEnd={props.onDragEnd} title="拖拽排序"><GripVertical size={16} /></span>
        <button className={`shrink-0 ${props.task.pinned ? "text-pink-500" : "text-soft"}`} aria-label="重要标记" onClick={props.onPinned}><Star size={17} fill={props.task.pinned ? "currentColor" : "none"} /></button>
        <div className="flex min-w-0 items-center gap-3">
          <input aria-label={`完成${props.task.title}`} className="h-4 w-4 accent-mint-500" type="checkbox" checked={props.task.status === 2} onChange={props.onDone} />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2"><span className={`task-title ${props.task.status === 2 ? "text-soft line-through" : ""}`}>{props.task.title}</span><span className="task-created-inline">创建 {formatDateTime(props.task.createdAt)}</span>{props.category ? <CategoryTag category={props.category} /> : null}<span className="difficulty-pill">{difficultyLabel(props.task.difficulty)}</span></span>
            <span className="task-meta">{props.plannedSchedule ? `${props.plannedSchedule.startTime.slice(0, 5)}-${props.plannedSchedule.endTime.slice(0, 5)} · 安排` : "未安排时段"}</span>
            {props.task.description?.trim() ? <span className="task-meta" title={props.task.description}>详情：{props.task.description}</span> : null}
            {estimatedReward ? <span className="task-reward-estimate">预计 +{estimatedReward.xp} XP +{estimatedReward.coins} 金币</span> : null}
            {props.task.dueAt ? <span className="task-meta">截止 {formatDateTime(props.task.dueAt)}</span> : null}
            <span className="task-progress-line"><button className="task-progress-track" type="button" aria-label="编辑任务完成百分比" title={`进度 ${props.task.progressPercent}%，点击编辑`} onClick={() => setEditingProgress(true)}><span className="task-progress-fill" style={{ width: `${props.task.progressPercent}%` }} /></button>{editingProgress ? <input className="field task-progress-input" type="number" min={0} max={100} defaultValue={props.task.progressPercent} autoFocus aria-label="任务完成百分比" onBlur={(event) => saveProgress(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEditingProgress(false); }} /> : null}</span>
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {props.activeTimer ? <span className="timer-pill">{elapsedText(props.activeTimer.startTime)}</span> : null}
        <button className="icon-button h-8 w-8" aria-label="编辑任务" title="编辑任务" onClick={props.onEdit}><Pencil size={14} /></button>
        <select className="task-category-picker" aria-label="修改事件类型" value={props.task.categoryId ?? ""} onChange={(event) => props.onCategoryChange(event.target.value ? Number(event.target.value) : null)}><option value="">未分类</option><CategoryOptions categories={props.categories} /></select>
        {props.activeTimer ? <><button className="icon-button" aria-label="暂停并记录阶段完成" onClick={() => props.onPause(props.activeTimer!.id)}><Pause size={17} /></button><button className="icon-button" aria-label="结束并计入时间轴" onClick={() => props.onFinish(props.activeTimer!)}><Square size={17} /></button></> : <button className="icon-button" aria-label="开始计时" onClick={props.onStart}><Play size={17} /></button>}
        <button className="icon-button" aria-label="取消今日任务" onClick={props.onCancel}><X size={15} /></button>
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
