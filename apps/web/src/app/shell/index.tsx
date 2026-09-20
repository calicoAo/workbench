import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarDays, CheckSquare2, Gift, Home, NotebookPen, Plus, Settings, Sparkles, Wrench } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import type { Request } from "../api";
import type { FeedbackActions } from "../feedback";
import { queryKeys } from "../query";
import { CalendarFeature, type Schedule, type TimelineItem } from "../../features/calendar";
import { CategoriesFeature, type Category } from "../../features/categories";
import { DecisionToolsFeature } from "../../features/decision-tools";
import { HistoryFeature, type SleepSeriesItem, type WeeklySeriesItem } from "../../features/history";
import { RewardsFeature, type Growth, type RewardEvent } from "../../features/rewards";
import { SleepFeature, type SleepRecord } from "../../features/sleep";
import { TaskDetailPage, TasksFeature, TasksIntegrationPage, TasksPanel, type TaskSnapshot, useTask, useTasks } from "../../features/tasks";
import { MiniTimer, type CurrentSession, useCurrentSession, useTimerCommands } from "../../features/timer";
import { useTimeline, type TimelineViewItem } from "../../features/timeline";
import { WaterFeature, type WaterRecord, waterTimelineItems } from "../../features/water";
import { type AiInsight, type JournalRecord, type MorningWritingRecord, type StockReviewRecord, WritingReflectionFeature, WritingReflectionHistory, WritingReflectionShortcuts } from "../../features/writing-reflection";
import { useAssignments, useContinuationCandidates } from "../../features/assignments";
import type { AuthSession } from "../../features/auth";

type Dashboard = {
  date: string;
  stockReviewRecord: StockReviewRecord | null;
  categories: Category[];
  categoryTotals?: Category[];
  schedules: Schedule[];
  sleepRecord: SleepRecord | null;
  journalRecord: JournalRecord | null;
  morningWritingRecord: MorningWritingRecord | null;
  waterRecord: WaterRecord | null;
  growth: Growth;
  rewardEvents: RewardEvent[];
  taskRewardEvents?: RewardEvent[];
  aiInsights: AiInsight[];
  weeklySeries: WeeklySeriesItem[];
  monthlySleepSeries: SleepSeriesItem[];
  weeklyStats: { totalMinutes: number; completedTasks: number; journalDays: number; stockReviewDays: number };
};

type WorkspaceContext = {
  request: Request;
  session: AuthSession;
  feedback: FeedbackActions;
  date: string;
  dashboard: Dashboard | null;
  tasks: TaskSnapshot[];
  assignments: number[];
  currentSession: CurrentSession | null;
  timeline: TimelineViewItem[];
  loading: boolean;
  queryError: string | null;
  timer: ReturnType<typeof useTimerCommands>;
  refresh: () => Promise<void>;
};

