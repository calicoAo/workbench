import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Clapperboard, Sparkles } from "lucide-react";
import type { Request } from "../api";
import type { FeedbackActions } from "../feedback";
import { CalendarFeature, type Schedule, type TimelineItem } from "../../features/calendar";
import { CategoriesFeature, type Category } from "../../features/categories";
import { DecisionToolsFeature } from "../../features/decision-tools";
import { HistoryFeature, type SleepSeriesItem, type WeeklySeriesItem } from "../../features/history";
import { MediaWatchEditor, MediaWatchFeature, type MediaWatchRecord } from "../../features/media-watch";
import { RewardsFeature, type Growth, type RewardEvent } from "../../features/rewards";
import { SleepFeature, type SleepRecord } from "../../features/sleep";
import { TasksFeature, TasksPanel } from "../../features/tasks";
import { TimerFeature, type TimerSession } from "../../features/timer";
import { WaterFeature, type WaterRecord, waterTimelineItems } from "../../features/water";
import {
  type AiInsight,
  type JournalRecord,
  type MorningWritingRecord,
  type StockReviewRecord,
  WritingReflectionFeature
} from "../../features/writing-reflection";
import type { AuthSession } from "../../features/auth";
import { type PageMode, WorkspaceHeader } from "./header";

type Task = {
  id: number;
  title: string;
  description: string | null;
  categoryId: number | null;
  status: number;
  priority: number;
  difficulty: number;
  pinned: number;
  sortOrder: number;
  dueAt: string | null;
  progressPercent: number;
  createdAt: string;
  completedAt: string | null;
  completionNote: string | null;
};

type Dashboard = {
  date: string;
  activeTimer: TimerSession | null;
  activeTimers?: TimerSession[];
  dailyTaskIds?: number[];
  stockReviewRecord: StockReviewRecord | null;
  tasks: Task[];
  categories: Category[];
  categoryTotals?: Category[];
  schedules: Schedule[];
  sleepRecord: SleepRecord | null;
  journalRecord: JournalRecord | null;
  morningWritingRecord: MorningWritingRecord | null;
  waterRecord: WaterRecord | null;
  mediaWatchRecord: MediaWatchRecord | null;
  growth: Growth;
  rewardEvents: RewardEvent[];
  taskRewardEvents?: RewardEvent[];
  aiInsights: AiInsight[];
  weeklySeries: WeeklySeriesItem[];
  monthlySleepSeries: SleepSeriesItem[];
  weeklyStats: { totalMinutes: number; completedTasks: number; journalDays: number; stockReviewDays: number };
};

