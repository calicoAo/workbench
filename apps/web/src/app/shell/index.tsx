import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, BarChart3, CalendarDays, CheckSquare2, ChevronLeft, CircleDollarSign, Droplets, Ellipsis, FolderKanban, Gift, Home, Moon, NotebookPen, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, ShieldCheck, Sparkles, Square, Wrench } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import type { Request } from "../api";
import { APP_BRAND } from "../brand";
import { getActiveLocale, useI18n } from "../i18n";
import type { FeedbackActions } from "../feedback";
import { queryKeys } from "../query";
import { CalendarFeature, type Schedule, type TimelineItem } from "../../features/calendar";
import { CategoriesFeature, type Category } from "../../features/categories";
import { DecisionToolsFeature } from "../../features/decision-tools";
import { HistoryFeature, type SleepSeriesItem, type WeeklySeriesItem } from "../../features/history";
import { QuickNoteCaptureButton, QuickNoteDetailPage, QuickNotesPage } from "../../features/quick-notes";
import { RewardsFeature, type Growth, type RewardEvent } from "../../features/rewards";
import { SleepFeature, type SleepRecord } from "../../features/sleep";
import { BountyBoard, TaskDetailPage, TasksFeature, TasksPanel, type TaskSnapshot, useTask, useTasks, useTaskSurfaces } from "../../features/tasks";
import { CurrentFocusCard, FinishSessionButton, MiniTimer, type CurrentSession, useCurrentSession, useTimerCommands } from "../../features/timer";
import { useTimeline, type ExecutionSummary, type TimelineViewItem } from "../../features/timeline";
import { recordWaterCups, WaterFeature, type WaterRecord, waterTimelineItems } from "../../features/water";
import { type AiInsight, type JournalRecord, type MorningWritingRecord, type StockReviewRecord, useJournalDraftBridge, WritingQuickActions, WritingReflectionFeature, WritingReflectionHistory } from "../../features/writing-reflection";
import { ContinuationPanel, type Assignment, type ContinuationCandidate, useAssignments, useContinuationCandidates } from "../../features/assignments";
import { SearchFeature } from "../../features/search";
import { SettingsFeature, type SettingsSnapshot, useSettings } from "../../features/settings";
import { ProjectDetailPage, ProjectsPage, type ProjectSummary, useProjects } from "../../features/projects";
import { TrashPage } from "../../features/trash";
import { HabitTodaySnapshot, RoutinesFeature } from "../../features/habits";
import { FinancePage } from "../../features/finance";
import type { AuthSession } from "../../features/auth";
import { GrowthPage } from "../../features/growth";
import { InspirationLibraryPage } from "../../features/inspirations";
import { OnboardingFeature } from "../../features/onboarding";
import { defaultWritingTab, enabledWritingPlugins, pluginForTab, WritingArchivePage, WritingShell, type WritingPluginId } from "../../features/writing-shell";
import { tx } from "../i18n";

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

const DAILY_CARRYOVER_TIMEOUT_MS = 5_000;

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
      <Route path="/writing" element={<WritingLandingRoute />} />
      <Route path="/writing/archive" element={<WritingArchiveRoute />} />
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
  const { setLocale } = useI18n();
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
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DAILY_CARRYOVER_TIMEOUT_MS);
    void request("/api/daily-carryovers", {
      method: "POST",
      body: JSON.stringify({ targetDate: date }),
      signal: controller.signal
    })
      .catch((error) => {
        if (!current) return;
        feedback.notice(
          timedOut
            ? "日期准备超时，先加载今日数据"
            : error instanceof Error
              ? error.message
              : "日期准备失败",
          "日期准备没有成功"
        );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (current) setPreparedDate(date);
      });
    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [date, feedback.notice, request]);

  const dashboardQuery = useQuery({ queryKey: queryKeys.today(session.user.id, date), enabled: preparedDate === date, queryFn: () => request<Dashboard>(`/api/dashboard?date=${date}`) });
  const tasksQuery = useTasks(request, session.user.id);
  const assignmentsQuery = useAssignments(request, session.user.id, date);
  const continuationQuery = useContinuationCandidates(request, session.user.id, date);
  const currentQuery = useCurrentSession(request, session.user.id);
  const settingsQuery = useSettings(request, session.user.id);
  const projectsQuery = useProjects(request, session.user.id);
  useEffect(() => { if (settingsQuery.data?.appearance.locale) setLocale(settingsQuery.data.appearance.locale); }, [setLocale, settingsQuery.data?.appearance.locale]);
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
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = settingsQuery.data?.appearance?.reducedMotion ? "true" : "false";
    document.documentElement.dataset.fontScale = String(settingsQuery.data?.appearance?.fontScale ?? 100);
  }, [settingsQuery.data?.appearance?.fontScale, settingsQuery.data?.appearance?.reducedMotion]);
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
      <OnboardingFeature request={request} userId={session.user.id} tasks={tasks} assignments={appContext.assignments} currentSession={currentSession} hasActualTime={(appContext.summary?.actualSeconds ?? 0) > 0} onError={feedback.notice}>
        <AppShell context={appContext} />
      </OnboardingFeature>
    </TasksFeature>
  </WritingReflectionFeature>;
}