export function WorkspaceRouter({ request, session, feedback }: { request: Request; session: AuthSession; feedback: FeedbackActions }) {
  return <Routes>
    <Route path="/" element={<Navigate replace to={`/today?date=${todayString()}`} />} />
    <Route element={<WorkspaceRoot request={request} session={session} feedback={feedback} />}>
      <Route path="/today" element={<TodayRoute />} />
      <Route path="/tasks" element={<TasksRoute />} />
      <Route path="/tasks/:taskId" element={<TaskRoute />} />
      <Route path="/calendar" element={<CalendarRoute />} />
      <Route path="/journal" element={<JournalRoute />} />
      <Route path="/writing" element={<JournalRoute />} />
      <Route path="/rewards" element={<RewardsRoute />} />
      <Route path="/tools" element={<ToolsRoute />} />
      <Route path="/insights" element={<InsightsRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="*" element={<NotFoundRoute />} />
    </Route>
  </Routes>;
}

function WorkspaceRoot({ request, session, feedback }: { request: Request; session: AuthSession; feedback: FeedbackActions }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const date = validDate(searchParams.get("date")) ? searchParams.get("date")! : todayString();
  const [preparedDate, setPreparedDate] = useState<string | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (searchParams.get("date") === date) return;
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("date", date); return next; }, { replace: true });
  }, [date, searchParams, setSearchParams]);
  useEffect(() => {
    let current = true;
    setPreparedDate(null);
    void request("/api/daily-carryovers", { method: "POST", body: JSON.stringify({ targetDate: date }) })
      .then(() => { if (current) setPreparedDate(date); })
      .catch((error) => feedback.notice(error instanceof Error ? error.message : "日期准备失败", "日期准备没有成功"));
    return () => { current = false; };
  }, [date, feedback.notice, request]);

  const dashboardQuery = useQuery({ queryKey: queryKeys.today(session.user.id, date), enabled: preparedDate === date, queryFn: () => request<Dashboard>(`/api/dashboard?date=${date}`) });
  const tasksQuery = useTasks(request, session.user.id);
  const assignmentsQuery = useAssignments(request, session.user.id, date);
  useContinuationCandidates(request, session.user.id, date);
  const currentQuery = useCurrentSession(request, session.user.id);
  const dashboard = dashboardQuery.data?.date === date ? dashboardQuery.data : null;
  const tasks = tasksQuery.data ?? [];
  const currentSession = currentQuery.data ?? null;
  const timer = useTimerCommands({ request, userId: session.user.id, date, timezone: session.user.timezone, onError: feedback.notice });
  const timelineQuery = useTimeline(request, session.user.id, date, session.user.timezone, dashboard?.schedules ?? [], Boolean(dashboard));
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.today(session.user.id, date) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(session.user.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments(session.user.id, date) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(session.user.id, date) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.currentSession(session.user.id) })
    ]);
  };
  const runningTimers = currentSession ? [currentSession] : [];
  const queryErrorValue = dashboardQuery.error ?? tasksQuery.error ?? assignmentsQuery.error ?? currentQuery.error ?? timelineQuery.error;
  const appContext: WorkspaceContext = { request, session, feedback, date, dashboard, tasks, assignments: assignmentsQuery.data?.taskIds ?? [], currentSession, timeline: timelineQuery.data ?? [], loading: dashboardQuery.isPending || tasksQuery.isPending, queryError: queryErrorValue instanceof Error ? queryErrorValue.message : null, timer, refresh };

  return <WritingReflectionFeature
    key={`${session.user.id}:${date}:${dashboard ? "ready" : "loading"}`}
    request={request}
    selectedDate={date}
    initialSnapshot={{ morning: dashboard?.morningWritingRecord ?? null, journal: dashboard?.journalRecord ?? null, review: dashboard?.stockReviewRecord ?? null, insights: dashboard?.aiInsights ?? [] }}
    disabled={!dashboard}
    onError={feedback.notice}
    onChanged={refresh}
  >
    <TasksFeature
      request={request}
      selectedDate={date}
      loading={appContext.loading}
      tasks={tasks}
      categories={dashboard?.categories ?? []}
      schedules={dashboard?.schedules ?? []}
      dailyTaskIds={appContext.assignments}
      runningTimers={runningTimers}
      taskRewardEvents={dashboard?.taskRewardEvents ?? []}
      onError={feedback.notice}
      onConfirm={feedback.confirm}
      onChanged={refresh}
      onReward={(task, reward) => feedback.taskReward(task, reward ? [reward] : [])}
      onStartTimer={(taskId) => { const task = tasks.find((item) => item.id === taskId); if (task) void timer.start(task, appContext.assignments.includes(taskId)); }}
      onPauseTimer={() => { if (currentSession) void (currentSession.status === 0 ? timer.pause(currentSession) : timer.resume(currentSession)); }}
      onFinishTimer={() => { if (currentSession) void timer.finish(currentSession); }}
    >
      <AppShell context={appContext} />
    </TasksFeature>
  </WritingReflectionFeature>;
}

