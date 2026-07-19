import {
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock3,
  Droplets,
  GripVertical,
  ListFilter,
  Moon,
  Pause,
  Pencil,
  PieChart,
  Play,
  Plus,
  RefreshCw,
  Square,
  Star,
  SunMedium,
  TimerReset,
  Trash2,
  TrendingUp,
  X
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

type ApiResponse<T> = { code: number; message: string; data: T };
type AuthUser = { id: number; username: string; displayName: string };
type AuthPayload = { token: string; user: AuthUser };
type Task = { id: number; title: string; categoryId: number | null; status: number; priority: number; pinned: number; sortOrder: number; completionNote: string | null };
type Category = { id: number; name: string; color: string; targetMinutes: number; totalMinutes: number };
type TimerSession = { id: number; taskId: number; startTime: string; durationMinutes: number; status: number };
type JournalRecord = { id: number; journalDate: string; content: string | null; moodScore: number | null };
type MorningWritingRecord = { id?: number; writingDate: string; content: string | null; moodScore: number | null };
type StockReviewRecord = {
  id: number;
  reviewDate: string;
  marketSummary: string | null;
  operations: string | null;
  holdingsReview: string | null;
  goodPoints: string | null;
  mistakes: string | null;
  tomorrowPlan: string | null;
  emotionScore: number | null;
  disciplineScore: number | null;
  tags: string | null;
};
type Schedule = {
  id: number;
  taskId: number | null;
  categoryId: number | null;
  startTime: string;
  endTime: string;
  title: string;
  note: string | null;
  kind: number;
  source: number;
  color: string;
};
type TimelineItem = Schedule & { marker?: "water" };
type SleepRecord = { id: number; sleepStart: string; wakeTime: string; durationMinutes: number; qualityScore: number | null };
type WaterRecord = { id?: number; waterDate: string; cups: number; targetCups: number; lastDrinkAt?: string | null; drinkTimes?: string | string[] | null };
type MediaWatchRecord = { id?: number; watchDate: string; title: string | null; episode: string | null; note: string | null };
type SleepSeriesItem = { date: string; sleepMinutes: number; sleepQuality: number | null };
type HydrationPlan = { percent: number; statusText: string; rhythmText: string; lastDrinkText: string };
type WeeklySeriesItem = {
  date: string;
  sleepMinutes: number;
  sleepQuality: number | null;
  journalFilled: boolean;
  reviewFilled: boolean;
  emotionScore: number | null;
  disciplineScore: number | null;
};

type Dashboard = {
  date: string;
  activeTimer: TimerSession | null;
  stockReviewRecord: StockReviewRecord | null;
  tasks: Task[];
  categories: Category[];
  schedules: Schedule[];
  sleepRecord: SleepRecord | null;
  journalRecord: JournalRecord | null;
  morningWritingRecord: MorningWritingRecord | null;
  waterRecord: WaterRecord | null;
  mediaWatchRecord: MediaWatchRecord | null;
  weeklySeries: WeeklySeriesItem[];
  monthlySleepSeries: SleepSeriesItem[];
  weeklyStats: { totalMinutes: number; completedTasks: number; journalDays: number; stockReviewDays: number };
};

type PageMode = "workspace" | "history";
type ArchiveTab = "morning" | "journal" | "review" | "media";
type SleepRange = "week" | "month";
type WritingModalKind = "morning" | "journal" | "review";
type TaskCategoryFilter = "all" | "none" | string;
type AuthMode = "login" | "register";

const AUTH_TOKEN_KEY = "personal_workbench_token";
const HOUR_START = 6;
const HOUR_END = 24;
const CATEGORY_COLORS = ["#5B8DEF", "#FF8FA3", "#35C99A", "#F6A7C6", "#DDD3FF", "#7EC8E3", "#F7C96B", "#9BD67D"];
const timelineHours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, index) => HOUR_START + index);
const MORNING_STATE_OPTIONS = [
  { value: "5", label: "稳定有余力，可以主动推进" },
  { value: "4", label: "状态不错，先做最重要的一件事" },
  { value: "3", label: "普通水平，降低阻力开始" },
  { value: "2", label: "有点乱，先完成一个小动作" },
  { value: "1", label: "能量很低，只照顾基本节奏" }
] as const;
const JOURNAL_STATE_OPTIONS = [
  { value: "5", label: "放松满足，今天值得收好" },
  { value: "4", label: "整体平稳，给自己一个肯定" },
  { value: "3", label: "有些起伏，先把感受写清楚" },
  { value: "2", label: "压力偏高，允许自己慢下来" },
  { value: "1", label: "很累很难，先恢复和休息" }
] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || json.code !== 0) throw new Error(json.message || "request failed");
  return json.data;
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12));
  return next.toISOString().slice(0, 10);
}

function timeText(value?: string) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return date.toTimeString().slice(0, 5);
}