export function WorkspaceShell({ request, session, feedback }: { request: Request; session: AuthSession; feedback: FeedbackActions }) {
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [pageMode, setPageMode] = useState<PageMode>("workspace");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [loading, setLoading] = useState(true);

  const replaceDashboardSnapshot = useCallback(async (date: string) => {
    setDashboard(await request<Dashboard>(`/api/dashboard?date=${date}`));
  }, [request]);

  const loadDashboard = useCallback(async (date = selectedDate) => {
    setLoading(true);
    try {
      await replaceDashboardSnapshot(date);
    } catch (error) {
      feedback.notice(errorMessage(error, "加载失败"), "加载没有成功");
    } finally {
      setLoading(false);
    }
  }, [feedback.notice, replaceDashboardSnapshot, selectedDate]);

  const enterDashboardDate = useCallback(async (date: string) => {
    setLoading(true);
    try {
      await request("/api/daily-carryovers", { method: "POST", body: JSON.stringify({ targetDate: date }) });
      await replaceDashboardSnapshot(date);
    } catch (error) {
      feedback.notice(errorMessage(error, "日期准备失败"), "日期准备没有成功");
    } finally {
      setLoading(false);
    }
  }, [feedback.notice, replaceDashboardSnapshot, request]);

  useEffect(() => {
    void enterDashboardDate(selectedDate);
  }, [enterDashboardDate, selectedDate]);

  const tasks = dashboard?.tasks ?? [];
  const categories = dashboard?.categories ?? [];
  const categoryTotals = dashboard?.categoryTotals ?? categories;
  const schedules = dashboard?.schedules ?? [];
  const runningTimers = dashboard?.activeTimers ?? (dashboard?.activeTimer ? [dashboard.activeTimer] : []);
  const stats = dashboard?.weeklyStats;
  const growth = dashboard?.growth;
  const sleep = dashboard?.sleepRecord;
  const water = dashboard?.waterRecord ?? null;
  const dashboardReady = dashboard?.date === selectedDate;
  const timelineItems = useMemo(() => {
    const sleepItems = sleep ? [sleepTimelineItem(sleep)] : [];
    return [...schedules, ...sleepItems, ...waterTimelineItems(water)].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [schedules, sleep, water]);

  return (
    <TimerFeature request={request} tasks={tasks} runningTimers={runningTimers} onError={feedback.notice} onChanged={() => loadDashboard()} onReward={feedback.taskReward}>
      {(timerActions) => (
        <TasksFeature
          request={request}
          selectedDate={selectedDate}
          loading={loading}
          tasks={tasks}
          categories={categories}
          schedules={schedules}
          dailyTaskIds={dashboard?.dailyTaskIds ?? []}
          runningTimers={runningTimers}
          taskRewardEvents={dashboard?.taskRewardEvents ?? []}
          onError={feedback.notice}
          onConfirm={feedback.confirm}
          onChanged={() => loadDashboard()}
          onReward={(task, reward) => feedback.taskReward(task, [reward])}
          onStartTimer={timerActions.start}
          onPauseTimer={timerActions.pause}
          onFinishTimer={timerActions.finish}
        >
          <MediaWatchFeature request={request} selectedDate={selectedDate} initialRecord={dashboardReady ? dashboard?.mediaWatchRecord ?? null : null} snapshotReady={dashboardReady} onError={feedback.notice} onChanged={() => loadDashboard()}>
            <WritingReflectionFeature
              key={dashboardReady ? selectedDate : `${selectedDate}:loading`}
              request={request}
              selectedDate={selectedDate}
              initialSnapshot={{
                morning: dashboardReady ? dashboard?.morningWritingRecord ?? null : null,
                journal: dashboardReady ? dashboard?.journalRecord ?? null : null,
                review: dashboardReady ? dashboard?.stockReviewRecord ?? null : null,
                insights: dashboardReady ? dashboard?.aiInsights ?? [] : []
              }}
              disabled={!dashboardReady}
              onError={feedback.notice}
              onChanged={async () => {
                await loadDashboard();
                if (pageMode === "history") setHistoryRevision((revision) => revision + 1);
              }}
            >
              <main className="page-shell min-h-screen p-2.5 text-ink md:p-3">
                <div className="mx-auto flex max-w-[1540px] flex-col gap-2.5">
                  <WorkspaceHeader
                    user={session.user}
                    pageMode={pageMode}
                    selectedDate={selectedDate}
                    growth={growth}
                    stats={stats}
                    onPageChange={setPageMode}
                    onDateChange={setSelectedDate}
                    onRefresh={() => void loadDashboard()}
                    onAccountView={() => feedback.notice(`显示名：${session.user.displayName}\n账号：${session.user.username}`, "账号信息")}
                    onLogout={session.logout}
                  />
                  {pageMode === "workspace" ? (
                    <WorkspaceDashboard
                      request={request}
                      selectedDate={selectedDate}
                      loading={loading}
                      dashboardReady={dashboardReady}
                      dashboard={dashboard}
                      tasks={tasks}
                      categories={categories}
                      timelineItems={timelineItems}
                      sleep={sleep ?? null}
                      feedback={feedback}
                      onChanged={loadDashboard}
                    />
                  ) : pageMode === "history" ? (
                    <HistoryFeature
                      request={request}
                      selectedDate={selectedDate}
                      refreshRevision={historyRevision}
                      onBack={() => setPageMode("workspace")}
                      onError={feedback.notice}
                      loading={loading}
                      stats={stats}
                      sleep={sleep ?? null}
                      categories={categoryTotals}
                      schedules={schedules}
                      weeklySeries={dashboard?.weeklySeries ?? []}
                      monthlySleepSeries={dashboard?.monthlySleepSeries ?? []}
                    />
                  ) : (
                    <RewardsFeature request={request} initialGrowth={growth ?? null} initialEvents={dashboard?.rewardEvents ?? []} onError={feedback.notice} onGrowthChanged={() => loadDashboard()} />
                  )}
                </div>
              </main>
            </WritingReflectionFeature>
          </MediaWatchFeature>
        </TasksFeature>
      )}
    </TimerFeature>
  );
}

function WorkspaceDashboard({ request, selectedDate, loading, dashboardReady, dashboard, tasks, categories, timelineItems, sleep, feedback, onChanged }: {
  request: Request;
  selectedDate: string;
  loading: boolean;
  dashboardReady: boolean;
  dashboard: Dashboard | null;
  tasks: Task[];
  categories: Category[];
  timelineItems: TimelineItem[];
  sleep: SleepRecord | null;
  feedback: FeedbackActions;
  onChanged: () => void | Promise<void>;
}) {
  return (
    <section className="grid min-h-[calc(100vh-106px)] gap-2.5 xl:grid-cols-[320px_minmax(0,1.28fr)_280px]">
      <CalendarFeature request={request} selectedDate={selectedDate} loading={loading} items={timelineItems} tasks={tasks} categories={categories} onError={feedback.notice} onChanged={onChanged} />
      <TasksPanel />
      <div className="grid content-start gap-2.5">
        <SleepFeature request={request} selectedDate={selectedDate} record={dashboardReady ? sleep : null} snapshotReady={dashboardReady} onError={feedback.notice} onChanged={onChanged} />
        <WaterFeature request={request} selectedDate={selectedDate} record={dashboardReady ? dashboard?.waterRecord ?? null : null} sleep={dashboardReady ? sleep : null} onError={feedback.notice} onChanged={onChanged} />
        <Panel title="影视陪伴" icon={<Clapperboard size={17} />}><MediaWatchEditor /></Panel>
        <CategoriesFeature request={request} categories={categories} onError={feedback.notice} onConfirm={feedback.confirm} onChanged={onChanged} />
        <Panel title="小工具" icon={<Sparkles size={17} />}><DecisionToolsFeature request={request} selectedDate={selectedDate} onError={feedback.notice} onChanged={onChanged} onReward={feedback.recordReward} /></Panel>
      </div>
    </section>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="glass-panel p-3"><div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="text-mint-700">{icon}</span><h2 className="section-title">{title}</h2></div></div>{children}</section>;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function timeText(value?: string) {
  if (!value) return "--:--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 5) : date.toTimeString().slice(0, 5);
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function sleepTimelineItem(sleep: SleepRecord): TimelineItem {
  return {
    id: -20001 - sleep.id,
    taskId: null,
    categoryId: null,
    startTime: `${timeText(sleep.sleepStart)}:00`,
    endTime: `${timeText(sleep.wakeTime)}:00`,
    title: "睡眠",
    note: sleep.qualityScore ? `质量 ${sleep.qualityScore}/5` : "睡眠记录",
    kind: 1,
    source: 0,
    color: "#7EC8E3",
    marker: "sleep"
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