function AppShell({ context }: { context: WorkspaceContext }) {
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const title = routeTitle(location.pathname);
  useEffect(() => { document.title = `${title} · Personal Workbench`; mainRef.current?.focus(); }, [location.pathname, title]);
  const link = (path: string) => `${path}?date=${context.date}`;
  const timerTitle = context.tasks.find((task) => task.id === context.currentSession?.taskId)?.title ?? "当前任务";
  return <div className="app-shell">
    <aside className="app-sidebar">
      <Link className="app-brand" to={link("/today")}><span>PW</span><strong>Personal Workbench</strong></Link>
      <nav aria-label="主导航">
        <ShellLink to={link("/today")} icon={<Home size={17} />}>今日</ShellLink>
        <ShellLink to={link("/tasks")} icon={<CheckSquare2 size={17} />}>任务</ShellLink>
        <ShellLink to={link("/calendar")} icon={<CalendarDays size={17} />}>日历</ShellLink>
        <ShellLink to={link("/journal")} icon={<NotebookPen size={17} />}>文字</ShellLink>
        <ShellLink to={link("/insights")} icon={<BarChart3 size={17} />}>回看</ShellLink>
        <ShellLink to={link("/rewards")} icon={<Gift size={17} />}>奖励</ShellLink>
        <ShellLink to={link("/tools")} icon={<Wrench size={17} />}>工具</ShellLink>
      </nav>
      <NavLink className="shell-settings" to={link("/settings")}><Settings size={17} /><span>设置</span></NavLink>
    </aside>
    <div className="app-stage">
      <header className="app-topbar">
        <div><p className="route-eyebrow">{context.date}</p><h2>{title}</h2></div>
        <div className="app-top-actions">
          <WritingReflectionShortcuts />
          <input aria-label="工作日期" type="date" value={context.date} onChange={(event) => navigate(`${location.pathname}?date=${event.target.value}`)} />
          <button type="button" className="quick-action" onClick={() => navigate(link("/tasks"))}><Plus size={16} />新动作</button>
        </div>
      </header>
      {context.currentSession ? <MiniTimer session={context.currentSession} taskTitle={timerTitle} date={context.date} commands={context.timer} /> : null}
      {context.queryError ? <p className="query-error" role="alert">同步失败，正在显示可保留的旧快照：{context.queryError}</p> : null}
      <main ref={mainRef} tabIndex={-1} className="app-content"><Outlet context={context} /></main>
      <nav className="mobile-nav" aria-label="移动端主导航"><ShellLink to={link("/today")} icon={<Home size={18} />}>今日</ShellLink><ShellLink to={link("/tasks")} icon={<CheckSquare2 size={18} />}>任务</ShellLink><ShellLink to={link("/calendar")} icon={<CalendarDays size={18} />}>日历</ShellLink><ShellLink to={link("/journal")} icon={<NotebookPen size={18} />}>文字</ShellLink><ShellLink to={link("/settings")} icon={<Settings size={18} />}>设置</ShellLink></nav>
    </div>
  </div>;
}