function elapsedText(start?: string) {
  if (!start) return "00:00";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function currentTimeText() {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
}

function currentTimeInput() {
  return timeInputFromDate(new Date());
}

function timeInputFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function minutesAgoTimeInput(minutes: number) {
  return timeInputFromDate(new Date(Date.now() - minutes * 60000));
}

function localDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayString();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hydrationPlan(water: WaterRecord, sleep: SleepRecord | null, date: string): HydrationPlan {
  const now = new Date();
  const targetCups = Math.max(1, water.targetCups);
  const startMinutes = sleep ? timeToMinutes(timeText(sleep.wakeTime)) : 8 * 60;
  let endMinutes = sleep ? timeToMinutes(timeText(sleep.sleepStart)) : 22 * 60;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  const intervalMinutes = Math.max(45, Math.round((endMinutes - startMinutes) / targetCups));
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + (now.getHours() * 60 + now.getMinutes() < startMinutes ? 24 * 60 : 0);
  const elapsed = Math.max(0, Math.min(endMinutes - startMinutes, currentMinutes - startMinutes));
  const expectedCups = date === todayString() ? Math.min(targetCups, Math.ceil(elapsed / intervalMinutes)) : targetCups;
  const percent = expectedCups <= 0 ? 100 : Math.min(100, Math.round((water.cups / expectedCups) * 100));
  const nextDueMinutes = startMinutes + water.cups * intervalMinutes;
  const overdueMinutes = Math.max(0, currentMinutes - nextDueMinutes);
  const statusText =
    date !== todayString()
      ? "历史记录"
      : water.cups >= targetCups
        ? "今日完成"
        : expectedCups === 0
          ? "还没到开始时间"
          : percent >= 100
            ? "节奏正常"
            : `慢了 ${formatDuration(overdueMinutes || intervalMinutes)}`;
  return {
    percent,
    statusText,
    rhythmText: `约每 ${formatDuration(intervalMinutes)} 一杯，当前应到 ${expectedCups}/${targetCups} 杯`,
    lastDrinkText: lastDrinkText(water.lastDrinkAt)
  };
}

function lastDrinkText(value?: string | null) {
  if (!value) return "今天还没记录喝水";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "上次喝水：刚刚";
  if (minutes < 60) return `上次喝水：${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return `上次喝水：${hours} 小时${rest ? ` ${rest} 分钟` : ""}前`;
  return `上次喝水：${Math.floor(hours / 24)} 天前`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function timeToSeconds(value: string) {
  const [hour, minute, second = 0] = value.split(":").map(Number);
  return hour * 3600 + minute * 60 + second;
}

function durationMinutes(item: Schedule) {
  const seconds = Math.max(0, timeToSeconds(item.endTime) - timeToSeconds(item.startTime));
  return seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0;
}

function parseDrinkTimes(water: WaterRecord) {
  if (Array.isArray(water.drinkTimes)) return water.drinkTimes;
  if (typeof water.drinkTimes === "string" && water.drinkTimes.trim()) {
    try {
      const parsed = JSON.parse(water.drinkTimes);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
    } catch {
      return water.lastDrinkAt ? [water.lastDrinkAt] : [];
    }
  }
  return water.lastDrinkAt ? [water.lastDrinkAt] : [];
}

function waterTimelineItems(water: WaterRecord): TimelineItem[] {
  return parseDrinkTimes(water)
    .slice(0, water.cups)
    .map((drinkTime, index) => {
      const at = timeText(drinkTime);
      return {
        id: -10001 - index,
        taskId: null,
        categoryId: null,
        startTime: `${at}:00`,
        endTime: `${at}:00`,
        title: `喝水 · 第 ${index + 1} 杯`,
        note: "喝水记录",
        kind: 1,
        source: 0,
        color: "#7EC8E3",
        marker: "water" as const
      };
    });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function plannedMap(schedules: Schedule[]) {
  const map = new Map<number, Schedule>();
  for (const schedule of schedules) {
    if (schedule.kind === 0 && schedule.taskId && !map.has(schedule.taskId)) {
      map.set(schedule.taskId, schedule);
    }
  }
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

function nextCategoryColor(index: number) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [pageMode, setPageMode] = useState<PageMode>("workspace");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCategoryId, setTaskCategoryId] = useState("");
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<TaskCategoryFilter>("all");
  const [taskPlanEnabled, setTaskPlanEnabled] = useState(false);
  const [taskPlanStart, setTaskPlanStart] = useState("09:00");
  const [taskPlanEnd, setTaskPlanEnd] = useState("10:00");
  const [scheduleTaskId, setScheduleTaskId] = useState("");
  const [scheduleKind, setScheduleKind] = useState("1");
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("10:00");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [finishTimerModalOpen, setFinishTimerModalOpen] = useState(false);
  const [finishTimerDate, setFinishTimerDate] = useState(todayString());
  const [finishTimerStart, setFinishTimerStart] = useState("09:00");
  const [finishTimerEnd, setFinishTimerEnd] = useState("10:00");
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryColor, setEditCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [editCategoryTargetHours, setEditCategoryTargetHours] = useState("100");
  const [journalContent, setJournalContent] = useState("");
  const [journalMoodScore, setJournalMoodScore] = useState("4");
  const [morningContent, setMorningContent] = useState("");
  const [morningMoodScore, setMorningMoodScore] = useState("4");
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>("morning");
  const [sleepRange, setSleepRange] = useState<SleepRange>("week");
  const [writingModal, setWritingModal] = useState<WritingModalKind | null>(null);
  const [morningArchive, setMorningArchive] = useState<MorningWritingRecord[]>([]);
  const [journalArchive, setJournalArchive] = useState<JournalRecord[]>([]);
  const [reviewArchive, setReviewArchive] = useState<StockReviewRecord[]>([]);
  const [mediaArchive, setMediaArchive] = useState<MediaWatchRecord[]>([]);
  const [reviewMarketSummary, setReviewMarketSummary] = useState("");
  const [reviewOperations, setReviewOperations] = useState("");
  const [reviewHoldingsReview, setReviewHoldingsReview] = useState("");
  const [reviewMistakes, setReviewMistakes] = useState("");
  const [reviewTomorrowPlan, setReviewTomorrowPlan] = useState("");
  const [reviewEmotionScore, setReviewEmotionScore] = useState("4");
  const [reviewDisciplineScore, setReviewDisciplineScore] = useState("4");
  const [reviewTags, setReviewTags] = useState("");
  const [mediaTitle, setMediaTitle] = useState("");
  const [mediaEpisode, setMediaEpisode] = useState("");
  const [mediaNote, setMediaNote] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [completionTask, setCompletionTask] = useState<Task | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [sleepModalOpen, setSleepModalOpen] = useState(false);
  const [sleepStart, setSleepStart] = useState("23:30");
  const [wakeTime, setWakeTime] = useState("07:30");
  const [qualityScore, setQualityScore] = useState("4");
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadDashboard(date = selectedDate) {
    if (!localStorage.getItem(AUTH_TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api<Dashboard>(`/api/dashboard?date=${date}`);
      setDashboard(data);
      setTaskCategoryId((current) => (current && data.categories.some((category) => String(category.id) === current) ? current : String(data.categories[0]?.id ?? "")));
      setTaskCategoryFilter((current) => (current === "all" || current === "none" || data.categories.some((category) => String(category.id) === current) ? current : "all"));
      setScheduleTaskId((current) => (current && data.tasks.some((task) => String(task.id) === current) ? current : ""));
      if (data.sleepRecord) {
        setSleepStart(timeText(data.sleepRecord.sleepStart));
        setWakeTime(timeText(data.sleepRecord.wakeTime));
        setQualityScore(String(data.sleepRecord.qualityScore ?? 4));
      }
      setJournalContent(data.journalRecord?.content ?? "");
      setJournalMoodScore(String(data.journalRecord?.moodScore ?? 4));
      setMorningContent(data.morningWritingRecord?.content ?? "");
      setMorningMoodScore(String(data.morningWritingRecord?.moodScore ?? 4));
      setReviewMarketSummary(data.stockReviewRecord?.marketSummary ?? "");
      setReviewOperations(data.stockReviewRecord?.operations ?? "");
      setReviewHoldingsReview(data.stockReviewRecord?.holdingsReview ?? "");
      setReviewMistakes(data.stockReviewRecord?.mistakes ?? "");
      setReviewTomorrowPlan(data.stockReviewRecord?.tomorrowPlan ?? "");
      setReviewEmotionScore(String(data.stockReviewRecord?.emotionScore ?? 4));
      setReviewDisciplineScore(String(data.stockReviewRecord?.disciplineScore ?? 4));
      setReviewTags(data.stockReviewRecord?.tags ?? "");
      setMediaTitle(data.mediaWatchRecord?.title ?? "");
      setMediaEpisode(data.mediaWatchRecord?.episode ?? "");
      setMediaNote(data.mediaWatchRecord?.note ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setAuthLoading(false);
      setLoading(false);
      return;
    }

    api<AuthUser>("/api/auth/me")
      .then((user) => setAuthUser(user))
      .catch(() => {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthUser(null);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  useEffect(() => {
    if (authUser) void loadDashboard(selectedDate);
  }, [selectedDate, authUser?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (authUser && pageMode === "history") void loadArchiveRecords();
  }, [pageMode, archiveTab, authUser?.id]);

  async function run(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const payload = await api<AuthPayload>(`/api/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({
          username: authUsername.trim(),
          displayName: authMode === "register" ? authDisplayName.trim() || authUsername.trim() : undefined,
          password: authPassword
        })
      });
      localStorage.setItem(AUTH_TOKEN_KEY, payload.token);
      setAuthUser(payload.user);
      setAuthPassword("");
      await loadDashboard();
    });
  }

  function logout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthUser(null);
    setDashboard(null);
    setPageMode("workspace");
    setError("");
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!taskTitle.trim() || !taskCategoryId) return;
    await run(async () => {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle.trim(),
          categoryId: Number(taskCategoryId),
          priority: 2,
          plannedDate: taskPlanEnabled ? selectedDate : undefined,
          plannedStartTime: taskPlanEnabled ? taskPlanStart : undefined,
          plannedEndTime: taskPlanEnabled ? taskPlanEnd : undefined
        })
      });
      setTaskTitle("");
      setTaskPlanEnabled(false);
      await loadDashboard();
    });
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    await run(async () => {
      await api("/api/task-categories", { method: "POST", body: JSON.stringify({ name: categoryName.trim(), color: nextCategoryColor(dashboard?.categories.length ?? 0), targetMinutes: 6000 }) });
      setCategoryName("");
      await loadDashboard();
    });
  }

  function openCategoryEditor(category: Category) {
    setEditingCategory(category);
    setEditCategoryName(category.name);
    setEditCategoryColor(category.color);
    setEditCategoryTargetHours(String(Math.max(1, Math.round(category.targetMinutes / 60))));
  }

  async function updateCategory(event: FormEvent) {
    event.preventDefault();
    if (!editingCategory || !editCategoryName.trim()) return;
    await run(async () => {
      await api(`/api/task-categories/${editingCategory.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editCategoryName.trim(),
          color: editCategoryColor,
          targetMinutes: Number(editCategoryTargetHours) * 60
        })
      });
      setEditingCategory(null);
      await loadDashboard();
    });
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`删除类型「${category.name}」吗？已有任务和时间记录会变为未分类。`)) return;
    await run(async () => {
      await api(`/api/task-categories/${category.id}`, { method: "DELETE" });
      if (String(category.id) === taskCategoryId) setTaskCategoryId("");
      await loadDashboard();
    });
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    if (!scheduleTaskId && !scheduleTitle.trim()) {
      setError("不关联任务时，需要写一下这段时间做了什么");
      return;
    }
    await run(async () => {
      await api("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          scheduleDate: selectedDate,
          startTime: scheduleStart,
          endTime: scheduleEnd,
          kind: Number(scheduleKind),
          taskId: scheduleTaskId ? Number(scheduleTaskId) : undefined,
          categoryId: !scheduleTaskId && taskCategoryId ? Number(taskCategoryId) : undefined,
          title: scheduleTitle.trim() || undefined,
          note: scheduleNote.trim() || undefined
        })
      });
      setScheduleTitle("");
      setScheduleNote("");
      setScheduleModalOpen(false);
      await loadDashboard();
    });
  }

  async function deleteSchedule(id: number) {
    await run(async () => {
      await api(`/api/schedules/${id}`, { method: "DELETE" });
      await loadDashboard();
    });
  }

  async function deleteTask(id: number) {
    if (!window.confirm("删除这个任务吗？关联的时间轴记录也会一起删除。")) return;
    await run(async () => {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
      await loadDashboard();
    });
  }

  async function updateTaskCategory(task: Task, categoryId: number | null) {
    if (task.categoryId === categoryId) return;
    await run(async () => {
      await api(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ categoryId }) });
      await loadDashboard();
    });
  }

  function openTaskTitleEditor(task: Task) {
    setEditingTask(task);
    setEditTaskTitle(task.title);
  }

  async function saveTaskTitle(event: FormEvent) {
    event.preventDefault();
    if (!editingTask) return;
    const nextTitle = editTaskTitle.trim();
    if (nextTitle === editingTask.title) {
      setEditingTask(null);
      return;
    }
    if (!nextTitle) {
      setError("任务标题不能为空");
      return;
    }
    await run(async () => {
      await api(`/api/tasks/${editingTask.id}`, { method: "PUT", body: JSON.stringify({ title: nextTitle }) });
      setEditingTask(null);
      setEditTaskTitle("");
      await loadDashboard();
    });
  }

  async function saveSleep(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/sleep-records", { method: "POST", body: JSON.stringify({ sleepDate: selectedDate, sleepStart, wakeTime, qualityScore: Number(qualityScore) }) });
      setSleepModalOpen(false);
      await loadDashboard();
    });
  }

  async function saveJournal(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/journals", { method: "POST", body: JSON.stringify({ journalDate: selectedDate, content: journalContent, moodScore: Number(journalMoodScore) }) });
      setWritingModal(null);
      await loadDashboard();
      if (pageMode === "history") await loadArchiveRecords();
    });
  }

  async function saveMorningWriting(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/morning-writings", { method: "POST", body: JSON.stringify({ writingDate: selectedDate, content: morningContent, moodScore: Number(morningMoodScore) }) });
      setWritingModal(null);
      await loadDashboard();
      if (pageMode === "history") await loadArchiveRecords();
    });
  }

  async function saveStockReview(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/stock-reviews", {
        method: "POST",
        body: JSON.stringify({
          reviewDate: selectedDate,
          marketSummary: reviewMarketSummary,
          operations: reviewOperations,
          holdingsReview: reviewHoldingsReview,
          mistakes: reviewMistakes,
          tomorrowPlan: reviewTomorrowPlan,
          emotionScore: Number(reviewEmotionScore),
          disciplineScore: Number(reviewDisciplineScore),
          tags: reviewTags
        })
      });
      setWritingModal(null);
      await loadDashboard();
      if (pageMode === "history") await loadArchiveRecords();
    });
  }

  async function saveWaterCups(cups: number) {
    const next = Math.max(0, Math.min(8, cups));
    await run(async () => {
      await api("/api/water-records", { method: "POST", body: JSON.stringify({ waterDate: selectedDate, cups: next, targetCups: 8 }) });
      await loadDashboard();
    });
  }

  async function saveMediaWatch(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api("/api/media-watch-records", {
        method: "POST",
        body: JSON.stringify({
          watchDate: selectedDate,
          title: mediaTitle,
          episode: mediaEpisode,
          note: mediaNote
        })
      });
      await loadDashboard();
    });
  }

  async function loadArchiveRecords() {
    try {
      if (archiveTab === "morning") {
        setMorningArchive(await api<MorningWritingRecord[]>("/api/morning-writings/list?limit=50"));
      } else if (archiveTab === "journal") {
        setJournalArchive(await api<JournalRecord[]>("/api/journals/list?limit=50"));
      } else if (archiveTab === "review") {
        setReviewArchive(await api<StockReviewRecord[]>("/api/stock-reviews/list?limit=50"));
      } else {
        setMediaArchive(await api<MediaWatchRecord[]>("/api/media-watch-records/list?limit=50"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "列表加载失败");
    }
  }

  async function toggleDone(task: Task) {
    if (task.status === 2) {
      await run(async () => {
        await api(`/api/tasks/${task.id}/status`, { method: "PUT", body: JSON.stringify({ status: 0 }) });
        if (completionTask?.id === task.id) {
          setCompletionTask(null);
          setCompletionNote("");
        }
        await loadDashboard();
      });
      return;
    }

    const plannedSchedule = taskPlans.get(task.id);
    setFinishTimerDate(selectedDate);
    setFinishTimerStart(plannedSchedule?.startTime.slice(0, 5) ?? minutesAgoTimeInput(30));
    setFinishTimerEnd(plannedSchedule?.endTime.slice(0, 5) ?? currentTimeInput());
    setCompletionTask(task);
    setCompletionNote(task.completionNote ?? "");
  }

  async function saveCompletionReflection(event: FormEvent) {
    event.preventDefault();
    if (!completionTask) return;
    if (finishTimerEnd <= finishTimerStart) {
      setError("结束时间需要晚于开始时间");
      return;
    }
    await run(async () => {
      await api(`/api/tasks/${completionTask.id}/status`, {
        method: "PUT",
        body: JSON.stringify({
          status: 2,
          completionNote: completionNote.trim() || undefined
        })
      });
      await api("/api/schedules", {
        method: "POST",
        body: JSON.stringify({
          scheduleDate: finishTimerDate,
          startTime: finishTimerStart,
          endTime: finishTimerEnd,
          kind: 1,
          taskId: completionTask.id,
          note: completionNote.trim() || undefined
        })
      });
      setCompletionTask(null);
      setCompletionNote("");
      await loadDashboard();
    });
  }

  async function togglePinned(task: Task) {
    await run(async () => {
      await api(`/api/tasks/${task.id}/pinned`, { method: "PUT", body: JSON.stringify({ pinned: !task.pinned }) });
      await loadDashboard();
    });
  }

  async function startTimer(taskId: number) {
    await run(async () => {
      await api("/api/timer-sessions/start", { method: "POST", body: JSON.stringify({ taskId }) });
      await loadDashboard();
    });
  }

  async function stopTimer(action: "pause" | "finish") {
    const id = dashboard?.activeTimer?.id;
    if (!id) return;
    await run(async () => {
      await api(`/api/timer-sessions/${id}/${action}`, { method: "PUT" });
      await loadDashboard();
    });
  }

  function openFinishTimerModal() {
    const activeTimer = dashboard?.activeTimer;
    if (!activeTimer) return;
    setFinishTimerDate(localDateInput(activeTimer.startTime));
    setFinishTimerStart(timeText(activeTimer.startTime));
    setFinishTimerEnd(currentTimeInput());
    setFinishTimerModalOpen(true);
  }

  async function finishTimer(event: FormEvent) {
    event.preventDefault();
    const id = dashboard?.activeTimer?.id;
    if (!id) return;
    if (finishTimerEnd <= finishTimerStart) {
      setError("结束时间需要晚于开始时间");
      return;
    }
    await run(async () => {
      await api(`/api/timer-sessions/${id}/finish`, {
        method: "PUT",
        body: JSON.stringify({
          scheduleDate: finishTimerDate,
          startTime: finishTimerStart,
          endTime: finishTimerEnd
        })
      });
      setFinishTimerModalOpen(false);
      await loadDashboard();
    });
  }

  async function reorderTasks(targetTaskId: number) {
    if (!draggingTaskId || draggingTaskId === targetTaskId || !dashboard) {
      setDraggingTaskId(null);
      setDragOverTaskId(null);
      return;
    }
    const ids = sortTasksByOrder(dashboard.tasks).map((task) => task.id);
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
    await run(async () => {
      await api("/api/tasks/reorder", { method: "PUT", body: JSON.stringify({ taskIds: ids }) });
      await loadDashboard();
    });
  }

  const tasks = dashboard?.tasks ?? [];
  const categories = dashboard?.categories ?? [];
  const schedules = dashboard?.schedules ?? [];
  const taskPlans = plannedMap(schedules);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const orderedTasks = useMemo(() => sortTasksForDisplay(tasks, taskPlans), [tasks, taskPlans]);
  const activeTask = dashboard?.activeTimer ? tasks.find((task) => task.id === dashboard.activeTimer?.taskId) ?? null : null;
  const filteredTasks = useMemo(() => {
    if (taskCategoryFilter === "all") return orderedTasks;
    if (taskCategoryFilter === "none") return orderedTasks.filter((task) => !task.categoryId);
    return orderedTasks.filter((task) => String(task.categoryId) === taskCategoryFilter);
  }, [orderedTasks, taskCategoryFilter]);
  const categoryTaskCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const task of orderedTasks) {
      if (task.categoryId) counts.set(task.categoryId, (counts.get(task.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [orderedTasks]);
  const pendingTasks = filteredTasks.filter((task) => task.status !== 2);
  const completedTasks = filteredTasks.filter((task) => task.status === 2);
  const uncategorizedTaskCount = orderedTasks.filter((task) => !task.categoryId).length;
  const renderTaskRow = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      category={task.categoryId ? categoryById.get(task.categoryId) ?? null : null}
      categories={categories}
      plannedSchedule={taskPlans.get(task.id) ?? null}
      active={dashboard?.activeTimer?.taskId === task.id}
      activeStartedAt={dashboard?.activeTimer?.taskId === task.id ? dashboard.activeTimer.startTime : undefined}
      disabled={(Boolean(dashboard?.activeTimer) && dashboard?.activeTimer?.taskId !== task.id) || task.status === 2}
      dragging={draggingTaskId === task.id}
      dragOver={dragOverTaskId === task.id && draggingTaskId !== task.id}
      onDone={() => toggleDone(task)}
      onPinned={() => togglePinned(task)}
      onCategoryChange={(categoryId) => updateTaskCategory(task, categoryId)}
      onTitleEdit={() => openTaskTitleEditor(task)}
      onStart={() => startTimer(task.id)}
      onPause={() => stopTimer("pause")}
      onFinish={openFinishTimerModal}
      onDelete={() => deleteTask(task.id)}
      onDragStart={() => setDraggingTaskId(task.id)}
      onDragEnter={() => setDragOverTaskId(task.id)}
      onDragEnd={() => {
        setDraggingTaskId(null);
        setDragOverTaskId(null);
      }}
      onDrop={() => reorderTasks(task.id)}
    />
  );
  const stats = dashboard?.weeklyStats;
  const sleep = dashboard?.sleepRecord;
  const weeklySeries = dashboard?.weeklySeries ?? [];
  const monthlySleepSeries = dashboard?.monthlySleepSeries ?? [];
  const sleepChartSeries = sleepRange === "week" ? weeklySeries : monthlySleepSeries;
  const water = dashboard?.waterRecord ?? { waterDate: selectedDate, cups: 0, targetCups: 8, lastDrinkAt: null, drinkTimes: "[]" };
  const waterPlan = hydrationPlan(water, sleep ?? null, selectedDate);
  const timelineItems = useMemo(() => {
    return [...schedules, ...waterTimelineItems(water)].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [schedules, water]);
  const reviewRecord = dashboard?.stockReviewRecord ?? null;
  const actualMinutes = schedules.filter((item) => item.kind === 1).reduce((sum, item) => sum + durationMinutes(item), 0);
  const plannedCount = schedules.filter((item) => item.kind === 0).length;
  const timeBreakdown = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of schedules) {
      if (item.kind !== 1 || !item.categoryId) continue;
      map.set(item.categoryId, (map.get(item.categoryId) ?? 0) + durationMinutes(item));
    }
    return categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        minutes: map.get(category.id) ?? 0
      }))
      .filter((item) => item.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  }, [categories, schedules]);
  const pieTotalMinutes = timeBreakdown.reduce((sum, item) => sum + item.minutes, 0);
  const maxSleepMinutes = Math.max(1, ...weeklySeries.map((item) => item.sleepMinutes));

  if (authLoading) {
    return (
      <main className="page-shell min-h-screen p-4 text-ink">
        <div className="mx-auto flex min-h-[calc(100vh-32px)] max-w-md items-center">
          <section className="glass-panel w-full p-5 text-center">
            <p className="text-xs text-soft">个人工作台</p>
            <h1 className="mt-1 text-lg font-bold">正在同步登录状态</h1>
          </section>
        </div>
      </main>
    );
  }

  if (!authUser) {
    return (
      <AuthPage
        mode={authMode}
        username={authUsername}
        displayName={authDisplayName}
        password={authPassword}
        error={error}
        onModeChange={setAuthMode}
        onUsernameChange={setAuthUsername}
        onDisplayNameChange={setAuthDisplayName}
        onPasswordChange={setAuthPassword}
        onSubmit={submitAuth}
      />
    );
  }

  return (
    <main className="page-shell min-h-screen p-2.5 text-ink md:p-3">
      <div className="mx-auto flex max-w-[1540px] flex-col gap-2.5">
        <header className="glass-panel sticky top-2.5 z-10 grid gap-2.5 p-2.5 lg:grid-cols-[170px_minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="text-xs text-soft">个人工作台</p>
            <h1 className="text-lg font-bold leading-tight">今日记录</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-white/80 bg-white/70 p-0.5">
              <button className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${pageMode === "workspace" ? "bg-mint-500 text-white" : "text-soft hover:text-ink"}`} onClick={() => setPageMode("workspace")}>
                工作台
              </button>
              <button className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${pageMode === "history" ? "bg-pink-400 text-white" : "text-soft hover:text-ink"}`} onClick={() => setPageMode("history")}>
                回看统计
              </button>
            </div>
            <div className="time-chip" aria-label="现在时间">
              <Clock3 size={14} />
              <span>{currentTimeText()}</span>
            </div>
            <button className="icon-button" aria-label="前一天" onClick={() => setSelectedDate((date) => shiftDate(date, -1))}>
              <ChevronLeft size={16} />
            </button>
            <input className="h-9 rounded-full border border-white/80 bg-white/70 px-3 text-[13px] outline-none focus:border-mint-300" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            <button className="icon-button" aria-label="后一天" onClick={() => setSelectedDate((date) => shiftDate(date, 1))}>
              <ChevronRight size={16} />
            </button>
            <button className="icon-button" aria-label="刷新" onClick={() => loadDashboard()}>
              <RefreshCw size={16} />
            </button>
            <span className="time-chip max-w-[140px] truncate" title={authUser.username}>{authUser.displayName}</span>
            <button className="icon-button w-auto px-3 text-[11px] font-semibold" onClick={logout}>
              退出
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <MiniStat label="实际" value={formatDuration(stats?.totalMinutes ?? 0)} />
            <MiniStat label="完成" value={`${stats?.completedTasks ?? 0}`} />
            <MiniStat label="复盘" value={`${stats?.stockReviewDays ?? 0}天`} />
            <MiniStat label="日记" value={`${stats?.journalDays ?? 0}天`} />
          </div>
        </header>

        {error && <div className="glass-panel border-pink-300 p-3 text-sm text-pink-500">{error}</div>}

        {pageMode === "workspace" ? (
          <section className="grid min-h-[calc(100vh-106px)] gap-2.5 xl:grid-cols-[320px_minmax(0,1.28fr)_280px]">
          <Panel
            title="小时记录"
            icon={<CalendarDays size={16} />}
            className="xl:h-full"
            action={
              <button className="primary-button h-8 gap-1 px-3 text-[11px]" onClick={() => setScheduleModalOpen(true)}>
                <Plus size={14} />
                记录
              </button>
            }
          >
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              <Metric label="已记录" value={formatDuration(actualMinutes)} />
              <Metric label="安排" value={`${plannedCount}段`} />
            </div>

            <div className="mb-2 flex items-center gap-3 px-1 text-[10px] text-soft">
              <span className="inline-flex items-center gap-1">
                <i className="h-2 w-2 rounded-full bg-mint-500" />
                实际
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="h-2 w-2 rounded-full border border-dashed border-pink-300 bg-white/80" />
                安排
              </span>
            </div>

            {loading && <EmptyText text="加载中..." />}
            {!loading && !timelineItems.length && <EmptyText text="这一天还没有时间记录。" />}
            {!!timelineItems.length && <TimelineBoard items={timelineItems} onDelete={deleteSchedule} />}
          </Panel>

          <Panel title="主要任务" icon={<CheckCircle2 size={17} />} className="xl:min-h-full">
            <form className="mb-3 grid gap-2" onSubmit={createTask}>
              <div className="grid gap-2 md:grid-cols-[1fr_170px_auto]">
                <input className="field min-w-0" placeholder="新增一个主要任务" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
                <select className="field" value={taskCategoryId} onChange={(event) => setTaskCategoryId(event.target.value)} required>
                  <option value="">选择类型</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button className="primary-button px-4" type="submit">
                  添加
                </button>
              </div>
              <label className="flex flex-wrap items-center gap-2 text-xs text-soft">
                <input className="accent-mint-500" type="checkbox" checked={taskPlanEnabled} onChange={(event) => setTaskPlanEnabled(event.target.checked)} />
                预设时段
                {taskPlanEnabled && (
                  <>
                    <input className="field h-8 w-28" type="time" value={taskPlanStart} onChange={(event) => setTaskPlanStart(event.target.value)} />
                    <input className="field h-8 w-28" type="time" value={taskPlanEnd} onChange={(event) => setTaskPlanEnd(event.target.value)} />
                  </>
                )}
              </label>
            </form>

            {!!tasks.length && (
              <TaskCategoryTabs
                categories={categories}
                active={taskCategoryFilter}
                allCount={orderedTasks.length}
                uncategorizedCount={uncategorizedTaskCount}
                categoryCounts={categoryTaskCounts}
                onChange={setTaskCategoryFilter}
              />
            )}

            <div className="space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-310px)]">
              {loading && <EmptyText text="加载中..." />}
              {!loading && !tasks.length && <EmptyText text="还没有任务，先添加一个。" />}
              {!!tasks.length && (
                <>
                  <TaskSection title="待完成" count={pendingTasks.length}>
                    {pendingTasks.length ? pendingTasks.map(renderTaskRow) : <EmptyText text="今天的任务都完成了。" />}
                  </TaskSection>
                  <TaskSection title="已完成" count={completedTasks.length} muted>
                    {completedTasks.length ? completedTasks.map(renderTaskRow) : <EmptyText text="完成后会沉到这里。" />}
                  </TaskSection>
                </>
              )}
            </div>
          </Panel>

          <div className="grid content-start gap-2.5">
            <Panel
              title="睡眠"
              icon={<Moon size={17} />}
              action={
                <button className="icon-button h-8 w-8" aria-label="编辑睡眠" type="button" onClick={() => setSleepModalOpen(true)}>
                  <Pencil size={14} />
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-2">
                <Metric label="时长" value={sleep ? `${(sleep.durationMinutes / 60).toFixed(1)}h` : "0h"} />
                <Metric label="质量" value={sleep?.qualityScore ? `${sleep.qualityScore}/5` : "-/5"} />
              </div>
              <p className="mt-2 truncate text-[11px] text-soft">{sleep ? `${timeText(sleep.sleepStart)} - ${timeText(sleep.wakeTime)}` : "还没有睡眠记录"}</p>
            </Panel>

            <Panel title="喝水" icon={<Droplets size={17} />}>
              <WaterTracker water={water} plan={waterPlan} onCupClick={saveWaterCups} />
            </Panel>

            <Panel title="影视陪伴" icon={<Clapperboard size={17} />}>
              <form className="space-y-2" onSubmit={saveMediaWatch}>
                <input className="field" placeholder="今天在看什么剧/电影" value={mediaTitle} onChange={(event) => setMediaTitle(event.target.value)} />
                <input className="field" placeholder="集数/进度，比如第 12 集" value={mediaEpisode} onChange={(event) => setMediaEpisode(event.target.value)} />
                <textarea className="journal-input min-h-20" placeholder="一句备注：剧情、氛围、适合搭配什么任务..." value={mediaNote} onChange={(event) => setMediaNote(event.target.value)} />
                <button className="primary-button w-full px-4" type="submit">
                  保存
                </button>
              </form>
            </Panel>

            <Panel title="事件类型" icon={<TimerReset size={17} />}>
              <form className="mb-3 flex gap-2" onSubmit={createCategory}>
                <input className="field min-w-0 flex-1" placeholder="新增类型" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
                <button className="primary-button px-3" type="submit">
                  <Plus size={15} />
                </button>
              </form>
              <div className="category-list">
                {!categories.length && <EmptyText text="还没有任务类型。" />}
                {categories.map((item) => {
                  const hours = item.totalMinutes / 60;
                  const percent = Math.min(100, Math.round((item.totalMinutes / item.targetMinutes) * 100));
                  return (
                    <div className="category-row" key={item.id}>
                      <CategoryTag category={item} />
                      <div className="min-w-0 flex-1">
                        <div className="h-2 rounded-full bg-white/80">
                          <div className="progress-fill" style={{ width: `${percent}%`, backgroundColor: item.color }} />
                        </div>
                      </div>
                      <span className="w-10 shrink-0 text-right text-[11px] text-soft">{hours.toFixed(1)}h</span>
                      <button className="icon-button h-7 w-7 shrink-0" aria-label={`编辑${item.name}`} onClick={() => openCategoryEditor(item)}>
                        <Pencil size={13} />
                      </button>
                      <button className="icon-button h-7 w-7 shrink-0" aria-label={`删除${item.name}`} onClick={() => deleteCategory(item)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel
              title="晨写"
              icon={<SunMedium size={17} />}
              action={
                <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" onClick={() => setWritingModal("morning")}>
                  <Pencil size={13} />
                  展开写
                </button>
              }
            >
              <form className="space-y-2" onSubmit={saveMorningWriting}>
                <textarea className="journal-input min-h-24" placeholder="早上先写几句：醒来想到什么、今天想把注意力放在哪里..." value={morningContent} onChange={(event) => setMorningContent(event.target.value)} />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select className="field" value={morningMoodScore} onChange={(event) => setMorningMoodScore(event.target.value)}>
                    <ScoreOptions items={MORNING_STATE_OPTIONS} />
                  </select>
                  <button className="primary-button px-4" type="submit">
                    保存
                  </button>
                </div>
              </form>
            </Panel>

            <Panel
              title="睡前日记"
              icon={<BookOpenText size={17} />}
              action={
                <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" onClick={() => setWritingModal("journal")}>
                  <Pencil size={13} />
                  展开写
                </button>
              }
            >
              <form className="space-y-2" onSubmit={saveJournal}>
                <textarea className="journal-input" placeholder="睡前简单写几句：今天发生了什么、感谢什么、明天最重要的一件事..." value={journalContent} onChange={(event) => setJournalContent(event.target.value)} />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select className="field" value={journalMoodScore} onChange={(event) => setJournalMoodScore(event.target.value)}>
                    <ScoreOptions items={JOURNAL_STATE_OPTIONS} />
                  </select>
                  <button className="primary-button px-4" type="submit">
                    保存
                  </button>
                </div>
              </form>
            </Panel>

            <Panel
              title="股市复盘"
              icon={<TrendingUp size={17} />}
              action={
                <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" onClick={() => setWritingModal("review")}>
                  <Pencil size={13} />
                  展开写
                </button>
              }
            >
              <form className="space-y-2" onSubmit={saveStockReview}>
                {reviewRecord ? (
                  <>
                    <p className="text-xs text-soft">今天的复盘已记录</p>
                    <p className="max-h-20 overflow-hidden text-sm leading-6 text-ink">{reviewRecord.marketSummary || reviewRecord.operations || reviewRecord.holdingsReview || reviewRecord.mistakes || reviewRecord.tomorrowPlan || "这一天还没有写复盘。"}</p>
                    <div className="flex flex-wrap gap-2 text-[11px] text-soft">
                      <span className="badge-gray">{reviewRecord.emotionScore ? `心情 ${reviewRecord.emotionScore}` : "心情 -"}</span>
                      <span className="badge-gray">{reviewRecord.disciplineScore ? `纪律 ${reviewRecord.disciplineScore}` : "纪律 -"}</span>
                      <span className="badge-gray">{reviewRecord.tags?.trim() || "无标签"}</span>
                    </div>
                  </>
                ) : (
                  <EmptyText text="今天还没有写复盘。" />
                )}
                <textarea className="journal-input min-h-20" placeholder="一句话复盘：今天市场/交易最重要的结论..." value={reviewMarketSummary} onChange={(event) => setReviewMarketSummary(event.target.value)} />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button className="icon-button w-full px-4" type="button" onClick={() => setPageMode("history")}>
                    回看
                  </button>
                  <button className="primary-button px-4" type="submit">
                    保存
                  </button>
                </div>
              </form>
            </Panel>
          </div>
        </section>
        ) : (
          <HistoryPage
            selectedDate={selectedDate}
            onBack={() => setPageMode("workspace")}
            archiveTab={archiveTab}
            sleepRange={sleepRange}
            morningContent={morningContent}
            morningMoodScore={morningMoodScore}
            morningArchive={morningArchive}
            journalArchive={journalArchive}
            reviewArchive={reviewArchive}
            mediaArchive={mediaArchive}
            journalContent={journalContent}
            journalMoodScore={journalMoodScore}
            reviewMarketSummary={reviewMarketSummary}
            reviewOperations={reviewOperations}
            reviewHoldingsReview={reviewHoldingsReview}
            reviewMistakes={reviewMistakes}
            reviewTomorrowPlan={reviewTomorrowPlan}
            reviewEmotionScore={reviewEmotionScore}
            reviewDisciplineScore={reviewDisciplineScore}
            reviewTags={reviewTags}
            loading={loading}
            stats={stats}
            sleep={sleep ?? null}
            timeBreakdown={timeBreakdown}
            pieTotalMinutes={pieTotalMinutes}
            weeklySeries={weeklySeries}
            monthlySleepSeries={monthlySleepSeries}
            sleepChartSeries={sleepChartSeries}
            actualMinutes={actualMinutes}
            plannedCount={plannedCount}
            onArchiveTabChange={setArchiveTab}
            onSleepRangeChange={setSleepRange}
            onMorningSave={saveMorningWriting}
            onMorningContentChange={setMorningContent}
            onMorningMoodScoreChange={setMorningMoodScore}
            onJournalSave={saveJournal}
            onReviewSave={saveStockReview}
            onJournalContentChange={setJournalContent}
            onJournalMoodScoreChange={setJournalMoodScore}
            onReviewMarketSummaryChange={setReviewMarketSummary}
            onReviewOperationsChange={setReviewOperations}
            onReviewHoldingsReviewChange={setReviewHoldingsReview}
            onReviewMistakesChange={setReviewMistakes}
            onReviewTomorrowPlanChange={setReviewTomorrowPlan}
            onReviewEmotionScoreChange={setReviewEmotionScore}
            onReviewDisciplineScoreChange={setReviewDisciplineScore}
            onReviewTagsChange={setReviewTags}
            onOpenWritingModal={setWritingModal}
          />
        )}
      </div>

      {editingTask && (
        <TaskTitleEditModal
          title={editTaskTitle}
          onTitleChange={setEditTaskTitle}
          onClose={() => {
            setEditingTask(null);
            setEditTaskTitle("");
          }}
          onSubmit={saveTaskTitle}
        />
      )}

      {scheduleModalOpen && (
        <TimeBlockModal
          categories={categories}
          tasks={tasks}
          taskCategoryId={taskCategoryId}
          scheduleTaskId={scheduleTaskId}
          scheduleKind={scheduleKind}
          scheduleTitle={scheduleTitle}
          scheduleNote={scheduleNote}
          scheduleStart={scheduleStart}
          scheduleEnd={scheduleEnd}
          onCategoryChange={setTaskCategoryId}
          onTaskChange={setScheduleTaskId}
          onKindChange={setScheduleKind}
          onTitleChange={setScheduleTitle}
          onNoteChange={setScheduleNote}
          onStartChange={setScheduleStart}
          onEndChange={setScheduleEnd}
          onClose={() => setScheduleModalOpen(false)}
          onSubmit={createSchedule}
        />
      )}

      {finishTimerModalOpen && (
        <FinishTimerModal
          taskTitle={activeTask?.title ?? "当前任务"}
          scheduleDate={finishTimerDate}
          startTime={finishTimerStart}
          endTime={finishTimerEnd}
          onDateChange={setFinishTimerDate}
          onStartChange={setFinishTimerStart}
          onEndChange={setFinishTimerEnd}
          onClose={() => setFinishTimerModalOpen(false)}
          onSubmit={finishTimer}
        />
      )}

      {sleepModalOpen && (
        <SleepEditModal
          sleepStart={sleepStart}
          wakeTime={wakeTime}
          qualityScore={qualityScore}
          onSleepStartChange={setSleepStart}
          onWakeTimeChange={setWakeTime}
          onQualityScoreChange={setQualityScore}
          onClose={() => setSleepModalOpen(false)}
          onSubmit={saveSleep}
        />
      )}

      {editingCategory && (
        <CategoryEditModal
          name={editCategoryName}
          color={editCategoryColor}
          targetHours={editCategoryTargetHours}
          onNameChange={setEditCategoryName}
          onTargetHoursChange={setEditCategoryTargetHours}
          onClose={() => setEditingCategory(null)}
          onSubmit={updateCategory}
        />
      )}

      {writingModal === "morning" && (
        <WritingModal title={`晨写 · ${formatDayLabel(selectedDate)}`} onClose={() => setWritingModal(null)} onSubmit={saveMorningWriting}>
          <textarea className="writing-textarea" placeholder="早上先写几句：醒来想到什么、今天想把注意力放在哪里..." value={morningContent} onChange={(event) => setMorningContent(event.target.value)} />
          <select className="field" value={morningMoodScore} onChange={(event) => setMorningMoodScore(event.target.value)}>
            <ScoreOptions items={MORNING_STATE_OPTIONS} />
          </select>
        </WritingModal>
      )}

      {writingModal === "journal" && (
        <WritingModal title={`睡前日记 · ${formatDayLabel(selectedDate)}`} onClose={() => setWritingModal(null)} onSubmit={saveJournal}>
          <textarea className="writing-textarea" placeholder="睡前慢慢写：今天发生了什么、感谢什么、明天最重要的一件事..." value={journalContent} onChange={(event) => setJournalContent(event.target.value)} />
          <select className="field" value={journalMoodScore} onChange={(event) => setJournalMoodScore(event.target.value)}>
            <ScoreOptions items={JOURNAL_STATE_OPTIONS} />
          </select>
        </WritingModal>
      )}

      {writingModal === "review" && (
        <WritingModal title={`股市复盘 · ${formatDayLabel(selectedDate)}`} onClose={() => setWritingModal(null)} onSubmit={saveStockReview}>
          <textarea className="writing-textarea min-h-[220px]" placeholder="今天的大盘和最重要的结论..." value={reviewMarketSummary} onChange={(event) => setReviewMarketSummary(event.target.value)} />
          <div className="grid gap-2 md:grid-cols-2">
            <textarea className="journal-input min-h-32 resize-y" placeholder="操作记录..." value={reviewOperations} onChange={(event) => setReviewOperations(event.target.value)} />
            <textarea className="journal-input min-h-32 resize-y" placeholder="持仓观察..." value={reviewHoldingsReview} onChange={(event) => setReviewHoldingsReview(event.target.value)} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <textarea className="journal-input min-h-32 resize-y" placeholder="错误复盘..." value={reviewMistakes} onChange={(event) => setReviewMistakes(event.target.value)} />
            <textarea className="journal-input min-h-32 resize-y" placeholder="明日计划..." value={reviewTomorrowPlan} onChange={(event) => setReviewTomorrowPlan(event.target.value)} />
          </div>
          <div className="grid gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,1.4fr)]">
            <select className="field" value={reviewEmotionScore} onChange={(event) => setReviewEmotionScore(event.target.value)}>
              <option value="5">心情 5</option>
              <option value="4">心情 4</option>
              <option value="3">心情 3</option>
              <option value="2">心情 2</option>
              <option value="1">心情 1</option>
            </select>
            <select className="field" value={reviewDisciplineScore} onChange={(event) => setReviewDisciplineScore(event.target.value)}>
              <option value="5">纪律 5</option>
              <option value="4">纪律 4</option>
              <option value="3">纪律 3</option>
              <option value="2">纪律 2</option>
              <option value="1">纪律 1</option>
            </select>
            <input className="field" placeholder="标签，用逗号分隔" value={reviewTags} onChange={(event) => setReviewTags(event.target.value)} />
          </div>
        </WritingModal>
      )}

      {completionTask && (
        <CompletionModal
          task={completionTask}
          note={completionNote}
          scheduleDate={finishTimerDate}
          startTime={finishTimerStart}
          endTime={finishTimerEnd}
          onNoteChange={setCompletionNote}
          onDateChange={setFinishTimerDate}
          onStartChange={setFinishTimerStart}
          onEndChange={setFinishTimerEnd}
          onClose={() => {
            setCompletionTask(null);
            setCompletionNote("");
          }}
          onSubmit={saveCompletionReflection}
        />
      )}
    </main>
  );
}

function AuthPage({
  mode,
  username,
  displayName,
  password,
  error,
  onModeChange,
  onUsernameChange,
  onDisplayNameChange,
  onPasswordChange,
  onSubmit
}: {
  mode: AuthMode;
  username: string;
  displayName: string;
  password: string;
  error: string;
  onModeChange: (mode: AuthMode) => void;
  onUsernameChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const isRegister = mode === "register";

  return (
    <main className="page-shell min-h-screen p-4 text-ink">
      <div className="mx-auto grid min-h-[calc(100vh-32px)] max-w-5xl items-center gap-4 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <p className="text-xs font-semibold text-mint-700">Personal Workbench</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight">同一套记录，多端实时同步</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-soft">每个人都有独立账号和独立数据。登录后，任务、时间轴、睡眠、喝水、晨写、日记和复盘都会保存到服务器数据库。</p>
          <div className="mt-5 grid max-w-xl grid-cols-3 gap-2">
            <MiniStat label="数据" value="隔离" />
            <MiniStat label="同步" value="多端" />
            <MiniStat label="部署" value="自有服务器" />
          </div>
        </section>

        <form className="glass-panel p-5" onSubmit={onSubmit}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-soft">欢迎回来</p>
              <h2 className="text-xl font-bold">{isRegister ? "创建账号" : "登录工作台"}</h2>
            </div>
            <div className="inline-flex rounded-full border border-white/80 bg-white/70 p-0.5">
              <button className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${!isRegister ? "bg-mint-500 text-white" : "text-soft hover:text-ink"}`} type="button" onClick={() => onModeChange("login")}>
                登录
              </button>
              <button className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${isRegister ? "bg-pink-400 text-white" : "text-soft hover:text-ink"}`} type="button" onClick={() => onModeChange("register")}>
                注册
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <input className="field" autoComplete="username" placeholder="用户名" value={username} onChange={(event) => onUsernameChange(event.target.value)} />
            {isRegister && <input className="field" autoComplete="name" placeholder="显示昵称" value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} />}
            <input className="field" autoComplete={isRegister ? "new-password" : "current-password"} placeholder="密码" type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
          </div>

          {error && <div className="mt-3 rounded-card border border-pink-200 bg-pink-50/80 p-2 text-xs text-pink-500">{error}</div>}

          <button className="primary-button mt-4 w-full" type="submit">
            {isRegister ? "注册并进入" : "登录"}
          </button>
          {!isRegister && <p className="mt-3 text-center text-[11px] text-soft">默认账号：sip / workbench123456</p>}
        </form>
      </div>
    </main>
  );
}

function Panel({ title, icon, children, className = "", action }: { title: string; icon: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`glass-panel p-3 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-mint-700">{icon}</span>
          <h2 className="section-title">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function WritingModal({ title, children, onClose, onSubmit }: { title: string; children: ReactNode; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="writing-modal" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-soft">大空间写作</p>
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="writing-body space-y-2">{children}</div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function ScoreOptions({ items }: { items: readonly { value: string; label: string }[] }) {
  return (
    <>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </>
  );
}

function WaterTracker({ water, plan, onCupClick }: { water: WaterRecord; plan: HydrationPlan; onCupClick: (cups: number) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-soft">
          <span>{water.cups}/{water.targetCups} 杯</span>
          <span>{plan.statusText}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full border border-white/80 bg-white/70">
          <div className={`h-full rounded-full transition-all duration-500 ${plan.percent >= 100 ? "bg-mint-500" : "bg-pink-300"}`} style={{ width: `${plan.percent}%` }} />
        </div>
        <div className="mt-1.5 space-y-0.5 text-[10px] leading-4 text-soft">
          <p>{plan.lastDrinkText}</p>
          <p>{plan.rhythmText}</p>
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {Array.from({ length: 8 }, (_, index) => {
          const filled = index < water.cups;
          return (
            <button
              className={`flex h-8 items-end justify-center rounded-card border transition hover:-translate-y-0.5 ${filled ? "border-mint-300 bg-mint-100 text-mint-700" : "border-white/80 bg-white/60 text-soft"}`}
              key={index}
              type="button"
              title={`标记到第 ${index + 1} 杯`}
              onClick={() => onCupClick(index + 1)}
            >
              <span className={`mb-1 h-4 w-3 rounded-b-full border ${filled ? "border-mint-500 bg-mint-500/70" : "border-soft/40"}`} />
            </button>
          );
        })}
      </div>
      <button className="w-full text-[11px] text-soft transition hover:text-pink-500" type="button" onClick={() => onCupClick(Math.max(0, water.cups - 1))}>
        点错了，退一杯
      </button>
    </div>
  );
}

function ArchiveList(props: {
  activeTab: ArchiveTab;
  morningItems: MorningWritingRecord[];
  journalItems: JournalRecord[];
  reviewItems: StockReviewRecord[];
  mediaItems: MediaWatchRecord[];
  onTabChange: (value: ArchiveTab) => void;
}) {
  const items =
    props.activeTab === "morning"
      ? props.morningItems.map((item) => ({ id: item.id ?? item.writingDate, date: item.writingDate, title: "晨写", content: item.content, score: item.moodScore }))
      : props.activeTab === "journal"
        ? props.journalItems.map((item) => ({ id: item.id, date: item.journalDate, title: "睡前日记", content: item.content, score: item.moodScore }))
        : props.activeTab === "review"
          ? props.reviewItems.map((item) => ({
              id: item.id,
              date: item.reviewDate,
              title: item.tags?.trim() || "股市复盘",
              content: item.marketSummary || item.operations || item.holdingsReview || item.mistakes || item.tomorrowPlan,
              score: item.disciplineScore
            }))
          : props.mediaItems.map((item) => ({
              id: item.id ?? item.watchDate,
              date: item.watchDate,
              title: item.title?.trim() || "影视陪伴",
              content: [item.episode, item.note].filter(Boolean).join(" · "),
              score: null
            }));

  return (
    <div>
      <div className="mb-3 inline-flex rounded-full border border-white/80 bg-white/70 p-0.5">
        {[
          ["morning", "晨写"],
          ["journal", "日记"],
          ["review", "复盘"],
          ["media", "影视"]
        ].map(([value, label]) => (
          <button
            className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${props.activeTab === value ? "bg-mint-500 text-white" : "text-soft hover:text-ink"}`}
            key={value}
            type="button"
            onClick={() => props.onTabChange(value as ArchiveTab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        {!items.length && <EmptyText text="还没有记录。" />}
        {items.map((item) => (
          <article className="rounded-card border border-white/70 bg-white/60 p-3 transition hover:bg-white/90" key={item.id}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="truncate text-[13px] font-semibold text-ink">{item.title}</h3>
              <span className="shrink-0 text-[11px] text-soft">{formatDayLabel(item.date)}</span>
            </div>
            <p className="line-clamp-2 text-xs leading-5 text-soft">{item.content?.trim() || "这天还没写内容。"}</p>
            {item.score && <p className="mt-2 text-[11px] text-mint-700">评分 {item.score}/5</p>}
          </article>
        ))}
      </div>
    </div>
  );
}

function TaskTitleEditModal(props: { title: string; onTitleChange: (value: string) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">修改任务标题</h3>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>

        <input className="field" autoFocus maxLength={200} placeholder="任务标题" value={props.title} onChange={(event) => props.onTitleChange(event.target.value)} />

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function TimeBlockModal(props: {
  categories: Category[];
  tasks: Task[];
  taskCategoryId: string;
  scheduleTaskId: string;
  scheduleKind: string;
  scheduleTitle: string;
  scheduleNote: string;
  scheduleStart: string;
  scheduleEnd: string;
  onCategoryChange: (value: string) => void;
  onTaskChange: (value: string) => void;
  onKindChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">记录时间块</h3>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_96px] gap-2">
          <select className="field" value={props.scheduleTaskId} onChange={(event) => props.onTaskChange(event.target.value)}>
            <option value="">不关联任务</option>
            {props.tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
          <select className="field" value={props.scheduleKind} onChange={(event) => props.onKindChange(event.target.value)}>
            <option value="1">实际</option>
            <option value="0">安排</option>
          </select>
        </div>

        {!props.scheduleTaskId && (
          <div className="mt-2 grid grid-cols-[1fr_128px] gap-2">
            <input className="field" placeholder="这段时间做了什么" value={props.scheduleTitle} onChange={(event) => props.onTitleChange(event.target.value)} />
            <select className="field" value={props.taskCategoryId} onChange={(event) => props.onCategoryChange(event.target.value)}>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-soft">
            开始
            <input className="field mt-1" type="time" value={props.scheduleStart} onChange={(event) => props.onStartChange(event.target.value)} />
          </label>
          <label className="text-[11px] text-soft">
            结束
            <input className="field mt-1" type="time" value={props.scheduleEnd} onChange={(event) => props.onEndChange(event.target.value)} />
          </label>
        </div>

        <input className="field mt-2" placeholder="备注，可不填" value={props.scheduleNote} onChange={(event) => props.onNoteChange(event.target.value)} />

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function SleepEditModal(props: {
  sleepStart: string;
  wakeTime: string;
  qualityScore: string;
  onSleepStartChange: (value: string) => void;
  onWakeTimeChange: (value: string) => void;
  onQualityScoreChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">编辑睡眠</h3>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-soft">
            入睡
            <input className="field mt-1" type="time" value={props.sleepStart} onChange={(event) => props.onSleepStartChange(event.target.value)} />
          </label>
          <label className="text-[11px] text-soft">
            起床
            <input className="field mt-1" type="time" value={props.wakeTime} onChange={(event) => props.onWakeTimeChange(event.target.value)} />
          </label>
        </div>

        <select className="field mt-2" value={props.qualityScore} onChange={(event) => props.onQualityScoreChange(event.target.value)}>
          <option value="5">质量 5</option>
          <option value="4">质量 4</option>
          <option value="3">质量 3</option>
          <option value="2">质量 2</option>
          <option value="1">质量 1</option>
        </select>

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function FinishTimerModal(props: {
  taskTitle: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  onDateChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-mint-700">结束计时</p>
            <h3 className="text-sm font-semibold">{props.taskTitle}</h3>
            <p className="mt-1 text-[11px] text-soft">确认这段实际投入时间，会写入小时记录。</p>
          </div>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>

        <label className="text-[11px] text-soft">
          日期
          <input className="field mt-1" type="date" value={props.scheduleDate} onChange={(event) => props.onDateChange(event.target.value)} />
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-soft">
            开始
            <input className="field mt-1" type="time" value={props.startTime} onChange={(event) => props.onStartChange(event.target.value)} />
          </label>
          <label className="text-[11px] text-soft">
            结束
            <input className="field mt-1" type="time" value={props.endTime} onChange={(event) => props.onEndChange(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            写入时间轴
          </button>
        </div>
      </form>
    </div>
  );
}

function CategoryEditModal(props: {
  name: string;
  color: string;
  targetHours: string;
  onNameChange: (value: string) => void;
  onTargetHoursChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">编辑类型</h3>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>

        <label className="text-[11px] text-soft">
          名称
          <input className="field mt-1" value={props.name} onChange={(event) => props.onNameChange(event.target.value)} />
        </label>

        <div className="mt-2 grid grid-cols-[auto_1fr] items-end gap-2">
          <div>
            <p className="mb-1 text-[11px] text-soft">颜色</p>
            <CategoryTag category={{ id: 0, name: props.name || "类型预览", color: props.color, targetMinutes: 6000, totalMinutes: 0 }} />
          </div>
          <label className="text-[11px] text-soft">
            目标小时
            <input className="field mt-1" min="1" type="number" value={props.targetHours} onChange={(event) => props.onTargetHoursChange(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function CompletionModal(props: {
  task: Task;
  note: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  onNoteChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <form className="time-modal max-w-[560px]" onSubmit={props.onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-mint-700">任务完成了</p>
            <h3 className="text-sm font-semibold">{props.task.title}</h3>
            <p className="mt-1 text-[11px] text-soft">确认实际完成时段，也可以给自己留一句感想。</p>
          </div>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>

        <label className="text-[11px] text-soft">
          日期
          <input className="field mt-1" type="date" value={props.scheduleDate} onChange={(event) => props.onDateChange(event.target.value)} />
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-soft">
            开始
            <input className="field mt-1" type="time" value={props.startTime} onChange={(event) => props.onStartChange(event.target.value)} />
          </label>
          <label className="text-[11px] text-soft">
            结束
            <input className="field mt-1" type="time" value={props.endTime} onChange={(event) => props.onEndChange(event.target.value)} />
          </label>
        </div>

        <textarea className="journal-input mt-2 min-h-28" placeholder="刚刚完成后的感想..." value={props.note} onChange={(event) => props.onNoteChange(event.target.value)} />

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            完成并写入时间轴
          </button>
        </div>
      </form>
    </div>
  );
}

function CategoryTag({ category }: { category: Category }) {
  return (
    <span className="category-tag" style={{ backgroundColor: `${category.color}24`, borderColor: `${category.color}88`, color: category.color }}>
      <i style={{ backgroundColor: category.color }} />
      <span>{category.name}</span>
    </span>
  );
}

function TimelineBoard({ items, onDelete }: { items: TimelineItem[]; onDelete: (id: number) => void }) {
  const dayStart = HOUR_START * 60;
  const dayEnd = HOUR_END * 60;
  const span = dayEnd - dayStart;

  return (
    <div className="timeline-board">
      {timelineHours.map((hour) => {
        const top = ((hour * 60 - dayStart) / span) * 100;
        return (
          <div key={hour} className="timeline-hour" style={{ top: `${top}%` }}>
            <span>{String(hour).padStart(2, "0")}:00</span>
          </div>
        );
      })}

      {items.map((item, index) => {
        const start = Math.max(dayStart, timeToMinutes(item.startTime));
        const end = Math.min(dayEnd, timeToMinutes(item.endTime));
        const top = ((start - dayStart) / span) * 100;
        if (item.marker === "water") {
          return (
            <div key={`water-${item.id}-${item.startTime}`} className="timeline-point timeline-point-water" title={`${item.startTime.slice(0, 5)} · ${item.title}`} style={{ top: `${top}%` }}>
              <span className="timeline-point-dot">
                <Droplets size={12} />
              </span>
              <span className="truncate">{`${item.startTime.slice(0, 5)} ${item.title}`}</span>
            </div>
          );
        }
        const minutes = durationMinutes(item);
        const height = Math.max(2.8, ((end - start) / span) * 100);
        const short = minutes < 15;
        const planned = item.kind === 0;
        return (
          <div
            key={item.id}
            className={`timeline-block ${short ? "timeline-block-short" : ""} ${planned ? "timeline-block-planned" : "timeline-block-actual"}`}
            title={[`${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)} · ${sourceText(item)} · ${formatDuration(minutes)}`, item.title, item.note ? `备注：${item.note}` : ""].filter(Boolean).join("\n")}
            style={{
              top: `${top}%`,
              height: `max(${height}%, ${short ? 28 : 34}px)`,
              borderColor: item.color,
              left: planned ? "58px" : `${92 + (short ? index % 2 : 1) * 12}px`,
              right: planned ? "48%" : "8px"
            }}
          >
            <div className="min-w-0">
              <p className="timeline-block-title">{item.title}</p>
              <p className="timeline-block-meta">{`${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)} · ${sourceText(item)} · ${formatDuration(minutes)}`}</p>
            </div>
            <button className="timeline-delete" aria-label="删除时间记录" onClick={() => onDelete(item.id)}>
              <Trash2 size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function sourceText(item: Schedule) {
  if (item.kind === 0) return "安排";
  if (item.source === 1) return "计时";
  return "实际";
}

function TaskCategoryTabs(props: {
  categories: Category[];
  active: TaskCategoryFilter;
  allCount: number;
  uncategorizedCount: number;
  categoryCounts: Map<number, number>;
  onChange: (value: TaskCategoryFilter) => void;
}) {
  return (
    <div className="task-tabs" aria-label="任务类型筛选">
      <button className={`task-tab ${props.active === "all" ? "task-tab-active" : ""}`} type="button" onClick={() => props.onChange("all")}>
        全部 <span>{props.allCount}</span>
      </button>
      {props.categories.map((category) => (
        <button className={`task-tab ${props.active === String(category.id) ? "task-tab-active" : ""}`} type="button" key={category.id} onClick={() => props.onChange(String(category.id))}>
          <i style={{ backgroundColor: category.color }} />
          {category.name}
          <span>{props.categoryCounts.get(category.id) ?? 0}</span>
        </button>
      ))}
      {!!props.uncategorizedCount && (
        <button className={`task-tab ${props.active === "none" ? "task-tab-active" : ""}`} type="button" onClick={() => props.onChange("none")}>
          未分类 <span>{props.uncategorizedCount}</span>
        </button>
      )}
    </div>
  );
}

function TaskSection(props: { title: string; count: number; children: ReactNode; muted?: boolean }) {
  return (
    <section className={`task-section ${props.muted ? "task-section-muted" : ""}`}>
      <div className="task-section-head">
        <span>{props.title}</span>
        <span className="badge-gray">{props.count}</span>
      </div>
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}

function TaskRow(props: {
  task: Task;
  category: Category | null;
  categories: Category[];
  plannedSchedule: Schedule | null;
  active: boolean;
  activeStartedAt?: string;
  disabled: boolean;
  dragging: boolean;
  dragOver: boolean;
  onDone: () => void;
  onPinned: () => void;
  onCategoryChange: (categoryId: number | null) => void;
  onTitleEdit: () => void;
  onStart: () => void;
  onPause: () => void;
  onFinish: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const { task, category, categories, plannedSchedule, active, activeStartedAt, disabled, dragging, dragOver, onDone, onPinned, onCategoryChange, onTitleEdit, onStart, onPause, onFinish, onDelete, onDragStart, onDragEnter, onDragEnd, onDrop } = props;
  return (
    <div
      className={`task-row ${active ? "task-row-active" : ""} ${dragging ? "task-row-dragging" : ""} ${dragOver ? "task-row-drop" : ""}`}
      onDragEnd={onDragEnd}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="drag-handle"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(task.id));
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          title="拖拽排序"
        >
          <GripVertical size={16} />
        </span>
        <button className={`shrink-0 ${task.pinned ? "text-pink-500" : "text-soft"}`} aria-label="重要标记" onClick={onPinned}>
          <Star size={17} fill={task.pinned ? "currentColor" : "none"} />
        </button>
        <label className="flex min-w-0 items-center gap-3">
          <input className="h-4 w-4 accent-mint-500" type="checkbox" checked={task.status === 2} onChange={onDone} />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`task-title ${task.status === 2 ? "text-soft line-through" : ""}`}>{task.title}</span>
                {category && <CategoryTag category={category} />}
              </span>
              <span className="task-meta">{plannedSchedule ? `${plannedSchedule.startTime.slice(0, 5)}-${plannedSchedule.endTime.slice(0, 5)} · 安排` : "未安排时段"}</span>
              {task.status === 2 && task.completionNote?.trim() && <span className="task-meta" title={task.completionNote}>感想：{task.completionNote}</span>}
            </span>
          </label>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {active && <span className="timer-pill">{elapsedText(activeStartedAt)}</span>}
        <button className="icon-button h-8 w-8" aria-label="修改任务标题" title="修改任务标题" onClick={onTitleEdit}>
          <Pencil size={14} />
        </button>
        <select className="task-category-picker" aria-label="修改事件类型" value={task.categoryId ?? ""} onChange={(event) => onCategoryChange(event.target.value ? Number(event.target.value) : null)}>
          <option value="">未分类</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {active ? (
          <>
            <button className="icon-button" aria-label="暂停并计入时间轴" title="暂停并计入时间轴" onClick={onPause}>
              <Pause size={17} />
            </button>
            <button className="icon-button" aria-label="结束并计入时间轴" title="结束并计入时间轴" onClick={onFinish}>
              <Square size={17} />
            </button>
          </>
        ) : (
          <button className="icon-button" aria-label="开始计时" disabled={disabled} onClick={onStart}>
            <Play size={17} />
          </button>
        )}
        <button className="icon-button" aria-label="删除任务" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <p className="text-[11px] text-soft">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-stat">
      <p className="text-[11px] text-soft">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{text}</p>;
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00+08:00`));
}

function HistoryPage(props: {
  selectedDate: string;
  onBack: () => void;
  archiveTab: ArchiveTab;
  sleepRange: SleepRange;
  stats: Dashboard["weeklyStats"] | undefined;
  sleep: SleepRecord | null;
  weeklySeries: WeeklySeriesItem[];
  monthlySleepSeries: SleepSeriesItem[];
  sleepChartSeries: SleepSeriesItem[];
  actualMinutes: number;
  plannedCount: number;
  timeBreakdown: Array<{ id: number; name: string; color: string; minutes: number }>;
  pieTotalMinutes: number;
  morningContent: string;
  morningMoodScore: string;
  morningArchive: MorningWritingRecord[];
  journalArchive: JournalRecord[];
  reviewArchive: StockReviewRecord[];
  mediaArchive: MediaWatchRecord[];
  journalContent: string;
  journalMoodScore: string;
  reviewMarketSummary: string;
  reviewOperations: string;
  reviewHoldingsReview: string;
  reviewMistakes: string;
  reviewTomorrowPlan: string;
  reviewEmotionScore: string;
  reviewDisciplineScore: string;
  reviewTags: string;
  loading: boolean;
  onArchiveTabChange: (value: ArchiveTab) => void;
  onSleepRangeChange: (value: SleepRange) => void;
  onMorningSave: (event: FormEvent) => void;
  onMorningContentChange: (value: string) => void;
  onMorningMoodScoreChange: (value: string) => void;
  onJournalSave: (event: FormEvent) => void;
  onReviewSave: (event: FormEvent) => void;
  onJournalContentChange: (value: string) => void;
  onJournalMoodScoreChange: (value: string) => void;
  onReviewMarketSummaryChange: (value: string) => void;
  onReviewOperationsChange: (value: string) => void;
  onReviewHoldingsReviewChange: (value: string) => void;
  onReviewMistakesChange: (value: string) => void;
  onReviewTomorrowPlanChange: (value: string) => void;
  onReviewEmotionScoreChange: (value: string) => void;
  onReviewDisciplineScoreChange: (value: string) => void;
  onReviewTagsChange: (value: string) => void;
  onOpenWritingModal: (value: WritingModalKind) => void;
}) {
  return (
    <section className="grid gap-2.5 xl:grid-cols-[minmax(0,1.16fr)_340px]">
      <div className="grid gap-2.5">
        <Panel
          title="全部记录"
          icon={<ListFilter size={17} />}
          action={<button className="icon-button h-8 w-auto px-3 text-[11px]" type="button" onClick={props.onBack}>回工作台</button>}
        >
          <ArchiveList
            activeTab={props.archiveTab}
            morningItems={props.morningArchive}
            journalItems={props.journalArchive}
            reviewItems={props.reviewArchive}
            mediaItems={props.mediaArchive}
            onTabChange={props.onArchiveTabChange}
          />
        </Panel>

        <Panel
          title={`晨写 · ${formatDayLabel(props.selectedDate)}`}
          icon={<SunMedium size={17} />}
          action={
            <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" onClick={() => props.onOpenWritingModal("morning")}>
              <Pencil size={13} />
              展开写
            </button>
          }
        >
          <form className="space-y-2" onSubmit={props.onMorningSave}>
            <textarea className="journal-input" placeholder="早上先写几句：醒来想到什么、今天想把注意力放在哪里..." value={props.morningContent} onChange={(event) => props.onMorningContentChange(event.target.value)} />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select className="field" value={props.morningMoodScore} onChange={(event) => props.onMorningMoodScoreChange(event.target.value)}>
                <ScoreOptions items={MORNING_STATE_OPTIONS} />
              </select>
              <button className="primary-button px-4" type="submit">
                保存
              </button>
            </div>
          </form>
        </Panel>

        <Panel
          title={`睡前日记 · ${formatDayLabel(props.selectedDate)}`}
          icon={<BookOpenText size={17} />}
          action={
            <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" onClick={() => props.onOpenWritingModal("journal")}>
              <Pencil size={13} />
              展开写
            </button>
          }
        >
          <p className="mb-2 text-[11px] text-soft">{props.loading ? "加载中..." : "可随时回看和编辑当天内容。"}</p>
          <form className="space-y-2" onSubmit={props.onJournalSave}>
            <textarea className="journal-input" placeholder="睡前简单写几句：今天发生了什么、感谢什么、明天最重要的一件事..." value={props.journalContent} onChange={(event) => props.onJournalContentChange(event.target.value)} />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select className="field" value={props.journalMoodScore} onChange={(event) => props.onJournalMoodScoreChange(event.target.value)}>
                <ScoreOptions items={JOURNAL_STATE_OPTIONS} />
              </select>
              <button className="primary-button px-4" type="submit">
                保存
              </button>
            </div>
          </form>
        </Panel>

        <Panel
          title={`股市复盘 · ${formatDayLabel(props.selectedDate)}`}
          icon={<TrendingUp size={17} />}
          action={
            <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" onClick={() => props.onOpenWritingModal("review")}>
              <Pencil size={13} />
              展开写
            </button>
          }
        >
          <form className="space-y-2" onSubmit={props.onReviewSave}>
            <textarea className="journal-input min-h-28" placeholder="今天的大盘和最重要的结论..." value={props.reviewMarketSummary} onChange={(event) => props.onReviewMarketSummaryChange(event.target.value)} />
            <div className="grid gap-2 md:grid-cols-2">
              <textarea className="journal-input min-h-24" placeholder="操作记录..." value={props.reviewOperations} onChange={(event) => props.onReviewOperationsChange(event.target.value)} />
              <textarea className="journal-input min-h-24" placeholder="持仓观察..." value={props.reviewHoldingsReview} onChange={(event) => props.onReviewHoldingsReviewChange(event.target.value)} />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <textarea className="journal-input min-h-24" placeholder="错误复盘..." value={props.reviewMistakes} onChange={(event) => props.onReviewMistakesChange(event.target.value)} />
              <textarea className="journal-input min-h-24" placeholder="明日计划..." value={props.reviewTomorrowPlan} onChange={(event) => props.onReviewTomorrowPlanChange(event.target.value)} />
            </div>
            <div className="grid gap-2 md:grid-cols-[repeat(2,minmax(0,1fr))_auto]">
              <select className="field" value={props.reviewEmotionScore} onChange={(event) => props.onReviewEmotionScoreChange(event.target.value)}>
                <option value="5">心情 5</option>
                <option value="4">心情 4</option>
                <option value="3">心情 3</option>
                <option value="2">心情 2</option>
                <option value="1">心情 1</option>
              </select>
              <select className="field" value={props.reviewDisciplineScore} onChange={(event) => props.onReviewDisciplineScoreChange(event.target.value)}>
                <option value="5">纪律 5</option>
                <option value="4">纪律 4</option>
                <option value="3">纪律 3</option>
                <option value="2">纪律 2</option>
                <option value="1">纪律 1</option>
              </select>
              <button className="primary-button px-4" type="submit">
                保存
              </button>
            </div>
            <input className="field" placeholder="标签，用逗号分隔" value={props.reviewTags} onChange={(event) => props.onReviewTagsChange(event.target.value)} />
          </form>
        </Panel>
      </div>

      <div className="grid gap-2.5">
        <Panel title={`时间饼图 · ${formatDayLabel(props.selectedDate)}`} icon={<PieChart size={17} />}>
          <DailyPieChart items={props.timeBreakdown} totalMinutes={props.pieTotalMinutes} />
        </Panel>

        <Panel
          title={props.sleepRange === "week" ? "睡眠柱图 · 周" : "睡眠柱图 · 月"}
          icon={<TrendingUp size={17} />}
          action={
            <div className="inline-flex rounded-full border border-white/80 bg-white/70 p-0.5">
              <button className={`h-7 rounded-full px-2.5 text-[11px] font-semibold ${props.sleepRange === "week" ? "bg-mint-500 text-white" : "text-soft"}`} type="button" onClick={() => props.onSleepRangeChange("week")}>
                周
              </button>
              <button className={`h-7 rounded-full px-2.5 text-[11px] font-semibold ${props.sleepRange === "month" ? "bg-pink-400 text-white" : "text-soft"}`} type="button" onClick={() => props.onSleepRangeChange("month")}>
                月
              </button>
            </div>
          }
        >
          <SleepWeekChart weeklySeries={props.sleepChartSeries} />
        </Panel>

        <Panel title="本周统计" icon={<CalendarDays size={17} />}>
          <div className="grid grid-cols-2 gap-1.5">
            <Metric label="实际" value={formatDuration(props.stats?.totalMinutes ?? 0)} />
            <Metric label="完成" value={`${props.stats?.completedTasks ?? 0}`} />
            <Metric label="日记" value={`${props.stats?.journalDays ?? 0}天`} />
            <Metric label="复盘" value={`${props.stats?.stockReviewDays ?? 0}天`} />
          </div>
          <div className="mt-3 space-y-2">
            {props.weeklySeries.map((item) => (
              <div className="flex items-center justify-between rounded-card bg-white/55 px-3 py-2 text-xs" key={item.date}>
                <span>{formatDayLabel(item.date)}</span>
                <span className="text-soft">{item.sleepMinutes ? `${formatDuration(item.sleepMinutes)} 睡眠` : "无睡眠记录"}</span>
              </div>
            ))}
          </div>
          {props.sleep && <p className="mt-3 text-[11px] text-soft">今天睡眠：{(props.sleep.durationMinutes / 60).toFixed(1)}h · 质量 {props.sleep.qualityScore ?? "-"}/5</p>}
          <p className="mt-1 text-[11px] text-soft">今日记录：{formatDuration(props.actualMinutes)} · 安排 {props.plannedCount} 段</p>
        </Panel>
      </div>
    </section>
  );
}

function DailyPieChart(props: { items: Array<{ id: number; name: string; color: string; minutes: number }>; totalMinutes: number }) {
  if (!props.totalMinutes) {
    return <EmptyText text="今天还没有可统计的时间分布。" />;
  }

  const stroke = 16;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="grid gap-3 md:grid-cols-[160px_1fr] md:items-center">
      <svg viewBox="0 0 120 120" className="mx-auto h-36 w-36">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(53,201,154,0.12)" strokeWidth={stroke} />
        {props.items.map((item) => {
          const length = (item.minutes / props.totalMinutes) * circumference;
          const element = (
            <circle
              key={item.id}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
              strokeLinecap="butt"
            />
          );
          offset += length;
          return element;
        })}
        <text x="60" y="56" textAnchor="middle" className="fill-ink text-[14px] font-semibold">
          {formatDuration(props.totalMinutes)}
        </text>
        <text x="60" y="72" textAnchor="middle" className="fill-soft text-[10px]">
          今日分布
        </text>
      </svg>

      <div className="space-y-2">
        {props.items.map((item) => (
          <div className="flex items-center justify-between gap-2 rounded-card bg-white/55 px-3 py-2 text-xs" key={item.id}>
            <span className="flex min-w-0 items-center gap-2">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="shrink-0 text-soft">{formatDuration(item.minutes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SleepWeekChart(props: { weeklySeries: Array<SleepSeriesItem & Partial<Pick<WeeklySeriesItem, "journalFilled" | "reviewFilled">>> }) {
  if (!props.weeklySeries.length) {
    return <EmptyText text="本周还没有睡眠统计。" />;
  }

  const max = Math.max(1, ...props.weeklySeries.map((item) => item.sleepMinutes));
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {props.weeklySeries.map((item) => {
        const height = Math.max(8, (item.sleepMinutes / max) * 100);
        return (
          <div className="flex flex-col items-center gap-2" key={item.date}>
            <div className="flex h-32 w-full items-end rounded-card border border-white/70 bg-white/50 p-1">
              <div className="w-full rounded-none bg-mint-500/85 transition-all" style={{ height: `${height}%` }} />
            </div>
            <div className="text-center text-[11px]">
              <p>{formatDayLabel(item.date)}</p>
              <p className="text-soft">{formatDuration(item.sleepMinutes)}</p>
            </div>
            {"journalFilled" in item && (
              <div className="flex gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${item.journalFilled ? "bg-pink-400" : "bg-white/60"}`} title="日记" />
                <span className={`h-1.5 w-1.5 rounded-full ${item.reviewFilled ? "bg-mint-500" : "bg-white/60"}`} title="复盘" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
