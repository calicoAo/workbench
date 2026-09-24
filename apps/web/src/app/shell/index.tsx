import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, BarChart3, CalendarDays, CheckSquare2, ChevronLeft, CircleDollarSign, Droplets, Ellipsis, FolderKanban, Gift, Home, Moon, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, ShieldCheck, Sparkles, Square, Wrench } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import type { Request } from "../api";
import type { FeedbackActions } from "../feedback";
import { queryKeys } from "../query";
import { CalendarFeature, type Schedule, type TimelineItem } from "../../features/calendar";
import { CategoriesFeature, type Category } from "../../features/categories";
import { DecisionToolsFeature } from "../../features/decision-tools";
import { ArchiveBrowser, HistoryFeature, type SleepSeriesItem, type WeeklySeriesItem } from "../../features/history";
import { QuickNoteCaptureButton, QuickNoteDetailPage, QuickNotesPage } from "../../features/quick-notes";
import { RewardsFeature, type Growth, type RewardEvent } from "../../features/rewards";
import { SleepFeature, type SleepRecord } from "../../features/sleep";
import { BountyBoard, TaskDetailPage, TasksFeature, TasksPanel, type TaskSnapshot, useTask, useTasks, useTaskSurfaces } from "../../features/tasks";
import { CurrentFocusCard, FinishSessionButton, MiniTimer, type CurrentSession, useCurrentSession, useTimerCommands } from "../../features/timer";
import { useTimeline, type ExecutionSummary, type TimelineViewItem } from "../../features/timeline";
import { recordWaterCups, WaterFeature, type WaterRecord, waterTimelineItems } from "../../features/water";
import { type AiInsight, type JournalRecord, type MorningWritingRecord, type StockReviewRecord, useJournalDraftBridge, useWritingInspirationBridge, WritingQuickActions, WritingReflectionFeature, WritingReflectionHistory, WritingReflectionShortcuts } from "../../features/writing-reflection";
import { ContinuationPanel, type Assignment, type ContinuationCandidate, useAssignments, useContinuationCandidates } from "../../features/assignments";
import { SearchFeature } from "../../features/search";
import { SettingsFeature, type SettingsSnapshot, useSettings } from "../../features/settings";
import { ProjectDetailPage, ProjectsPage, type ProjectSummary, useProjects } from "../../features/projects";
import { TrashPage } from "../../features/trash";
import { HabitTodaySnapshot, RoutinesFeature } from "../../features/habits";
import { FinancePage } from "../../features/finance";
import type { AuthSession } from "../../features/auth";
import { GrowthPage, TodayGrowthEntry } from "../../features/growth";
import { InspirationLibraryPage, InspirationWritingPanel } from "../../features/inspirations";

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
  assignmentRows: Assignment[];
  continuations: ContinuationCandidate[];
  currentSession: CurrentSession | null;
  timeline: TimelineViewItem[];
  summary: ExecutionSummary | null;
  loading: boolean;
  queryError: string | null;
  timer: ReturnType<typeof useTimerCommands>;
  settings: SettingsSnapshot | null;
  projects: ProjectSummary[];
  refresh: () => Promise<void>;
};