function TodayRoute() {
  const value = useWorkspace();
  const dashboard = value.dashboard;
  const sleep = dashboard?.sleepRecord ?? null;
  const timelineItems = useMemo(() => {
    const sleepItems = sleep ? [sleepTimelineItem(sleep)] : [];
    return [...(dashboard?.schedules ?? []), ...sleepItems, ...waterTimelineItems(dashboard?.waterRecord ?? null)].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [dashboard?.schedules, dashboard?.waterRecord, sleep]);
  return <section className="today-boundary">
    {value.currentSession ? <p className="route-state route-state-active">当前 Session 由全局查询恢复，跨页面保持一致。</p> : null}
    <div className="today-grid">
      <CalendarFeature request={value.request} selectedDate={value.date} loading={value.loading} items={timelineItems} tasks={value.tasks} categories={dashboard?.categories ?? []} onError={value.feedback.notice} onChanged={value.refresh} />
      <TasksPanel />
      <div className="today-side">
        <TimelineSummary items={value.timeline} />
        <SleepFeature request={value.request} selectedDate={value.date} record={sleep} snapshotReady={Boolean(dashboard)} onError={value.feedback.notice} onChanged={value.refresh} />
        <WaterFeature request={value.request} selectedDate={value.date} record={dashboard?.waterRecord ?? null} sleep={sleep} onError={value.feedback.notice} onChanged={value.refresh} />
        <CategoriesFeature request={value.request} categories={dashboard?.categories ?? []} onError={value.feedback.notice} onConfirm={value.feedback.confirm} onChanged={value.refresh} />
      </div>
    </div>
  </section>;
}

function TasksRoute() { const value = useWorkspace(); return <TasksIntegrationPage tasks={value.tasks} date={value.date} loading={value.loading} />; }
function TaskRoute() {
  const value = useWorkspace();
  const id = Number(useParams().taskId);
  const taskQuery = useTask(value.request, value.session.user.id, id);
  return <TaskDetailPage task={taskQuery.data} assigned={value.assignments.includes(id)} active={value.currentSession?.taskId === id} date={value.date} pending={value.timer.pending !== null} onStart={(task, assigned) => void value.timer.start(task, assigned)} onCompleteAndFinish={value.currentSession?.taskId === id ? (task) => void value.timer.completeAndFinish(value.currentSession!, task.version) : undefined} />;
}
function CalendarRoute() { const value = useWorkspace(); return <CalendarFeature request={value.request} selectedDate={value.date} loading={value.loading} items={value.dashboard?.schedules ?? []} tasks={value.tasks} categories={value.dashboard?.categories ?? []} onError={value.feedback.notice} onChanged={value.refresh} />; }
function JournalRoute() { const value = useWorkspace(); return <section className="journal-route"><WritingReflectionHistory loading={value.loading} /></section>; }
function RewardsRoute() { const value = useWorkspace(); return <RewardsFeature request={value.request} initialGrowth={value.dashboard?.growth ?? null} initialEvents={value.dashboard?.rewardEvents ?? []} onError={value.feedback.notice} onGrowthChanged={value.refresh} />; }
function ToolsRoute() { const value = useWorkspace(); return <section className="route-panel"><div className="route-panel-heading"><div><p className="route-eyebrow">既有能力</p><h1>决策工具</h1></div><Sparkles size={18} /></div><DecisionToolsFeature request={value.request} selectedDate={value.date} onError={value.feedback.notice} onChanged={value.refresh} onReward={value.feedback.recordReward} /></section>; }
function InsightsRoute() { const value = useWorkspace(); const navigate = useNavigate(); const d = value.dashboard; return <HistoryFeature request={value.request} selectedDate={value.date} refreshRevision={0} loading={value.loading} stats={d?.weeklyStats} sleep={d?.sleepRecord ?? null} categories={d?.categoryTotals ?? d?.categories ?? []} schedules={d?.schedules ?? []} weeklySeries={d?.weeklySeries ?? []} monthlySleepSeries={d?.monthlySleepSeries ?? []} onError={value.feedback.notice} onBack={() => navigate(`/today?date=${value.date}`)} />; }
function SettingsRoute() { const { session } = useWorkspace(); return <section className="route-panel"><p className="route-eyebrow">账户与会话</p><h1>设置</h1><dl className="task-facts"><div><dt>显示名</dt><dd>{session.user.displayName}</dd></div><div><dt>账号</dt><dd>{session.user.username}</dd></div><div><dt>时区</dt><dd>{session.user.timezone}</dd></div></dl><button type="button" className="inline-command" onClick={session.logout}>退出登录</button></section>; }
function NotFoundRoute() { const { date } = useWorkspace(); return <section className="route-panel"><h1>页面不存在</h1><Link to={`/today?date=${date}`}>返回今日</Link></section>; }

function TimelineSummary({ items }: { items: TimelineViewItem[] }) { return <section className="glass-panel p-3"><h2 className="section-title">ActualTime 读取模型</h2><div className="timeline-summary">{(["PLANNED", "TIMER_ACTUAL", "MANUAL_ACTUAL", "LEGACY_ACTUAL"] as const).map((kind) => <span key={kind}><strong>{items.filter((item) => item.kind === kind).length}</strong>{kind.replace("_", " ")}</span>)}</div></section>; }
function ShellLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) { return <NavLink className={({ isActive }) => `shell-link ${isActive ? "is-active" : ""}`} to={to}>{icon}<span>{children}</span></NavLink>; }
function useWorkspace() { return useOutletContext<WorkspaceContext>(); }
function routeTitle(path: string) { if (path.startsWith("/tasks/")) return "任务详情"; return ({ "/today": "今日", "/tasks": "任务", "/calendar": "日历", "/journal": "文字", "/writing": "文字", "/rewards": "奖励", "/tools": "工具", "/insights": "回看", "/settings": "设置" } as Record<string, string>)[path] ?? "工作台"; }
function validDate(value: string | null): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function todayString() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
function sleepTimelineItem(sleep: SleepRecord): TimelineItem { return { id: -20001 - sleep.id, taskId: null, categoryId: null, startTime: timeText(sleep.sleepStart), endTime: timeText(sleep.wakeTime), title: "睡眠", note: sleep.qualityScore ? `质量 ${sleep.qualityScore}/5` : "睡眠记录", kind: 1, source: 0, color: "#7EC8E3", marker: "sleep" }; }
function timeText(value?: string) { if (!value) return "00:00:00"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(0, 8) : date.toTimeString().slice(0, 8); }