function AppShell({ context }: { context: WorkspaceContext }) {
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const title = routeTitle(location.pathname);
  useEffect(() => { document.title = `${tx(title)} · ${tx(APP_BRAND.name)}`; mainRef.current?.focus({ preventScroll: true }); }, [location.pathname, title]);
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
      <Link className="app-brand" to={link("/today")}><span aria-hidden="true">{APP_BRAND.icon}</span><strong>{tx(APP_BRAND.name)}</strong></Link>
      <button className="sidebar-toggle" type="button" title={sidebarCollapsed ? tx("展开侧栏") : tx("收起侧栏")} aria-label={sidebarCollapsed ? tx("展开侧栏") : tx("收起侧栏")} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
      <nav aria-label={tx("主导航")}>
        <ShellLink to={link("/today")} icon={<Home size={17} />}>{tx("今日")}</ShellLink>
        <ShellLink to={link("/tasks")} icon={<CheckSquare2 size={17} />}>{tx("任务")}</ShellLink>
        <ShellLink to={link("/projects")} icon={<FolderKanban size={17} />}>{tx("项目")}</ShellLink>
        <ShellLink to={link("/calendar")} icon={<CalendarDays size={17} />}>{tx("日历")}</ShellLink>
        <ShellLink to={link("/writing")} activePaths={["/writing", "/journal", "/notes", "/inspirations"]} icon={<NotebookPen size={17} />}>{tx("文字")}</ShellLink>
        <ShellLink to={link("/routines")} icon={<Activity size={17} />}>{tx("生活")}</ShellLink>
        <ShellLink to={link("/finance")} icon={<CircleDollarSign size={17} />}>{tx("财务")}</ShellLink>
        <ShellLink to={link("/insights")} icon={<BarChart3 size={17} />}>{tx("回看")}</ShellLink>
        <ShellLink to={link("/growth")} icon={<ShieldCheck size={17} />}>{tx("成长")}</ShellLink>
        {context.settings?.rewards?.show !== false ? <ShellLink to={link("/rewards")} icon={<Gift size={17} />}>{tx("奖励")}</ShellLink> : null}
        <ShellLink to={link("/tools")} icon={<Wrench size={17} />}>{tx("工具")}</ShellLink>
      </nav>
      <NavLink className="shell-settings" to={link("/settings")}><Settings size={17} /><span>{tx("设置")}</span></NavLink>
    </aside>
    <div className="app-stage">
      <header className="app-topbar">
        <div><p className="route-eyebrow">{context.date}</p><h2>{tx(title)}</h2></div>
        <div className="app-top-actions">
          <GrowthHeader growth={context.dashboard?.growth} date={context.date} />
          <Link className="topbar-projects" aria-label={tx("项目")} title={tx("项目")} to={link("/projects")}><FolderKanban size={17} /></Link>
          <Link className="topbar-search" aria-label={tx("全局搜索")} title={tx("全局搜索")} to={link("/search")}><Search size={17} /></Link>
          <input aria-label={tx("工作日期")} type="date" value={context.date} onChange={(event) => navigate(`${location.pathname}?date=${event.target.value}`)} />
        </div>
      </header>
      <div className={`quick-add-wrap ${location.pathname.startsWith("/settings") ? "is-mobile-hidden" : ""}`} ref={quickMenuRef}>
        <button data-guide-anchor="quick-action.task.publish.entry" type="button" className="quick-action" aria-controls="quick-add-menu" aria-expanded={quickOpen} aria-label={tx("打开快捷操作")} onClick={() => { setQuickOpen((value) => !value); setQuickMoreOpen(false); }}><Plus size={16} /><span>Quick Action</span></button>
        {quickOpen ? <div className={`quick-add-menu ${quickMoreOpen ? "is-more-open" : ""}`} id="quick-add-menu" role="menu">
          <strong>{quickMoreOpen ? tx("更多操作") : tx("快捷操作")}</strong>
          <div className="quick-add-primary">
            <button data-guide-anchor="quick-action.task.publish" onClick={() => { closeQuickMenu(); taskSurfaces.openCreate(); }}><CheckSquare2 size={17} /><span>{tx("发布悬赏")}</span></button>
            <QuickNoteCaptureButton compact label={tx("随手记")} request={context.request} userId={context.session.user.id} selectedDate={context.date} onOpen={closeQuickMenu} onCreated={context.refresh} />
            <button onClick={() => { closeQuickMenu(); navigate(`/finance?date=${context.date}&action=expense&nonce=${crypto.randomUUID()}`); }}><ArrowDownCircle size={17} /><span>{tx("记一笔支出")}</span></button>
            <button onClick={() => void addWater()}><Droplets size={17} /><span>{tx("喝水")}</span></button>
            <WritingQuickActions enabledSlots={quickPrimaryWritingSlots} showIcons onSelect={closeQuickMenu} />
            <button className="quick-add-more" aria-expanded={quickMoreOpen} onClick={() => setQuickMoreOpen(true)}><Ellipsis size={17} /><span>{tx("更多…")}</span></button>
          </div>
          <div className="quick-add-secondary">
            <button className="quick-add-back" onClick={() => setQuickMoreOpen(false)}><ChevronLeft size={17} /><span>{tx("返回")}</span></button>
            <WritingQuickActions enabledSlots={quickSecondaryWritingSlots} showIcons onSelect={closeQuickMenu} />
            <button onClick={() => { closeQuickMenu(); navigate(`/calendar?date=${context.date}&add=plan&nonce=${crypto.randomUUID()}`); }}><CalendarDays size={17} /><span>{tx("安排计划")}</span></button>
            <button onClick={() => { closeQuickMenu(); navigate(`/calendar?date=${context.date}&add=actual&nonce=${crypto.randomUUID()}`); }}><Activity size={17} /><span>{tx("补录实际")}</span></button>
            <button onClick={() => { closeQuickMenu(); navigate(`/routines?date=${context.date}&view=life&action=sleep&nonce=${crypto.randomUUID()}`); }}><Moon size={17} /><span>{tx("记录睡眠")}</span></button>
            <button onClick={() => { closeQuickMenu(); navigate(`/finance?date=${context.date}&action=income&nonce=${crypto.randomUUID()}`); }}><ArrowUpCircle size={17} /><span>{tx("记一笔收入")}</span></button>
            <button onClick={() => { closeQuickMenu(); navigate(`/finance?date=${context.date}&action=transfer&nonce=${crypto.randomUUID()}`); }}><ArrowLeftRight size={17} /><span>{tx("转账")}</span></button>
          </div>
        </div> : null}
      </div>
      {context.currentSession && location.pathname !== "/today" ? <MiniTimer session={context.currentSession} taskTitle={timerTitle} taskVersion={timerTaskVersion} date={context.date} commands={context.timer} /> : null}
      {context.queryError ? <p className="query-error" role="alert">{tx("同步失败，正在显示可保留的旧快照：")}{context.queryError}</p> : null}
      <main ref={mainRef} tabIndex={-1} className="app-content"><Outlet context={context} /></main>
      <nav className="mobile-nav" aria-label={tx("移动端主导航")}><ShellLink to={link("/today")} icon={<Home size={18} />}>{tx("今日")}</ShellLink><ShellLink to={link("/tasks")} icon={<CheckSquare2 size={18} />}>{tx("任务")}</ShellLink><ShellLink to={link("/calendar")} icon={<CalendarDays size={18} />}>{tx("日历")}</ShellLink><ShellLink to={link("/writing")} activePaths={["/writing", "/journal", "/notes", "/inspirations"]} icon={<NotebookPen size={18} />}>{tx("文字")}</ShellLink><ShellLink to={link("/settings")} icon={<Settings size={18} />}>{tx("设置")}</ShellLink></nav>
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
    <div data-guide-anchor="onboarding.checklist" />
    {value.date !== todayString() ? <div className="historical-banner"><strong>{tx("查看")} {formatBusinessDate(value.date)}</strong><span>{tx("当前计时仍属于真实今天；从历史页开始会接取到今天并启动。")}</span><Link to={`/today?date=${todayString()}`}>{tx("回到今天")}</Link></div> : null}
    <div className="today-grid">
      <div className="today-main">
        <CurrentFocusCard session={value.currentSession} taskTitle={value.tasks.find((item) => item.id === value.currentSession?.taskId)?.title} taskVersion={value.tasks.find((item) => item.id === value.currentSession?.taskId)?.version} commands={value.timer} />
        <ContinuationPanel candidates={value.continuations} targetDate={value.date} timezone={value.session.user.timezone} request={value.request} pending={continuationPending} onPending={setContinuationPending} onError={value.feedback.notice} onChanged={value.refresh} />
        <TasksPanel />
      </div>
      <aside className="today-utility" aria-label={tx("今日工具栏")}>
        <WaterFeature request={value.request} selectedDate={value.date} record={dashboard?.waterRecord ?? null} sleep={sleep} onError={value.feedback.notice} onChanged={value.refresh} />
        <CalendarFeature request={value.request} selectedDate={value.date} loading={value.loading} items={timelineItems} tasks={value.tasks} acceptedTaskIds={value.assignments} categories={dashboard?.categories ?? []} projects={value.projects} actualSeconds={value.summary?.actualSeconds} onEditSleep={() => setSleepEditorSignal((value) => value + 1)} onError={value.feedback.notice} onChanged={value.refresh} />
        <section className="today-utility-strip" aria-label={tx("轻量工具")}><SleepFeature compact request={value.request} selectedDate={value.date} record={sleep} snapshotReady={Boolean(dashboard)} recordTimezone={value.session.user.timezone} openEditorSignal={sleepEditorSignal} onError={value.feedback.notice} onChanged={value.refresh} /><section className="review-handoff utility-capture"><QuickNoteCaptureButton compact label={tx("随手记")} request={value.request} userId={value.session.user.id} selectedDate={value.date} onCreated={value.refresh} /><div className="writing-utility-actions"><WritingQuickActions enabledSlots={enabledWritingSlots} /></div></section></section>
        <HabitTodaySnapshot request={value.request} userId={value.session.user.id} date={value.date} />
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
  return <TaskDetailPage detail={taskQuery.data} assigned={value.assignments.includes(id)} active={active} paused={active && value.currentSession?.status === 1} date={value.date} pending={value.timer.pending !== null} categoryName={categoryName} onAccept={surfaces.openSelector} onStart={(task, assigned) => void value.timer.start(task, assigned)} onPauseResume={active ? () => void (value.currentSession!.status === 0 ? value.timer.pause(value.currentSession!) : value.timer.resume(value.currentSession!)) : undefined} finishAction={active && value.currentSession && taskQuery.data ? <FinishSessionButton session={value.currentSession} taskVersion={taskQuery.data.task.version} commands={value.timer}><Square size={15} />{tx("结束本次")}</FinishSessionButton> : undefined} onComplete={(task) => void surfaces.complete(task)} onCompleteAndFinish={active ? (task) => void value.timer.completeAndFinish(value.currentSession!, task.version) : undefined} onEdit={surfaces.openEditor} onArchive={surfaces.archive} />;
}
function ProjectsRoute() { const value = useWorkspace(); return <ProjectsPage request={value.request} userId={value.session.user.id} onError={value.feedback.notice} />; }
function ProjectRoute() { const value = useWorkspace(); const surfaces = useTaskSurfaces(); const projectId = Number(useParams().projectId); return <ProjectDetailPage request={value.request} userId={value.session.user.id} projectId={projectId} onError={value.feedback.notice} onCreateTask={surfaces.openCreate} onEditTask={surfaces.openEditor} />; }
function CalendarRoute() {
  const value = useWorkspace();
  const [params, setParams] = useSearchParams();
  const requestedMode = params.get("view");
  const mode: "day" | "week" | "month" | "year" = requestedMode === "week" || requestedMode === "month" || requestedMode === "year" ? requestedMode : "day";
  function setMode(next: typeof mode) { const copy = new URLSearchParams(params); if (next === "day") copy.delete("view"); else copy.set("view", next); setParams(copy, { replace: true }); }
  const range = weekRange(value.date);
  const month = monthRange(value.date);
  const year = yearRange(value.date);
  const weekQuery = useQuery({ queryKey: ["calendar-week", value.session.user.id, range.from, range.to], enabled: mode === "week", queryFn: () => value.request<{ schedules: Schedule[] }>(`/api/schedules?from=${range.from}&to=${range.to}&timezone=${encodeURIComponent(value.session.user.timezone)}`) });
  const monthQuery = useQuery({ queryKey: ["calendar-month", value.session.user.id, month.from, month.to], enabled: mode === "month", queryFn: () => value.request<{ schedules: Schedule[] }>(`/api/schedules?from=${month.from}&to=${month.to}&timezone=${encodeURIComponent(value.session.user.timezone)}`) });
  const yearQuery = useQuery({ queryKey: ["calendar-year", value.session.user.id, year.from, year.to], enabled: mode === "year", queryFn: () => value.request<{ schedules: Schedule[] }>("/api/schedules?from=" + year.from + "&to=" + year.to + "&timezone=" + encodeURIComponent(value.session.user.timezone)) });
  const weekItems = (weekQuery.data?.schedules ?? []).map((item) => ({ ...item, color: item.color ?? "#35C99A" }));
  const monthItems = (monthQuery.data?.schedules ?? []).map((item) => ({ ...item, color: item.color ?? "#35C99A" }));
  const yearItems = (yearQuery.data?.schedules ?? []).map((item) => ({ ...item, color: item.color ?? "#35C99A" }));
  return <section className="calendar-route"><header className="calendar-route-head"><div><p className="route-eyebrow">{tx("计划与真实投入")}</p><h1>{tx("日历")}</h1></div><div className="segmented-control"><button type="button" className={mode === "day" ? "is-active" : ""} onClick={() => setMode("day")}>{tx("日")}</button><button type="button" className={mode === "week" ? "is-active" : ""} onClick={() => setMode("week")}>{tx("周")}</button><button type="button" className={mode === "month" ? "is-active" : ""} onClick={() => setMode("month")}>{tx("月")}</button><button type="button" className={mode === "year" ? "is-active" : ""} onClick={() => setMode("year")}>{tx("年")}</button></div></header>{mode === "day" ? <CalendarFeature key={`${value.date}:${params.get("add") ?? "view"}:${params.get("nonce") ?? ""}`} request={value.request} selectedDate={value.date} loading={value.loading} items={value.dashboard?.schedules ?? []} tasks={value.tasks} acceptedTaskIds={value.assignments} categories={value.dashboard?.categories ?? []} projects={value.projects} recordTimezone={value.session.user.timezone} actualSeconds={value.summary?.actualSeconds} initialKind={params.get("add") === "plan" ? "plan" : params.get("add") === "actual" ? "actual" : undefined} onError={value.feedback.notice} onChanged={value.refresh} /> : mode === "week" ? <WeekCalendar from={range.from} items={weekItems} loading={weekQuery.isPending} date={value.date} /> : mode === "month" ? <MonthCalendar from={month.from} items={monthItems} loading={monthQuery.isPending} date={value.date} /> : <YearHeatmap from={year.from} to={year.to} items={yearItems} loading={yearQuery.isPending} date={value.date} />}</section>;
}
function yearRange(date: string) { const year = Number(date.slice(0, 4)); return { from: String(year) + "-01-01", to: String(year) + "-12-31" }; }
function writingSlots(value: WorkspaceContext) {
  if (!value.settings) return ["MORNING_WRITING", "JOURNAL", "STOCK_REVIEW"];
  return value.settings.writingSlots.filter((slot) => slot.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map((slot) => slot.slotKey);
}
function WritingLandingRoute() {
  const value = useWorkspace();
  const plugins = enabledWritingPlugins(value.date, writingSlots(value));
  const target = defaultWritingTab(value.session.user.id, plugins);
  const plugin = plugins.find((item) => item.id === target) ?? plugins[0];
  return <Navigate replace to={plugin?.route ?? `/journal?date=${value.date}&tab=journal`} />;
}
function WritingArchiveRoute() { const value = useWorkspace(); return <WritingShell userId={value.session.user.id} date={value.date} activeId="archive" enabledSlots={writingSlots(value)}><WritingArchivePage request={value.request} userId={value.session.user.id} selectedDate={value.date} /></WritingShell>; }
function JournalRoute() {
  const value = useWorkspace();
  const enabledSlots = writingSlots(value);
  const [params] = useSearchParams();
  const requested = pluginForTab(params.get("tab"));
  const plugins = enabledWritingPlugins(value.date, enabledSlots);
  const requestedSlot = requested === "morning" || requested === "journal" || requested === "review" ? requested : null;
  if (requestedSlot && !plugins.some((plugin) => plugin.id === requestedSlot)) {
    return <Navigate replace to={plugins[0]?.route ?? `/notes?date=${value.date}`} />;
  }
  const activeId: WritingPluginId = requested && plugins.some((plugin) => plugin.id === requested) ? requested : "journal";
  if (!requested && !plugins.some((plugin) => plugin.id === activeId)) {
    return <Navigate replace to={plugins[0]?.route ?? `/notes?date=${value.date}`} />;
  }
  if (requested && requested !== "morning" && requested !== "journal" && requested !== "review") {
    const target = plugins.find((plugin) => plugin.id === requested);
    if (target) return <Navigate replace to={target.route} />;
  }
  const slotKey = activeId === "morning" ? "MORNING_WRITING" : activeId === "review" ? "STOCK_REVIEW" : "JOURNAL";
  return <WritingShell userId={value.session.user.id} date={value.date} activeId={activeId} enabledSlots={enabledSlots}>
    <section className="journal-route">
      <header className="journal-route-head"><div><p className="route-eyebrow">{tx("文字 / Writing")}</p><h1>{activeId === "morning" ? tx("晨写") : activeId === "review" ? tx("复盘") : tx("日记")}</h1><p>{tx("内容按所选日期独立保存。")}</p></div></header>
      <WritingReflectionHistory loading={value.loading} enabledSlots={enabledSlots} onlySlot={slotKey} />
    </section>
  </WritingShell>;
}
function JournalDateRoute() { const date = useParams().date; return validDate(date ?? null) ? <Navigate replace to={`/journal?date=${date}`} /> : <NotFoundRoute />; }
function NotesRoute() { const value = useWorkspace(); return <WritingShell userId={value.session.user.id} date={value.date} activeId="notes" enabledSlots={writingSlots(value)}><QuickNotesPage request={value.request} userId={value.session.user.id} selectedDate={value.date} onCreated={value.refresh} /></WritingShell>; }
function InspirationsRoute() { const value = useWorkspace(); return <WritingShell userId={value.session.user.id} date={value.date} activeId="inspirations" enabledSlots={writingSlots(value)}><InspirationLibraryPage request={value.request} userId={value.session.user.id} selectedDate={value.date} projects={value.projects} onError={value.feedback.notice} /></WritingShell>; }
function NoteDetailRoute() { const value = useWorkspace(); const noteId = Number(useParams().noteId); const journal = useJournalDraftBridge(); return <WritingShell userId={value.session.user.id} date={value.date} activeId="notes" enabledSlots={writingSlots(value)}><QuickNoteDetailPage request={value.request} userId={value.session.user.id} noteId={noteId} selectedDate={value.date} recordTimezone={value.session.user.timezone} categories={value.dashboard?.categories ?? []} projects={value.projects} onQuoteToJournal={journal.stageJournalReference} /></WritingShell>; }
function RoutinesRoute() { const value = useWorkspace(); const [params] = useSearchParams(); const sleep = value.dashboard?.sleepRecord ?? null; return <RoutinesFeature request={value.request} userId={value.session.user.id} date={value.date} timezone={value.session.user.timezone} categories={value.dashboard?.categories ?? []} onError={value.feedback.notice} lifeContent={<><SleepFeature request={value.request} selectedDate={value.date} record={sleep} recordTimezone={value.session.user.timezone} snapshotReady={Boolean(value.dashboard)} initiallyOpen={params.get("action") === "sleep"} onError={value.feedback.notice} onChanged={value.refresh} /><WaterFeature request={value.request} selectedDate={value.date} record={value.dashboard?.waterRecord ?? null} sleep={sleep} onError={value.feedback.notice} onChanged={value.refresh} /><section className="review-handoff"><div><p className="route-eyebrow">{tx("晨写")}</p><strong>{value.dashboard?.morningWritingRecord?.content?.trim() ? tx("今日正文已保存") : tx("今日尚未完成")}</strong></div><Link className="ui-button ui-button-primary ui-button-md" to={`/journal?date=${value.date}`}><span className="ui-button-visual">{tx("打开晨写")}</span></Link></section></>} />; }
function FinanceRoute() { const value = useWorkspace(); const [params] = useSearchParams(); const action = params.get("action"); return <FinancePage key={params.get("nonce") ?? "finance"} request={value.request} userId={value.session.user.id} date={value.date} initialAction={action === "income" || action === "expense" || action === "transfer" ? action : undefined} onError={value.feedback.notice} />; }
function RewardsRoute() { const value = useWorkspace(); return value.settings?.rewards?.show === false ? <section className="route-panel"><h1>{tx("奖励展示已隐藏")}</h1><p>{tx("奖励仍会照常结算，可在设置中恢复展示。")}</p><Link to={`/settings?date=${value.date}`}>{tx("打开设置")}</Link></section> : <RewardsFeature request={value.request} initialGrowth={value.dashboard?.growth ?? null} initialEvents={value.dashboard?.rewardEvents ?? []} onError={value.feedback.notice} onGrowthChanged={value.refresh} />; }
function GrowthRoute() { const value = useWorkspace(); return <GrowthPage request={value.request} userId={value.session.user.id} date={value.date} onError={value.feedback.notice} />; }
function ToolsRoute() { const value = useWorkspace(); return <section className="route-panel"><div className="route-panel-heading"><div><p className="route-eyebrow">{tx("既有能力")}</p><h1>{tx("决策工具")}</h1></div><Sparkles size={18} /></div><DecisionToolsFeature request={value.request} selectedDate={value.date} onError={value.feedback.notice} onChanged={value.refresh} onReward={value.settings?.rewards?.show === false ? () => undefined : value.feedback.recordReward} /></section>; }
function InsightsRoute() { const value = useWorkspace(); const navigate = useNavigate(); const d = value.dashboard; return <WritingShell userId={value.session.user.id} date={value.date} activeId="archive" enabledSlots={writingSlots(value)}><HistoryFeature request={value.request} selectedDate={value.date} refreshRevision={0} loading={value.loading} stats={d?.weeklyStats} sleep={d?.sleepRecord ?? null} categories={d?.categoryTotals ?? d?.categories ?? []} schedules={d?.schedules ?? []} weeklySeries={d?.weeklySeries ?? []} monthlySleepSeries={d?.monthlySleepSeries ?? []} onError={value.feedback.notice} onBack={() => navigate(`/today?date=${value.date}`)} /></WritingShell>; }
function SearchRoute() { const value = useWorkspace(); return <SearchFeature request={value.request} userId={value.session.user.id} />; }
function SettingsRoute() { const { session, request, feedback } = useWorkspace(); return <SettingsFeature request={request} userId={session.user.id} logout={session.logout} onProfileChanged={(profile) => session.updateUser?.(profile)} onError={feedback.notice} />; }
function TrashRoute() { const { session, request } = useWorkspace(); return <TrashPage request={request} userId={session.user.id} />; }
function NotFoundRoute() { const { date } = useWorkspace(); return <section className="route-panel"><h1>{tx("页面不存在")}</h1><Link to={`/today?date=${date}`}>{tx("返回今日")}</Link></section>; }

function TimelineSummary({ items, summary }: { items: TimelineViewItem[]; summary: ExecutionSummary | null }) { return <section className="glass-panel p-3"><h2 className="section-title">{tx("今日摘要")}</h2><div className="execution-summary"><span><strong>{summary?.completedAssignments ?? 0}/{summary?.totalAssignments ?? 0}</strong>{tx("今日完成")}</span><span><strong>{formatSeconds(summary?.focusedSeconds ?? 0)}</strong>{tx("专注")}</span><span><strong>{formatSeconds(summary?.actualSeconds ?? 0)}</strong>{tx("实际投入")}</span><span><strong>{formatSeconds(summary?.plannedSeconds ?? 0)}</strong>{tx("计划")}</span></div><div className="timeline-legend">{(["PLANNED", "TIMER_ACTUAL", "MANUAL_ACTUAL", "LEGACY_ACTUAL"] as const).map((kind) => <span key={kind}>{kindLabel(kind)} {items.filter((item) => item.kind === kind).length}</span>)}</div></section>; }
function ShellLink({ to, icon, children, activePaths }: { to: string; icon: ReactNode; children: ReactNode; activePaths?: string[] }) {
  const location = useLocation();
  const routeActive = activePaths?.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  return <NavLink className={({ isActive }) => `shell-link ${isActive || routeActive ? "is-active" : ""}`} title={typeof children === "string" ? children : undefined} to={to}>{icon}<span>{children}</span></NavLink>;
}
function GrowthHeader({ growth, date }: { growth?: Dashboard["growth"]; date: string }) {
  if (!growth) return null;
  const progress = Math.min(1, growth.xpInLevel / Math.max(1, growth.xpForNextLevel));
  return <Link className="growth-header-link" aria-label={tx("成长进度 Lv.{value0}", { value0: growth.level })} title={tx("打开成长")} to={`/growth?date=${date}`}><span className="growth-header-level">Lv.{growth.level}</span><span className="growth-header-track"><i style={{ width: `${progress * 100}%` }} /></span><small>{growth.xpTotal} XP</small></Link>;
}
function useWorkspace() { return useOutletContext<WorkspaceContext>(); }
function routeTitle(path: string) { if (path.startsWith("/tasks/")) return "任务详情"; if (path.startsWith("/projects/")) return "项目详情"; if (path.startsWith("/notes/")) return "随手记详情"; if (path.startsWith("/journal/")) return "文字"; if (path.startsWith("/settings/")) return "数据维护"; return ({ "/today": "今日", "/tasks": "任务", "/projects": "项目", "/calendar": "日历", "/journal": "文字", "/writing": "文字", "/writing/archive": "文字归档", "/notes": "随手记", "/inspirations": "灵感库", "/routines": "生活", "/finance": "财务", "/growth": "成长", "/rewards": "奖励", "/tools": "工具", "/insights": "回看", "/search": "搜索", "/settings": "设置" } as Record<string, string>)[path] ?? "工作台"; }
function validDate(value: string | null): value is string { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)); }
function todayString() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
function sleepTimelineItem(sleep: SleepRecord): TimelineItem { return { id: -20001 - sleep.id, taskId: null, categoryId: null, startTime: timeText(sleep.sleepStart), endTime: timeText(sleep.wakeTime), title: "睡眠", note: sleep.qualityScore ? `质量 ${sleep.qualityScore}/5` : "睡眠记录", kind: 1, source: 0, color: "#7EC8E3", marker: "sleep" }; }
function timeText(value?: string) { if (!value) return "00:00:00"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value.slice(0, 8) : date.toTimeString().slice(0, 8); }
function formatSeconds(seconds: number) { const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function kindLabel(kind: TimelineViewItem["kind"]) { return kind === "PLANNED" ? "计划" : kind === "TIMER_ACTUAL" ? "计时" : kind === "MANUAL_ACTUAL" ? "补录" : "历史实际"; }
function formatBusinessDate(value: string) { const date = new Date(`${value}T00:00:00`); return new Intl.DateTimeFormat(getActiveLocale(), { month: "long", day: "numeric" }).format(date); }
function weekRange(date: string) { const current = new Date(`${date}T00:00:00Z`); const day = current.getUTCDay() || 7; current.setUTCDate(current.getUTCDate() - day + 1); const from = current.toISOString().slice(0, 10); current.setUTCDate(current.getUTCDate() + 6); return { from, to: current.toISOString().slice(0, 10) }; }
function monthRange(date: string) { const current = new Date(`${date}T00:00:00Z`); const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)); const day = first.getUTCDay() || 7; first.setUTCDate(first.getUTCDate() - day + 1); const last = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)); const lastDay = last.getUTCDay() || 7; last.setUTCDate(last.getUTCDate() + (7 - lastDay)); return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }; }
function WeekCalendar({ from, items, loading, date }: { from: string; items: Schedule[]; loading: boolean; date: string }) { const days = Array.from({ length: 7 }, (_, index) => { const value = new Date(`${from}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + index); return value.toISOString().slice(0, 10); }); return <div className="calendar-week-grid">{days.map((day) => <section className={day === date ? "is-selected" : ""} key={day}><header><strong>{formatBusinessDate(day)}</strong><Link to={`/calendar?date=${day}`}>{tx("打开日视图")}</Link></header>{loading ? <p>{tx("加载中...")}</p> : items.filter((item) => item.scheduleDate === day).map((item) => <article key={item.id} className={item.kind === 0 ? "is-plan" : "is-actual"}><span>{item.kind === 0 ? tx("计划") : item.source === 1 ? tx("计时") : item.actualTimeClass === 2 ? tx("历史实际") : tx("补录")}</span><strong>{item.startTime.slice(0, 5)} {item.title}</strong><small>{item.kind === 0 ? ["PENDING", "EXECUTED", "CANCELLED", "RESCHEDULED"][item.lifecycleState ?? 0] : "source-aware"}</small></article>)}</section>)}</div>; }
function MonthCalendar({ from, items, loading, date }: { from: string; items: Schedule[]; loading: boolean; date: string }) { const days = Array.from({ length: 42 }, (_, index) => { const value = new Date(`${from}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + index); return value.toISOString().slice(0, 10); }); return <div className="calendar-month-view"><div className="calendar-month-note">{tx("每日实际投入时长")}</div><div className="calendar-month-grid" role="grid" aria-label={tx("月视图")}><div className="calendar-month-weekdays">{[tx("一"), tx("二"), tx("三"), tx("四"), tx("五"), tx("六"), tx("日")].map((day) => <span key={day}>{tx("周")}{day}</span>)}</div>{days.map((day) => { const dayItems = items.filter((item) => item.scheduleDate === day); const actualMinutes = dayItems.filter((item) => item.kind === 1).reduce((sum, item) => sum + scheduleMinutes(item), 0); const level = Math.min(4, actualMinutes ? Math.max(1, Math.ceil(actualMinutes / 60)) : 0); return <Link role="gridcell" aria-label={tx("{value0}，实际投入 {value1} 分钟", { value0: day, value1: actualMinutes })} className={`${day === date ? "is-selected" : ""} ${day.slice(0, 7) !== date.slice(0, 7) ? "is-outside" : ""}`} key={day} to={`/calendar?date=${day}`}><strong>{Number(day.slice(-2))}</strong>{loading ? <small>...</small> : <span className={`calendar-month-markers heat-level-${level}`} title={tx("实际投入 {value0} 分钟", { value0: actualMinutes })}>{actualMinutes ? <small>{actualMinutes}m</small> : null}</span>}</Link>; })}</div></div>; }
function YearHeatmap({ from, to, items, loading, date }: { from: string; to: string; items: Schedule[]; loading: boolean; date: string }) {
  const first = new Date(from + "T00:00:00Z");
  const year = Number(from.slice(0, 4));
  const leading = (first.getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365;
  const totals = new Map<string, number>();
  for (const item of items) if (item.kind === 1 && item.scheduleDate) totals.set(item.scheduleDate, (totals.get(item.scheduleDate) ?? 0) + scheduleMinutes(item));
  const days = Array.from({ length: dayCount }, (_, index) => { const value = new Date(first); value.setUTCDate(value.getUTCDate() + index); return value.toISOString().slice(0, 10); });
  const totalMinutes = [...totals.values()].reduce((sum, minutes) => sum + minutes, 0);
  return <section className="calendar-year-view" aria-label={tx("年度实际投入热力图")} data-range={from + ":" + to}><div className="calendar-year-heading"><div><strong>{from.slice(0, 4)} {tx("年投入热力图")}</strong><small>{tx("每日实际投入时长")}</small></div><span>{loading ? tx("加载中…") : tx("全年 ") + totalMinutes + tx(" 分钟")}</span></div><div className="calendar-year-scroll"><div className="calendar-year-grid" role="grid" aria-label={tx("年度热力图")}>{Array.from({ length: leading }, (_, index) => <span aria-hidden="true" className="calendar-year-spacer" key={"spacer-" + index} />)}{days.map((day) => { const actualMinutes = totals.get(day) ?? 0; const level = Math.min(4, actualMinutes ? Math.max(1, Math.ceil(actualMinutes / 60)) : 0); return <Link role="gridcell" aria-label={day + tx("，实际投入 ") + actualMinutes + tx(" 分钟")} className={"calendar-year-cell heat-level-" + level + (day === date ? " is-selected" : "")} key={day} title={day + " · " + actualMinutes + tx(" 分钟")} to={"/calendar?date=" + day}><span className="sr-only">{day + tx("，实际投入 ") + actualMinutes + tx(" 分钟")}</span></Link>; })}</div></div><div className="calendar-heat-legend"><span>{tx("少")}</span>{[0, 1, 2, 3, 4].map((level) => <i className={"heat-level-" + level} key={level} />)}<span>{tx("多")}</span></div></section>;
}
function scheduleMinutes(item: Pick<Schedule, "startTime" | "endTime">) { const [startHour, startMinute] = item.startTime.slice(0, 5).split(":").map(Number); const [endHour, endMinute] = item.endTime.slice(0, 5).split(":").map(Number); return Math.max(0, (endHour * 60 + endMinute) - (startHour * 60 + startMinute)); }