export function WorkspaceRouter({ request, session, feedback }: { request: Request; session: AuthSession; feedback: FeedbackActions }) {
  return <Routes>
    <Route path="/" element={<Navigate replace to={`/today?date=${todayString()}`} />} />
    <Route element={<WorkspaceRoot request={request} session={session} feedback={feedback} />}>
      <Route path="/today" element={<TodayRoute />} />
      <Route path="/tasks" element={<TasksRoute />} />
      <Route path="/tasks/:taskId" element={<TaskRoute />} />
      <Route path="/projects" element={<ProjectsRoute />} />
      <Route path="/projects/:projectId" element={<ProjectRoute />} />
      <Route path="/calendar" element={<CalendarRoute />} />
      <Route path="/journal" element={<JournalRoute />} />
      <Route path="/journal/:date" element={<JournalDateRoute />} />
      <Route path="/writing" element={<JournalRoute />} />
      <Route path="/notes" element={<NotesRoute />} />
      <Route path="/notes/:noteId" element={<NoteDetailRoute />} />
      <Route path="/inspirations" element={<InspirationsRoute />} />
      <Route path="/routines" element={<RoutinesRoute />} />
      <Route path="/finance" element={<FinanceRoute />} />
      <Route path="/rewards" element={<RewardsRoute />} />
      <Route path="/growth" element={<GrowthRoute />} />
      <Route path="/tools" element={<ToolsRoute />} />
      <Route path="/insights" element={<InsightsRoute />} />
      <Route path="/search" element={<SearchRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="/settings/trash" element={<TrashRoute />} />
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
    if (date !== todayString()) { setPreparedDate(date); return; }
    if (searchParams.get("date") === date) return;
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("date", date); return next; }, { replace: true });
  }, [date, searchParams, setSearchParams]);
  useEffect(() => {
    let current = true;
    if (date !== todayString()) { setPreparedDate(date); return () => { current = false; }; }
    setPreparedDate(null);
    void request("/api/daily-carryovers", { method: "POST", body: JSON.stringify({ targetDate: date }) })
      .then(() => { if (current) setPreparedDate(date); })
      .catch((error) => feedback.notice(error instanceof Error ? error.message : "日期准备失败", "日期准备没有成功"));
    return () => { current = false; };
  }, [date, feedback.notice, request]);

  const dashboardQuery = useQuery({ queryKey: queryKeys.today(session.user.id, date), enabled: preparedDate === date, queryFn: () => request<Dashboard>(`/api/dashboard?date=${date}`) });
  const tasksQuery = useTasks(request, session.user.id);
  const assignmentsQuery = useAssignments(request, session.user.id, date);
  const continuationQuery = useContinuationCandidates(request, session.user.id, date);
  const currentQuery = useCurrentSession(request, session.user.id);
  const settingsQuery = useSettings(request, session.user.id);
  const projectsQuery = useProjects(request, session.user.id);
  const dashboard = dashboardQuery.data?.date === date ? dashboardQuery.data : null;
  const tasks = tasksQuery.data ?? [];
  const currentSession = currentQuery.data ?? null;
  const timer = useTimerCommands({ request, userId: session.user.id, selectedDate: date, executionDate: todayString(), timezone: session.user.timezone, onError: feedback.notice });
  const timelineQuery = useTimeline(request, session.user.id, date, session.user.timezone, dashboard?.schedules ?? [], Boolean(dashboard));
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.today(session.user.id, date) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(session.user.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments(session.user.id, date) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(session.user.id, date) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.currentSession(session.user.id) }),
      queryClient.invalidateQueries({ queryKey: ["projects", session.user.id] }),
      queryClient.invalidateQueries({ queryKey: ["project", session.user.id] })
    ]);
  };
  const runningTimers = currentSession ? [currentSession] : [];
  const showRewardUi = settingsQuery.data?.rewards?.show !== false;
  const queryErrorValue = dashboardQuery.error ?? tasksQuery.error ?? assignmentsQuery.error ?? currentQuery.error ?? timelineQuery.error ?? projectsQuery.error;
  useEffect(() => { document.documentElement.dataset.reducedMotion = settingsQuery.data?.appearance?.reducedMotion ? "true" : "false"; }, [settingsQuery.data?.appearance?.reducedMotion]);
  const appContext: WorkspaceContext = { request, session, feedback, date, dashboard, tasks, assignments: assignmentsQuery.data?.taskIds ?? [], assignmentRows: assignmentsQuery.data?.assignments ?? [], continuations: continuationQuery.data ?? [], currentSession, timeline: timelineQuery.data?.items ?? [], summary: timelineQuery.data?.summary ?? null, loading: dashboardQuery.isPending || tasksQuery.isPending, queryError: queryErrorValue instanceof Error ? queryErrorValue.message : null, timer, settings: settingsQuery.data ?? null, projects: projectsQuery.data ?? [], refresh };

  return <WritingReflectionFeature
    key={`${session.user.id}:${date}:${dashboard ? "ready" : "loading"}`}
    request={request}
    userId={session.user.id}
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
      projects={appContext.projects}
      schedules={dashboard?.schedules ?? []}
      dailyTaskIds={appContext.assignments}
      focusTaskIds={appContext.assignmentRows.filter((item) => item.focusRank !== null).sort((a, b) => (a.focusRank ?? 9) - (b.focusRank ?? 9)).map((item) => item.taskId)}
      timezone={session.user.timezone}
      runningTimers={runningTimers}
      taskRewardEvents={showRewardUi ? dashboard?.taskRewardEvents ?? [] : []}
      onError={feedback.notice}
      onConfirm={feedback.confirm}
      onChanged={refresh}
      onReward={showRewardUi ? (task, reward) => feedback.taskReward(task, reward ? [reward] : []) : () => undefined}
      onStartTimer={(taskId) => { const task = tasks.find((item) => item.id === taskId); if (task) void timer.start(task, appContext.assignments.includes(taskId)); }}
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
  useEffect(() => { document.title = `${title} · Personal Workbench`; mainRef.current?.focus({ preventScroll: true }); }, [location.pathname, title]);
  const link = (path: string) => `${path}?date=${context.date}`;
  const timerTitle = context.tasks.find((task) => task.id === context.currentSession?.taskId)?.title ?? "当前任务";
  const timerTaskVersion = context.tasks.find((task) => task.id === context.currentSession?.taskId)?.version ?? 1;
  const taskSurfaces = useTaskSurfaces();
  const quickMenuRef = useRef<HTMLDivElement>(null);
  const quickLocationRef = useRef(`${location.pathname}${location.search}`);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickMoreOpen, setQuickMoreOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("personal-workbench:sidebar-collapsed") === "true");
  const enabledWritingSlots = (context.settings?.writingSlots ?? []).filter((slot) => slot.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((slot) => slot.slotKey);
  const quickPrimaryWritingSlots = enabledWritingSlots.slice(0, 1);
  const quickSecondaryWritingSlots = enabledWritingSlots.slice(1);
  function closeQuickMenu() { setQuickOpen(false); setQuickMoreOpen(false); }
  useEffect(() => {
    const nextLocation = `${location.pathname}${location.search}`;
    if (quickLocationRef.current !== nextLocation) closeQuickMenu();
    quickLocationRef.current = nextLocation;
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!quickOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!quickMenuRef.current?.contains(event.target as Node)) closeQuickMenu(); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeQuickMenu(); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [quickOpen]);
  function toggleSidebar() { setSidebarCollapsed((current) => { localStorage.setItem("personal-workbench:sidebar-collapsed", String(!current)); return !current; }); }
  async function addWater() { closeQuickMenu(); try { await recordWaterCups(context.request, context.date, (context.dashboard?.waterRecord?.cups ?? 0) + 1); await context.refresh(); } catch (error) { context.feedback.notice(error instanceof Error ? error.message : "喝水记录失败"); } }
  return <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className="app-sidebar">
      <Link className="app-brand" to={link("/today")}><span>PW</span><strong>Personal Workbench</strong></Link>
      <button className="sidebar-toggle" type="button" title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /><span>收起</span></>}</button>
      <nav aria-label="主导航">
        <ShellLink to={link("/today")} icon={<Home size={17} />}>今日</ShellLink>
        <ShellLink to={link("/tasks")} icon={<CheckSquare2 size={17} />}>任务</ShellLink>
        <ShellLink to={link("/projects")} icon={<FolderKanban size={17} />}>项目</ShellLink>
        <ShellLink to={link("/calendar")} icon={<CalendarDays size={17} />}>日历</ShellLink>
        <ShellLink to={link("/journal")} icon={<NotebookPen size={17} />}>文字</ShellLink>
        <ShellLink to={link("/routines")} icon={<Activity size={17} />}>生活</ShellLink>
        <ShellLink to={link("/finance")} icon={<CircleDollarSign size={17} />}>财务</ShellLink>
        <ShellLink to={link("/insights")} icon={<BarChart3 size={17} />}>回看</ShellLink>
        <ShellLink to={link("/growth")} icon={<ShieldCheck size={17} />}>成长</ShellLink>
        {context.settings?.rewards?.show !== false ? <ShellLink to={link("/rewards")} icon={<Gift size={17} />}>奖励</ShellLink> : null}
        <ShellLink to={link("/tools")} icon={<Wrench size={17} />}>工具</ShellLink>
      </nav>
      <NavLink className="shell-settings" to={link("/settings")}><Settings size={17} /><span>设置</span></NavLink>
    </aside>
    <div className="app-stage">
      <header className="app-topbar">
        <div><p className="route-eyebrow">{context.date}</p><h2>{title}</h2></div>
        <div className="app-top-actions">
          <WritingReflectionShortcuts enabledSlots={enabledWritingSlots} />
          <Link className="topbar-projects" aria-label="项目" title="项目" to={link("/projects")}><FolderKanban size={17} /></Link>
          <Link className="topbar-search" aria-label="全局搜索" title="全局搜索" to={link("/search")}><Search size={17} /></Link>
          <input aria-label="工作日期" type="date" value={context.date} onChange={(event) => navigate(`${location.pathname}?date=${event.target.value}`)} />
        </div>
      </header>
      <div className={`quick-add-wrap ${location.pathname.startsWith("/settings") ? "is-mobile-hidden" : ""}`} ref={quickMenuRef}>
        <button type="button" className="quick-action" aria-controls="quick-add-menu" aria-expanded={quickOpen} aria-label="打开快捷操作" onClick={() => { setQuickOpen((value) => !value); setQuickMoreOpen(false); }}><Plus size={16} /><span>Quick Action</span></button>
        {quickOpen ? <div className={`quick-add-menu ${quickMoreOpen ? "is-more-open" : ""}`} id="quick-add-menu" role="menu">
          <strong>{quickMoreOpen ? "更多操作" : "快捷操作"}</strong>
          <div className="quick-add-primary">
            <button onClick={() => { closeQuickMenu(); taskSurfaces.openCreate(); }}><CheckSquare2 size={17} /><span>发布悬赏</span></button>
            <QuickNoteCaptureButton compact label="随手记" request={context.request} userId={context.session.user.id} selectedDate={context.date} onOpen={closeQuickMenu} onCreated={context.refresh} />
            <button onClick={() => { closeQuickMenu(); navigate(`/finance?date=${context.date}&action=expense&nonce=${crypto.randomUUID()}`); }}><ArrowDownCircle size={17} /><span>记一笔支出</span></button>
            <button onClick={() => void addWater()}><Droplets size={17} /><span>喝水</span></button>
            <WritingQuickActions enabledSlots={quickPrimaryWritingSlots} showIcons onSelect={closeQuickMenu} />
            <button className="quick-add-more" aria-expanded={quickMoreOpen} onClick={() => setQuickMoreOpen(true)}><Ellipsis size={17} /><span>更多…</span></button>
          </div>
          <div className="quick-add-secondary">
            <button className="quick-add-back" onClick={() => setQuickMoreOpen(false)}><ChevronLeft size={17} /><span>返回</span></button>
            <WritingQuickActions enabledSlots={quickSecondaryWritingSlots} showIcons onSelect={closeQuickMenu} />
            <button onClick={() => { closeQuickMenu(); navigate(`/calendar?date=${context.date}&add=plan&nonce=${crypto.randomUUID()}`); }}><CalendarDays size={17} /><span>安排计划</span></button>
            <button onClick={() => { closeQuickMenu(); navigate(`/calendar?date=${context.date}&add=actual&nonce=${crypto.randomUUID()}`); }}><Activity size={17} /><span>补录实际</span></button>
            <button onClick={() => { closeQuickMenu(); navigate(`/routines?date=${context.date}&view=life&action=sleep&nonce=${crypto.randomUUID()}`); }}><Moon size={17} /><span>记录睡眠</span></button>
            <button onClick={() => { closeQuickMenu(); navigate(`/finance?date=${context.date}&action=income&nonce=${crypto.randomUUID()}`); }}><ArrowUpCircle size={17} /><span>记一笔收入</span></button>
            <button onClick={() => { closeQuickMenu(); navigate(`/finance?date=${context.date}&action=transfer&nonce=${crypto.randomUUID()}`); }}><ArrowLeftRight size={17} /><span>转账</span></button>
          </div>
        </div> : null}
      </div>
      {context.currentSession && location.pathname !== "/today" ? <MiniTimer session={context.currentSession} taskTitle={timerTitle} taskVersion={timerTaskVersion} date={context.date} commands={context.timer} /> : null}
      {context.queryError ? <p className="query-error" role="alert">同步失败，正在显示可保留的旧快照：{context.queryError}</p> : null}
      <main ref={mainRef} tabIndex={-1} className="app-content"><Outlet context={context} /></main>
      <nav className="mobile-nav" aria-label="移动端主导航"><ShellLink to={link("/today")} icon={<Home size={18} />}>今日</ShellLink><ShellLink to={link("/tasks")} icon={<CheckSquare2 size={18} />}>任务</ShellLink><ShellLink to={link("/calendar")} icon={<CalendarDays size={18} />}>日历</ShellLink><ShellLink to={link("/journal")} icon={<NotebookPen size={18} />}>文字</ShellLink><ShellLink to={link("/settings")} icon={<Settings size={18} />}>设置</ShellLink></nav>
    </div>
  </div>;
}

function TodayRoute() {
  const value = useWorkspace();
  const [continuationPending, setContinuationPending] = useState(false);
  const dashboard = value.dashboard;
  const sleep = dashboard?.sleepRecord ?? null;
  const [sleepEditorSignal, setSleepEditorSignal] = useState(0);
  const enabledWritingSlots = (value.settings?.writingSlots ?? []).filter((slot) => slot.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((slot) => slot.slotKey);
  const timelineItems = useMemo(() => {
    const sleepItems = sleep ? [sleepTimelineItem(sleep)] : [];
    return [...(dashboard?.schedules ?? []), ...sleepItems, ...waterTimelineItems(dashboard?.waterRecord ?? null)].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [dashboard?.schedules, dashboard?.waterRecord, sleep]);
  return <section className="today-boundary">
    {value.date !== todayString() ? <div className="historical-banner"><strong>查看 {formatBusinessDate(value.date)}</strong><span>当前计时仍属于真实今天；从历史页开始会接取到今天并启动。</span><Link to={`/today?date=${todayString()}`}>回到今天</Link></div> : null}
    <CurrentFocusCard session={value.currentSession} taskTitle={value.tasks.find((item) => item.id === value.currentSession?.taskId)?.title} taskVersion={value.tasks.find((item) => item.id === value.currentSession?.taskId)?.version} commands={value.timer} />
    <ContinuationPanel candidates={value.continuations} targetDate={value.date} timezone={value.session.user.timezone} request={value.request} pending={continuationPending} onPending={setContinuationPending} onError={value.feedback.notice} onChanged={value.refresh} />
    <div className="today-grid">
      <div className="today-main"><TasksPanel /></div>
      <aside className="today-utility" aria-label="今日工具栏">
        <WaterFeature request={value.request} selectedDate={value.date} record={dashboard?.waterRecord ?? null} sleep={sleep} onError={value.feedback.notice} onChanged={value.refresh} />
        <SleepFeature request={value.request} selectedDate={value.date} record={sleep} snapshotReady={Boolean(dashboard)} recordTimezone={value.session.user.timezone} openEditorSignal={sleepEditorSignal} onError={value.feedback.notice} onChanged={value.refresh} />
        <section className="review-handoff utility-capture"><QuickNoteCaptureButton compact label="随手记" request={value.request} userId={value.session.user.id} selectedDate={value.date} onCreated={value.refresh} /><div className="writing-utility-actions"><WritingQuickActions enabledSlots={enabledWritingSlots} /></div></section>
        <HabitTodaySnapshot request={value.request} userId={value.session.user.id} date={value.date} />
        <TodayGrowthEntry request={value.request} userId={value.session.user.id} date={value.date} />
        <CalendarFeature request={value.request} selectedDate={value.date} loading={value.loading} items={timelineItems} tasks={value.tasks} acceptedTaskIds={value.assignments} categories={dashboard?.categories ?? []} projects={value.projects} actualSeconds={value.summary?.actualSeconds} onEditSleep={() => setSleepEditorSignal((value) => value + 1)} onError={value.feedback.notice} onChanged={value.refresh} />
        <TimelineSummary items={value.timeline} summary={value.summary} />
      </aside>
    </div>
  </section>;
}

function TasksRoute() {
  const value = useWorkspace();
  const surfaces = useTaskSurfaces();
  return <BountyBoard tasks={value.tasks} categories={value.dashboard?.categories ?? []} acceptedIds={value.assignments} activeTaskId={value.currentSession?.taskId ?? null} date={value.date} loading={value.loading} pending={value.timer.pending !== null} onCreate={surfaces.openCreate} onAccept={surfaces.openSelector} onStart={(task, accepted) => void value.timer.start(task, accepted)} onEdit={surfaces.openEditor} onComplete={(task) => void surfaces.complete(task)} onArchive={surfaces.archive} />;
}
function TaskRoute() {
  const value = useWorkspace();
  const surfaces = useTaskSurfaces();
  const id = Number(useParams().taskId);
  const taskQuery = useTask(value.request, value.session.user.id, id);
  const active = value.currentSession?.taskId === id;
  const categoryName = value.dashboard?.categories.find((item) => item.id === taskQuery.data?.task.categoryId)?.name;
  return <TaskDetailPage detail={taskQuery.data} assigned={value.assignments.includes(id)} active={active} paused={active && value.currentSession?.status === 1} date={value.date} pending={value.timer.pending !== null} categoryName={categoryName} onAccept={surfaces.openSelector} onStart={(task, assigned) => void value.timer.start(task, assigned)} onPauseResume={active ? () => void (value.currentSession!.status === 0 ? value.timer.pause(value.currentSession!) : value.timer.resume(value.currentSession!)) : undefined} finishAction={active && value.currentSession && taskQuery.data ? <FinishSessionButton session={value.currentSession} taskVersion={taskQuery.data.task.version} commands={value.timer}><Square size={15} />结束本次</FinishSessionButton> : undefined} onComplete={(task) => void surfaces.complete(task)} onCompleteAndFinish={active ? (task) => void value.timer.completeAndFinish(value.currentSession!, task.version) : undefined} onEdit={surfaces.openEditor} onArchive={surfaces.archive} />;
}
function ProjectsRoute() { const value = useWorkspace(); return <ProjectsPage request={value.request} userId={value.session.user.id} onError={value.feedback.notice} />; }
function ProjectRoute() { const value = useWorkspace(); const surfaces = useTaskSurfaces(); const projectId = Number(useParams().projectId); return <ProjectDetailPage request={value.request} userId={value.session.user.id} projectId={projectId} onError={value.feedback.notice} onCreateTask={surfaces.openCreate} onEditTask={surfaces.openEditor} />; }
function CalendarRoute() {
  const value = useWorkspace();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"day" | "week">("day");
  const range = weekRange(value.date);
  const weekQuery = useQuery({ queryKey: ["calendar-week", value.session.user.id, range.from, range.to], enabled: mode === "week", queryFn: () => value.request<{ schedules: Schedule[] }>(`/api/schedules?from=${range.from}&to=${range.to}&timezone=${encodeURIComponent(value.session.user.timezone)}`) });
  const weekItems = (weekQuery.data?.schedules ?? []).map((item) => ({ ...item, color: item.color ?? "#35C99A" }));
  return <section className="calendar-route"><header className="calendar-route-head"><div><p className="route-eyebrow">计划与真实投入</p><h1>日历</h1></div><div className="segmented-control"><button className={mode === "day" ? "is-active" : ""} onClick={() => setMode("day")}>日</button><button className={mode === "week" ? "is-active" : ""} onClick={() => setMode("week")}>周</button></div></header>{mode === "day" ? <CalendarFeature key={`${value.date}:${params.get("add") ?? "view"}:${params.get("nonce") ?? ""}`} request={value.request} selectedDate={value.date} loading={value.loading} items={value.dashboard?.schedules ?? []} tasks={value.tasks} acceptedTaskIds={value.assignments} categories={value.dashboard?.categories ?? []} projects={value.projects} recordTimezone={value.session.user.timezone} actualSeconds={value.summary?.actualSeconds} initialKind={params.get("add") === "plan" ? "plan" : params.get("add") === "actual" ? "actual" : undefined} onError={value.feedback.notice} onChanged={value.refresh} /> : <WeekCalendar from={range.from} items={weekItems} loading={weekQuery.isPending} date={value.date} />}</section>;
}
function JournalRoute() { const value = useWorkspace(); const bridge = useWritingInspirationBridge(); const enabledWritingSlots = (value.settings?.writingSlots ?? []).filter((slot) => slot.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((slot) => slot.slotKey); return <section className="journal-route"><header className="journal-route-head"><div><p className="route-eyebrow">日记与复盘</p><h1>文字记录</h1><p>晨写、日记与复盘仍按所选日期独立保存。</p></div><QuickNoteCaptureButton compact label="随手记" request={value.request} userId={value.session.user.id} selectedDate={value.date} onCreated={value.refresh} /></header><nav className="journal-subnav" aria-label="文字记录导航"><Link className="is-active" to={`/journal?date=${value.date}`}>今日书写</Link><Link to={`/notes?date=${value.date}`}>随手记</Link><Link to={`/inspirations?date=${value.date}`}>灵感库</Link><Link to={`/insights?date=${value.date}`}>归档与洞察</Link></nav><div className="writing-inspiration-dock"><InspirationWritingPanel request={value.request} userId={value.session.user.id} onInsert={bridge.insertIntoJournal} /></div><WritingReflectionHistory loading={value.loading} enabledSlots={enabledWritingSlots} /><section className="glass-panel p-3"><div className="mb-3"><p className="route-eyebrow">历史可达</p><h2 className="section-title">书写归档</h2></div><ArchiveBrowser request={value.request} refreshRevision={0} onError={value.feedback.notice} /></section></section>; }
function JournalDateRoute() { const date = useParams().date; return validDate(date ?? null) ? <Navigate replace to={`/journal?date=${date}`} /> : <NotFoundRoute />; }
function NotesRoute() { const value = useWorkspace(); return <QuickNotesPage request={value.request} userId={value.session.user.id} selectedDate={value.date} onCreated={value.refresh} />; }
function InspirationsRoute() { const value = useWorkspace(); return <InspirationLibraryPage request={value.request} userId={value.session.user.id} selectedDate={value.date} projects={value.projects} onError={value.feedback.notice} />; }
function NoteDetailRoute() { const value = useWorkspace(); const noteId = Number(useParams().noteId); const journal = useJournalDraftBridge(); return <QuickNoteDetailPage request={value.request} userId={value.session.user.id} noteId={noteId} selectedDate={value.date} recordTimezone={value.session.user.timezone} categories={value.dashboard?.categories ?? []} projects={value.projects} onQuoteToJournal={journal.stageJournalReference} />; }
function RoutinesRoute() { const value = useWorkspace(); const [params] = useSearchParams(); const sleep = value.dashboard?.sleepRecord ?? null; return <RoutinesFeature request={value.request} userId={value.session.user.id} date={value.date} timezone={value.session.user.timezone} categories={value.dashboard?.categories ?? []} onError={value.feedback.notice} lifeContent={<><SleepFeature request={value.request} selectedDate={value.date} record={sleep} recordTimezone={value.session.user.timezone} snapshotReady={Boolean(value.dashboard)} initiallyOpen={params.get("action") === "sleep"} onError={value.feedback.notice} onChanged={value.refresh} /><WaterFeature request={value.request} selectedDate={value.date} record={value.dashboard?.waterRecord ?? null} sleep={sleep} onError={value.feedback.notice} onChanged={value.refresh} /><section className="review-handoff"><div><p className="route-eyebrow">晨写</p><strong>{value.dashboard?.morningWritingRecord?.content?.trim() ? "今日正文已保存" : "今日尚未完成"}</strong></div><Link to={`/journal?date=${value.date}`}>打开晨写</Link></section></>} />; }
function FinanceRoute() { const value = useWorkspace(); const [params] = useSearchParams(); const action = params.get("action"); return <FinancePage key={params.get("nonce") ?? "finance"} request={value.request} userId={value.session.user.id} date={value.date} initialAction={action === "income" || action === "expense" || action === "transfer" ? action : undefined} onError={value.feedback.notice} />; }
function RewardsRoute() { const value = useWorkspace(); return value.settings?.rewards?.show === false ? <section className="route-panel"><h1>奖励展示已隐藏</h1><p>奖励仍会照常结算，可在设置中恢复展示。</p><Link to={`/settings?date=${value.date}`}>打开设置</Link></section> : <RewardsFeature request={value.request} initialGrowth={value.dashboard?.growth ?? null} initialEvents={value.dashboard?.rewardEvents ?? []} onError={value.feedback.notice} onGrowthChanged={value.refresh} />; }
function GrowthRoute() { const value = useWorkspace(); return <GrowthPage request={value.request} userId={value.session.user.id} date={value.date} onError={value.feedback.notice} />; }
function ToolsRoute() { const value = useWorkspace(); return <section className="route-panel"><div className="route-panel-heading"><div><p className="route-eyebrow">既有能力</p><h1>决策工具</h1></div><Sparkles size={18} /></div><DecisionToolsFeature request={value.request} selectedDate={value.date} onError={value.feedback.notice} onChanged={value.refresh} onReward={value.settings?.rewards?.show === false ? () => undefined : value.feedback.recordReward} /></section>; }
function InsightsRoute() { const value = useWorkspace(); const navigate = useNavigate(); const d = value.dashboard; return <HistoryFeature request={value.request} selectedDate={value.date} refreshRevision={0} loading={value.loading} stats={d?.weeklyStats} sleep={d?.sleepRecord ?? null} categories={d?.categoryTotals ?? d?.categories ?? []} schedules={d?.schedules ?? []} weeklySeries={d?.weeklySeries ?? []} monthlySleepSeries={d?.monthlySleepSeries ?? []} onError={value.feedback.notice} onBack={() => navigate(`/today?date=${value.date}`)} />; }
function SearchRoute() { const value = useWorkspace(); return <SearchFeature request={value.request} userId={value.session.user.id} />; }
function SettingsRoute() { const { session, request, feedback } = useWorkspace(); return <SettingsFeature request={request} userId={session.user.id} logout={session.logout} onProfileChanged={(profile) => session.updateUser?.(profile)} onError={feedback.notice} />; }
function TrashRoute() { const { session, request } = useWorkspace(); return <TrashPage request={request} userId={session.user.id} />; }
function NotFoundRoute() { const { date } = useWorkspace(); return <section className="route-panel"><h1>页面不存在</h1><Link to={`/today?date=${date}`}>返回今日</Link></section>; }

function TimelineSummary({ items, summary }: { items: TimelineViewItem[]; summary: ExecutionSummary | null }) { return <section className="glass-panel p-3"><h2 className="section-title">今日摘要</h2><div className="execution-summary"><span><strong>{summary?.completedAssignments ?? 0}/{summary?.totalAssignments ?? 0}</strong>今日完成</span><span><strong>{formatSeconds(summary?.focusedSeconds ?? 0)}</strong>专注</span><span><strong>{formatSeconds(summary?.actualSeconds ?? 0)}</strong>实际投入</span><span><strong>{formatSeconds(summary?.plannedSeconds ?? 0)}</strong>计划</span></div><div className="timeline-legend">{(["PLANNED", "TIMER_ACTUAL", "MANUAL_ACTUAL", "LEGACY_ACTUAL"] as const).map((kind) => <span key={kind}>{kindLabel(kind)} {items.filter((item) => item.kind === kind).length}</span>)}</div></section>; }
function ShellLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) { return <NavLink className={({ isActive }) => `shell-link ${isActive ? "is-active" : ""}`} title={typeof children === "string" ? children : undefined} to={to}>{icon}<span>{children}</span></NavLink>; }
function useWorkspace() { return useOutletContext<WorkspaceContext>(); }
function routeTitle(path: string) { if (path.startsWith("/tasks/")) return "任务详情"; if (path.startsWith("/projects/")) return "项目详情"; if (path.startsWith("/notes/")) return "随手记详情"; if (path.startsWith("/journal/")) return "文字"; if (path.startsWith("/settings/")) return "数据维护"; return ({ "/today": "今日", "/tasks": "任务", "/projects": "项目", "/calendar": "日历", "/journal": "文字", "/writing": "文字", "/notes": "随手记", "/inspirations": "灵感库", "/routines": "生活", "/finance": "财务", "/growth": "成长", "/rewards": "奖励", "/tools": "工具", "/insights": "回看", "/search": "搜索", "/settings": "设置" } as Record<string, string>)[path] ?? "工作台"; }
function validDate(value: string | null): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function todayString() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
function sleepTimelineItem(sleep: SleepRecord): TimelineItem { return { id: -20001 - sleep.id, taskId: null, categoryId: null, startTime: timeText(sleep.sleepStart), endTime: timeText(sleep.wakeTime), title: "睡眠", note: sleep.qualityScore ? `质量 ${sleep.qualityScore}/5` : "睡眠记录", kind: 1, source: 0, color: "#7EC8E3", marker: "sleep" }; }
function timeText(value?: string) { if (!value) return "00:00:00"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(0, 8) : date.toTimeString().slice(0, 8); }
function formatSeconds(seconds: number) { const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function kindLabel(kind: TimelineViewItem["kind"]) { return kind === "PLANNED" ? "计划" : kind === "TIMER_ACTUAL" ? "计时" : kind === "MANUAL_ACTUAL" ? "补录" : "历史实际"; }
function formatBusinessDate(value: string) { const date = new Date(`${value}T00:00:00`); return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date); }
function weekRange(date: string) { const current = new Date(`${date}T00:00:00Z`); const day = current.getUTCDay() || 7; current.setUTCDate(current.getUTCDate() - day + 1); const from = current.toISOString().slice(0, 10); current.setUTCDate(current.getUTCDate() + 6); return { from, to: current.toISOString().slice(0, 10) }; }
function WeekCalendar({ from, items, loading, date }: { from: string; items: Schedule[]; loading: boolean; date: string }) { const days = Array.from({ length: 7 }, (_, index) => { const value = new Date(`${from}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + index); return value.toISOString().slice(0, 10); }); return <div className="calendar-week-grid">{days.map((day) => <section className={day === date ? "is-selected" : ""} key={day}><header><strong>{formatBusinessDate(day)}</strong><Link to={`/calendar?date=${day}`}>打开日视图</Link></header>{loading ? <p>加载中...</p> : items.filter((item) => item.scheduleDate === day).map((item) => <article key={item.id} className={item.kind === 0 ? "is-plan" : "is-actual"}><span>{item.kind === 0 ? "计划" : item.source === 1 ? "计时" : item.actualTimeClass === 2 ? "历史实际" : "补录"}</span><strong>{item.startTime.slice(0, 5)} {item.title}</strong><small>{item.kind === 0 ? ["PENDING", "EXECUTED", "CANCELLED", "RESCHEDULED"][item.lifecycleState ?? 0] : "source-aware"}</small></article>)}</section>)}</div>; }
