import {
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock3,
  Coins,
  Droplets,
  Gift,
  GripVertical,
  ListFilter,
  Moon,
  Pause,
  Pencil,
  PieChart,
  Play,
  Plus,
  RefreshCw,
  Scale,
  Sparkles,
  Square,
  Star,
  SunMedium,
  TimerReset,
  Trash2,
  TrendingUp,
  X
} from "lucide-react";
import { createPortal } from "react-dom";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

type ApiResponse<T> = { code: number; message: string; data: T };
type AuthUser = { id: number; username: string; displayName: string };
type AuthPayload = { token: string; user: AuthUser };
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
type DimensionKey = "career" | "creative" | "learning" | "life" | "body" | "social" | "leisure" | "foundation";
type Category = { id: number; name: string; dimensionKey: DimensionKey; color: string; targetMinutes: number; totalMinutes: number };
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
type TimelineItem = Schedule & { marker?: "water" | "sleep" };
type SleepRecord = { id: number; sleepStart: string; wakeTime: string; durationMinutes: number; qualityScore: number | null };
type WaterRecord = { id?: number; waterDate: string; cups: number; targetCups: number; lastDrinkAt?: string | null; drinkTimes?: string | string[] | null };
type MediaWatchRecord = { id?: number; watchDate: string; title: string | null; episode: string | null; note: string | null };
type Growth = { level: number; xpTotal: number; coins: number; xpInLevel: number; xpForNextLevel: number };
type RewardEvent = { id: number; reason: string; xpDelta: number; coinDelta: number; sourceType?: string; sourceId?: string; createdAt: string };
type RewardGrant = { xp: number; coins: number; reason: string };
type RewardItem = { id: number; name: string; cost: number; description: string | null };
type RewardRedemption = { id: number; name: string; cost: number; createdAt: string };
type RewardsPayload = { growth: Growth; items: RewardItem[]; events: RewardEvent[]; redemptions: RewardRedemption[] };
type FeedbackPopupState =
  | { kind: "notice"; title: string; message: string }
  | { kind: "reward"; title: string; message: string; rewards: RewardGrant[] }
  | { kind: "confirm"; title: string; message: string; confirmText: string; onConfirm: () => void | Promise<void> };
type TaskCompleteResult = { id: number; status: number; scheduleId: number; reward: RewardGrant | null };
type TaskCreateResult = { id: number };
type TimerStopResult = { id: number; status: number; durationMinutes: number; rewards: RewardGrant[] };
type AiInsight = {
  id: number;
  sourceType: "morning" | "journal";
  sourceDate: string;
  summary: string | null;
  emotionTags: string | null;
  energyScore: number | null;
  stressKeywords: string | null;
  suggestion: string | null;
  fullText: string | null;
};
type DecisionRecord = {
  id: number;
  decisionDate: string;
  theme: string;
  benefits: string;
  drawbacks: string;
  benefitScore: number;
  drawbackScore: number;
  conclusion: string | null;
  createdAt: string;
};
type PsychologicalBridgeRecord = {
  id: number;
  bridgeDate: string;
  desiredEffect: string;
  resistance: string;
  bridgeText: string;
  nextStep: string | null;
  reassurance: string | null;
  createdAt: string;
};
type DecisionSaveResult = DecisionRecord & { reward: RewardGrant | null };
type BridgeSaveResult = PsychologicalBridgeRecord & { reward: RewardGrant | null };
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

function hasText(value?: string | null) {
  return Boolean((value ?? "").trim());
}

function hasStockReviewContent(review?: StockReviewRecord | null) {
  if (!review) return false;
  return [review.marketSummary, review.operations, review.holdingsReview, review.goodPoints, review.mistakes, review.tomorrowPlan, review.tags].some(hasText);
}

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

type PageMode = "workspace" | "history" | "rewards";
type ArchiveTab = "morning" | "journal" | "review" | "media";
type SleepRange = "week" | "month";
type WritingModalKind = "morning" | "journal" | "review";
type ToolModalKind = "decision" | "bridge";
type TaskCategoryFilter = "all" | "none" | DimensionKey;
type AuthMode = "login" | "register";
type ArchiveListItem = {
  id: string | number;
  date: string;
  title: string;
  content: string | null | undefined;
  score: number | null | undefined;
  sections: Array<{ label: string; value: string | number | null | undefined }>;
};

const AUTH_TOKEN_KEY = "personal_workbench_token";
const HOUR_START = 0;
const HOUR_END = 24;
const COMPRESSED_START_MINUTE = 3 * 60;
const COMPRESSED_END_MINUTE = 7 * 60;
const COMPRESSED_VISUAL_MINUTES = 2 * 60;
const TIMELINE_VISUAL_MINUTES = 24 * 60 - (COMPRESSED_END_MINUTE - COMPRESSED_START_MINUTE) + COMPRESSED_VISUAL_MINUTES;
const CATEGORY_COLORS = ["#5B8DEF", "#FF8FA3", "#35C99A", "#F6A7C6", "#DDD3FF", "#7EC8E3", "#F7C96B", "#9BD67D"];
const CORE_DIMENSIONS = [
  { key: "career", label: "事业力", hint: "主业、产品、编程", color: "#5B8DEF" },
  { key: "creative", label: "创造力", hint: "画画、写作、缝纫", color: "#FF8FA3" },
  { key: "learning", label: "学习力", hint: "读书、语言、投资交易", color: "#B28DFF" },
  { key: "life", label: "生活力", hint: "做饭、家务、日常经营", color: "#35C99A" },
  { key: "body", label: "身体力", hint: "运动、恢复、体能", color: "#9BD67D" },
  { key: "social", label: "社交力", hint: "关系、表达、协作", color: "#F7C96B" }
] as const;
const EXTRA_DIMENSIONS = [
  { key: "leisure", label: "兴趣成长", hint: "游戏、影视以外的熟练度", color: "#7EC8E3" },
  { key: "foundation", label: "基础状态", hint: "睡眠等基础记录，不计入六维", color: "#9EB7CC" }
] as const;
const ALL_DIMENSIONS = [...CORE_DIMENSIONS, ...EXTRA_DIMENSIONS] as const;
const TASK_DIFFICULTY_OPTIONS = [
  { value: "1", label: "轻松" },
  { value: "2", label: "普通" },
  { value: "3", label: "困难" },
  { value: "4", label: "硬仗" }
] as const;
const TASK_ENCOURAGEMENTS = [
  "你把想法变成了真实进度，这一步很扎实。",
  "完成就是最好的证据，今天的你又往前走了一格。",
  "这件事已经落袋了，可以安心给自己记上一笔。",
  "你没有只停在计划里，行动已经被记录下来了。",
  "很好，这种稳定的小完成会慢慢叠成很大的底气。"
] as const;
const timelineTicks = [
  ...Array.from({ length: 4 }, (_, hour) => ({ minute: hour * 60, label: `${String(hour).padStart(2, "0")}:00` })),
  { minute: 5 * 60, label: "03-07", compressed: true },
  ...Array.from({ length: HOUR_END - 7 + 1 }, (_, index) => {
    const hour = 7 + index;
    return { minute: hour * 60, label: `${String(hour).padStart(2, "0")}:00` };
  })
];
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

function dateInputFromOptional(value?: string | null) {
  return value ? localDateInput(value) : "";
}

function timeInputFromOptional(value?: string | null) {
  return value ? timeText(value) : "18:00";
}

function dueAtPayload(date: string, time: string) {
  return date ? `${date}T${time || "18:00"}` : null;
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
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

function durationMinutes(item: Pick<Schedule, "startTime" | "endTime">) {
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

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

const TASK_REWARD_BASE: Record<number, { xp: number; coins: number }> = {
  1: { xp: 10, coins: 3 },
  2: { xp: 20, coins: 6 },
  3: { xp: 40, coins: 12 },
  4: { xp: 70, coins: 20 }
};

function estimatePlannedTaskReward(task: Task, plannedSchedule: Schedule | null) {
  if (!plannedSchedule) return null;
  const base = TASK_REWARD_BASE[task.difficulty] ?? TASK_REWARD_BASE[2];
  const hours = Math.max(0.25, durationMinutes(plannedSchedule) / 60);
  const multiplier = task.pinned ? 1.3 : 1;
  return {
    xp: Math.max(1, Math.round(base.xp * hours * multiplier)),
    coins: Math.max(1, Math.round(base.coins * hours * multiplier))
  };
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

function dimensionMeta(key?: string | null) {
  return ALL_DIMENSIONS.find((item) => item.key === key) ?? CORE_DIMENSIONS[3];
}

function isCoreDimensionKey(value: DimensionKey) {
  return CORE_DIMENSIONS.some((item) => item.key === value);
}

function categoriesInDimension(categories: Category[], key: DimensionKey) {
  return categories.filter((category) => category.dimensionKey === key);
}

function dimensionTotalMinutes(categories: Category[], key: DimensionKey) {
  return categoriesInDimension(categories, key).reduce((sum, category) => sum + category.totalMinutes, 0);
}

function visibleDimensions(categories: Category[]) {
  return ALL_DIMENSIONS.filter((dimension) => CORE_DIMENSIONS.some((core) => core.key === dimension.key) || categories.some((category) => category.dimensionKey === dimension.key));
}

function validTaskFilter(filter: TaskCategoryFilter, categories: Category[], tasks: Task[], dailyTaskIds?: number[]) {
  const dailyTaskIdSet = dailyTaskIds ? new Set(dailyTaskIds) : null;
  const visibleTasks = tasks.filter((task) => task.status !== 3 && (!dailyTaskIdSet || dailyTaskIdSet.has(task.id)));
  if (filter === "all") return true;
  if (filter === "none") return visibleTasks.some((task) => !task.categoryId);
  return visibleTasks.some((task) => task.categoryId && categories.some((category) => category.id === task.categoryId && category.dimensionKey === filter));
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
  const [taskDescription, setTaskDescription] = useState("");
  const [taskCategoryId, setTaskCategoryId] = useState("");
  const [taskDifficulty, setTaskDifficulty] = useState("2");
  const [taskCategoryFilter, setTaskCategoryFilter] = useState<TaskCategoryFilter>("all");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskDueTime, setTaskDueTime] = useState("18:00");
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
  const [taskCreateModalOpen, setTaskCreateModalOpen] = useState(false);
  const [taskSelectionModalOpen, setTaskSelectionModalOpen] = useState(false);
  const [completedTasksModalOpen, setCompletedTasksModalOpen] = useState(false);
  const [selectedDailyTaskIds, setSelectedDailyTaskIds] = useState<number[]>([]);
  const [finishTimerSession, setFinishTimerSession] = useState<TimerSession | null>(null);
  const [finishTimerDate, setFinishTimerDate] = useState(todayString());
  const [finishTimerStart, setFinishTimerStart] = useState("09:00");
  const [finishTimerEnd, setFinishTimerEnd] = useState("10:00");
  const [categoryName, setCategoryName] = useState("");
  const [categoryDimensionKey, setCategoryDimensionKey] = useState<DimensionKey>("career");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryDimensionKey, setEditCategoryDimensionKey] = useState<DimensionKey>("life");
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
  const [editTaskDescription, setEditTaskDescription] = useState("");
  const [editTaskDueDate, setEditTaskDueDate] = useState("");
  const [editTaskDueTime, setEditTaskDueTime] = useState("18:00");
  const [editTaskDifficulty, setEditTaskDifficulty] = useState("2");
  const [rewardCenter, setRewardCenter] = useState<RewardsPayload | null>(null);
  const [rewardName, setRewardName] = useState("");
  const [rewardCost, setRewardCost] = useState("120");
  const [rewardDescription, setRewardDescription] = useState("");
  const [aiInsightLoading, setAiInsightLoading] = useState<"morning" | "journal" | null>(null);
  const [toolModal, setToolModal] = useState<ToolModalKind | null>(null);
  const [decisionRecords, setDecisionRecords] = useState<DecisionRecord[]>([]);
  const [bridgeRecords, setBridgeRecords] = useState<PsychologicalBridgeRecord[]>([]);
  const [decisionTheme, setDecisionTheme] = useState("");
  const [decisionBenefits, setDecisionBenefits] = useState("");
  const [decisionDrawbacks, setDecisionDrawbacks] = useState("");
  const [decisionBenefitScore, setDecisionBenefitScore] = useState("3");
  const [decisionDrawbackScore, setDecisionDrawbackScore] = useState("3");
  const [decisionConclusion, setDecisionConclusion] = useState("");
  const [bridgeDesiredEffect, setBridgeDesiredEffect] = useState("");
  const [bridgeResistance, setBridgeResistance] = useState("");
  const [bridgeResult, setBridgeResult] = useState<PsychologicalBridgeRecord | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [completionTask, setCompletionTask] = useState<Task | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [sleepModalOpen, setSleepModalOpen] = useState(false);
  const [sleepStart, setSleepStart] = useState("23:30");
  const [wakeTime, setWakeTime] = useState("07:30");
  const [qualityScore, setQualityScore] = useState("4");
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [, setError] = useState("");
  const [feedbackPopup, setFeedbackPopup] = useState<FeedbackPopupState | null>(null);
  const [loading, setLoading] = useState(true);

  function showNotice(message: string, title = "需要看一下") {
    setError("");
    setFeedbackPopup({ kind: "notice", title, message });
  }

  function showConfirm(title: string, message: string, onConfirm: () => void | Promise<void>, confirmText = "确认") {
    setError("");
    setFeedbackPopup({ kind: "confirm", title, message, confirmText, onConfirm });
  }

  function showTaskRewardPopup(task: Pick<Task, "id" | "title"> | null | undefined, rewards: Array<RewardGrant | null | undefined>, mode: "done" | "partial" = "done") {
    const validRewards = rewards.filter((reward): reward is RewardGrant => Boolean(reward && (reward.xp || reward.coins)));
    const line = task ? TASK_ENCOURAGEMENTS[task.id % TASK_ENCOURAGEMENTS.length] : TASK_ENCOURAGEMENTS[0];
    const taskTitle = task?.title ?? "这个任务";
    setFeedbackPopup({
      kind: "reward",
      title: mode === "partial" ? "阶段完成，奖励到账" : "任务完成，奖励到账",
      message: mode === "partial" ? `${taskTitle} 已记录一段投入。${line}` : `${taskTitle} 已完成。${line}`,
      rewards: validRewards
    });
  }

  function showRecordRewardPopup(label: string, reward: RewardGrant | null | undefined) {
    setFeedbackPopup({
      kind: "reward",
      title: `${label}已保存`,
      message: "这次整理也计入成长记录。能把模糊的东西写清楚，本身就是一种推进。",
      rewards: reward ? [reward] : []
    });
  }

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
      setTaskCategoryFilter((current) => (validTaskFilter(current, data.categories, data.tasks, data.dailyTaskIds) ? current : "all"));
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
      showNotice(err instanceof Error ? err.message : "加载失败", "加载没有成功");
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

  useEffect(() => {
    if (authUser && pageMode === "rewards") void loadRewardCenter();
  }, [pageMode, authUser?.id]);

  async function run(action: () => Promise<void>) {
    setError("");
    try {
      await action();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "操作失败", "操作没有成功");
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

  async function submitTaskCreate(takeToday: boolean) {
    if (!taskTitle.trim()) {
      showNotice("先写一个任务标题。");
      return;
    }
    if (!taskCategoryId) {
      showNotice("新增任务需要选择事件类型。");
      return;
    }
    await run(async () => {
      const result = await api<TaskCreateResult>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDescription.trim() || undefined,
          categoryId: Number(taskCategoryId),
          priority: 2,
          difficulty: Number(taskDifficulty),
          dueAt: dueAtPayload(taskDueDate, taskDueTime) ?? undefined,
          plannedDate: taskPlanEnabled ? selectedDate : undefined,
          plannedStartTime: taskPlanEnabled ? taskPlanStart : undefined,
          plannedEndTime: taskPlanEnabled ? taskPlanEnd : undefined
        })
      });
      if (takeToday) {
        const currentIds = (dashboard?.dailyTaskIds ?? []).filter((taskId) => {
          const task = dashboard?.tasks.find((item) => item.id === taskId);
          return task && task.status !== 2 && task.status !== 3;
        });
        await api("/api/task-days", {
          method: "PUT",
          body: JSON.stringify({ taskDate: selectedDate, taskIds: [...currentIds, result.id] })
        });
      }
      setTaskTitle("");
      setTaskDescription("");
      setTaskDifficulty("2");
      setTaskDueDate("");
      setTaskDueTime("18:00");
      setTaskPlanEnabled(false);
      setTaskCreateModalOpen(false);
      await loadDashboard();
    });
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    await submitTaskCreate(false);
  }

  async function createAndTakeTask() {
    await submitTaskCreate(true);
  }

  function openDailyTaskSelector() {
    const poolTaskIds = new Set((dashboard?.tasks ?? []).filter((task) => task.status !== 2 && task.status !== 3).map((task) => task.id));
    const currentIds = (dashboard?.dailyTaskIds ?? []).filter((taskId) => poolTaskIds.has(taskId));
    setSelectedDailyTaskIds(currentIds);
    setTaskSelectionModalOpen(true);
  }

  async function saveDailyTaskSelection(event: FormEvent) {
    event.preventDefault();
    if (!selectedDailyTaskIds.length) {
      showNotice("至少接取一个任务，今天才有一块可以推进的悬赏。");
      return;
    }
    await run(async () => {
      await api("/api/task-days", {
        method: "PUT",
        body: JSON.stringify({ taskDate: selectedDate, taskIds: selectedDailyTaskIds })
      });
      setTaskSelectionModalOpen(false);
      await loadDashboard();
    });
  }

  async function cancelDailyTask(task: Task) {
    const currentIds = dashboard?.dailyTaskIds ?? [];
    if (!currentIds.includes(task.id)) return;
    const remainingTaskIds = currentIds.filter((taskId) => {
      const item = dashboard?.tasks.find((candidate) => candidate.id === taskId);
      return taskId !== task.id && item && item.status !== 2 && item.status !== 3;
    });
    if (!remainingTaskIds.length) {
      showNotice("今天至少保留一个已接取任务。可以先接取新的任务，再取消这一个。");
      return;
    }
    showConfirm("取消今日任务", `把「${task.title}」放回任务池吗？任务本身不会被删除。`, async () => {
      await run(async () => {
        await api("/api/task-days", {
          method: "PUT",
          body: JSON.stringify({
            taskDate: selectedDate,
            taskIds: remainingTaskIds
          })
        });
        await loadDashboard();
      });
    }, "取消今日");
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    await run(async () => {
      await api("/api/task-categories", {
        method: "POST",
        body: JSON.stringify({
          name: categoryName.trim(),
          dimensionKey: categoryDimensionKey,
          color: nextCategoryColor(dashboard?.categories.length ?? 0),
          targetMinutes: 6000
        })
      });
      setCategoryName("");
      await loadDashboard();
    });
  }

  function openCategoryEditor(category: Category) {
    setEditingCategory(category);
    setEditCategoryName(category.name);
    setEditCategoryDimensionKey(category.dimensionKey);
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
          dimensionKey: editCategoryDimensionKey,
          color: editCategoryColor,
          targetMinutes: Number(editCategoryTargetHours) * 60
        })
      });
      setEditingCategory(null);
      await loadDashboard();
    });
  }

  async function deleteCategory(category: Category) {
    showConfirm("删除事件类型", `删除「${category.name}」吗？已有任务和时间记录会变为未分类。`, async () => {
      await run(async () => {
        await api(`/api/task-categories/${category.id}`, { method: "DELETE" });
        if (String(category.id) === taskCategoryId) setTaskCategoryId("");
        await loadDashboard();
      });
    }, "删除");
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    if (!scheduleTaskId && !scheduleTitle.trim()) {
      showNotice("不关联任务时，需要写一下这段时间做了什么");
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

  async function deleteTask(id: number, afterDelete?: () => void) {
    showConfirm("删除任务", "删除这个任务吗？关联的时间轴记录也会一起删除。", async () => {
      await run(async () => {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
        afterDelete?.();
        await loadDashboard();
      });
    }, "删除");
  }

  async function updateTaskCategory(task: Task, categoryId: number | null) {
    if (task.categoryId === categoryId) return;
    await run(async () => {
      await api(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ categoryId }) });
      await loadDashboard();
    });
  }

  async function updateTaskProgress(task: Task, progressPercent: number) {
    const next = Math.max(0, Math.min(100, progressPercent));
    if (task.progressPercent === next) return;
    await run(async () => {
      await api(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ progressPercent: next }) });
      await loadDashboard();
    });
  }

  function openTaskTitleEditor(task: Task) {
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setEditTaskDescription(task.description ?? "");
    setEditTaskDueDate(dateInputFromOptional(task.dueAt));
    setEditTaskDueTime(timeInputFromOptional(task.dueAt));
    setEditTaskDifficulty(String(task.difficulty ?? 2));
  }

  async function saveTaskTitle(event: FormEvent) {
    event.preventDefault();
    if (!editingTask) return;
    const nextTitle = editTaskTitle.trim();
    if (!nextTitle) {
      showNotice("任务标题不能为空");
      return;
    }
    await run(async () => {
      await api(`/api/tasks/${editingTask.id}`, { method: "PUT", body: JSON.stringify({ title: nextTitle, description: editTaskDescription.trim() || null, difficulty: Number(editTaskDifficulty), dueAt: dueAtPayload(editTaskDueDate, editTaskDueTime) }) });
      setEditingTask(null);
      setEditTaskTitle("");
      setEditTaskDescription("");
      setEditTaskDueDate("");
      setEditTaskDueTime("18:00");
      setEditTaskDifficulty("2");
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
      showNotice(err instanceof Error ? err.message : "列表加载失败", "列表加载失败");
    }
  }

  async function loadRewardCenter() {
    try {
      setRewardCenter(await api<RewardsPayload>("/api/rewards"));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "奖励中心加载失败", "奖励中心加载失败");
    }
  }

  async function loadToolRecords() {
    try {
      const [decisions, bridges] = await Promise.all([
        api<DecisionRecord[]>("/api/decision-tools/decisions?limit=8"),
        api<PsychologicalBridgeRecord[]>("/api/decision-tools/bridges?limit=8")
      ]);
      setDecisionRecords(decisions);
      setBridgeRecords(bridges);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "小工具记录加载失败", "小工具记录加载失败");
    }
  }

  function openToolModal(kind: ToolModalKind) {
    setToolModal(kind);
    void loadToolRecords();
  }

  async function saveDecisionRecord(event: FormEvent) {
    event.preventDefault();
    if (!decisionTheme.trim() || !decisionBenefits.trim() || !decisionDrawbacks.trim()) {
      showNotice("主题、好处和坏处都需要填写。");
      return;
    }
    await run(async () => {
      const result = await api<DecisionSaveResult>("/api/decision-tools/decisions", {
        method: "POST",
        body: JSON.stringify({
          decisionDate: selectedDate,
          theme: decisionTheme,
          benefits: decisionBenefits,
          drawbacks: decisionDrawbacks,
          benefitScore: Number(decisionBenefitScore),
          drawbackScore: Number(decisionDrawbackScore),
          conclusion: decisionConclusion.trim() || undefined
        })
      });
      setDecisionTheme("");
      setDecisionBenefits("");
      setDecisionDrawbacks("");
      setDecisionBenefitScore("3");
      setDecisionDrawbackScore("3");
      setDecisionConclusion("");
      await Promise.all([loadToolRecords(), loadDashboard()]);
      showRecordRewardPopup("决策记录", result.reward);
    });
  }

  async function generatePsychologicalBridge(event: FormEvent) {
    event.preventDefault();
    if (!bridgeDesiredEffect.trim() || !bridgeResistance.trim()) {
      showNotice("想达成的效果和阻力都需要填写。");
      return;
    }
    setBridgeLoading(true);
    await run(async () => {
      const result = await api<BridgeSaveResult>("/api/decision-tools/bridges/generate", {
        method: "POST",
        body: JSON.stringify({
          bridgeDate: selectedDate,
          desiredEffect: bridgeDesiredEffect,
          resistance: bridgeResistance
        })
      });
      setBridgeResult(result);
      await Promise.all([loadToolRecords(), loadDashboard()]);
      showRecordRewardPopup("心理桥梁", result.reward);
    });
    setBridgeLoading(false);
  }

  async function createRewardItem(event: FormEvent) {
    event.preventDefault();
    if (!rewardName.trim()) return;
    await run(async () => {
      await api("/api/rewards/items", {
        method: "POST",
        body: JSON.stringify({ name: rewardName.trim(), cost: Number(rewardCost), description: rewardDescription.trim() || undefined })
      });
      setRewardName("");
      setRewardCost("120");
      setRewardDescription("");
      await loadRewardCenter();
    });
  }

  async function deleteRewardItem(item: RewardItem) {
    await run(async () => {
      await api(`/api/rewards/items/${item.id}`, { method: "DELETE" });
      await loadRewardCenter();
    });
  }

  async function redeemRewardItem(item: RewardItem) {
    await run(async () => {
      await api(`/api/rewards/items/${item.id}/redeem`, { method: "POST" });
      await Promise.all([loadRewardCenter(), loadDashboard()]);
    });
  }

  async function analyzeInsight(sourceType: "morning" | "journal") {
    const content = sourceType === "morning" ? morningContent : journalContent;
    if (!content.trim()) {
      showNotice(sourceType === "morning" ? "先写一点晨写内容，再分析。" : "先写一点日记内容，再分析。");
      return;
    }
    await run(async () => {
      setAiInsightLoading(sourceType);
      await api("/api/ai-insights/analyze", {
        method: "POST",
        body: JSON.stringify({ sourceType, sourceDate: selectedDate, content })
      });
      await loadDashboard();
    });
    setAiInsightLoading(null);
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
      showNotice("结束时间需要晚于开始时间");
      return;
    }
    await run(async () => {
      const task = completionTask;
      const result = await api<TaskCompleteResult>(`/api/tasks/${task.id}/complete`, {
        method: "PUT",
        body: JSON.stringify({
          scheduleDate: finishTimerDate,
          startTime: finishTimerStart,
          endTime: finishTimerEnd,
          completionNote: completionNote.trim() || undefined
        })
      });
      setCompletionTask(null);
      setCompletionNote("");
      await loadDashboard();
      showTaskRewardPopup(task, [result.reward]);
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

  async function stopTimer(id: number, action: "pause" | "finish") {
    await run(async () => {
      const timer = runningTimers.find((item) => item.id === id);
      const task = tasks.find((item) => item.id === timer?.taskId);
      const result = await api<TimerStopResult>(`/api/timer-sessions/${id}/${action}`, { method: "PUT" });
      await loadDashboard();
      showTaskRewardPopup(task, result.rewards ?? [], action === "pause" ? "partial" : "done");
    });
  }

  function openFinishTimerModal(activeTimer: TimerSession | undefined) {
    if (!activeTimer) return;
    setFinishTimerSession(activeTimer);
    setFinishTimerDate(localDateInput(activeTimer.startTime));
    setFinishTimerStart(timeText(activeTimer.startTime));
    setFinishTimerEnd(currentTimeInput());
    setFinishTimerModalOpen(true);
  }

  async function finishTimer(event: FormEvent) {
    event.preventDefault();
    const id = finishTimerSession?.id;
    if (!id) return;
    if (finishTimerEnd <= finishTimerStart) {
      showNotice("结束时间需要晚于开始时间");
      return;
    }
    await run(async () => {
      const task = tasks.find((item) => item.id === finishTimerSession?.taskId);
      const result = await api<TimerStopResult>(`/api/timer-sessions/${id}/finish`, {
        method: "PUT",
        body: JSON.stringify({
          scheduleDate: finishTimerDate,
          startTime: finishTimerStart,
          endTime: finishTimerEnd
        })
      });
      setFinishTimerSession(null);
      setFinishTimerModalOpen(false);
      await loadDashboard();
      showTaskRewardPopup(task, result.rewards ?? []);
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
  const categoryTotals = dashboard?.categoryTotals ?? categories;
  const schedules = dashboard?.schedules ?? [];
  const taskPlans = plannedMap(schedules);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const orderedTasks = useMemo(() => sortTasksForDisplay(tasks, taskPlans), [tasks, taskPlans]);
  const activeDailyTaskIds = useMemo(() => new Set(dashboard?.dailyTaskIds ?? []), [dashboard?.dailyTaskIds]);
  const dailyOrderedTasks = useMemo(() => orderedTasks.filter((task) => activeDailyTaskIds.has(task.id) && task.status !== 3), [activeDailyTaskIds, orderedTasks]);
  const runningTimers = dashboard?.activeTimers ?? (dashboard?.activeTimer ? [dashboard.activeTimer] : []);
  const activeTimersByTaskId = useMemo(() => new Map(runningTimers.map((timer) => [timer.taskId, timer])), [runningTimers]);
  const filteredTasks = useMemo(() => {
    if (taskCategoryFilter === "all") return dailyOrderedTasks;
    if (taskCategoryFilter === "none") return dailyOrderedTasks.filter((task) => !task.categoryId);
    return dailyOrderedTasks.filter((task) => task.categoryId && categoryById.get(task.categoryId)?.dimensionKey === taskCategoryFilter);
  }, [dailyOrderedTasks, taskCategoryFilter, categoryById]);
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
  const completedTaskList = useMemo(() => orderedTasks.filter((task) => task.status === 2).sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime()), [orderedTasks]);
  const taskRewardsById = useMemo(() => {
    const map = new Map<number, { xp: number; coins: number; events: RewardEvent[] }>();
    for (const event of dashboard?.taskRewardEvents ?? []) {
      const taskId = Number(event.sourceId);
      if (!Number.isFinite(taskId)) continue;
      const current = map.get(taskId) ?? { xp: 0, coins: 0, events: [] };
      current.xp += event.xpDelta;
      current.coins += event.coinDelta;
      current.events.push(event);
      map.set(taskId, current);
    }
    return map;
  }, [dashboard?.taskRewardEvents]);
  const renderTaskRow = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      category={task.categoryId ? categoryById.get(task.categoryId) ?? null : null}
      categories={categories}
      plannedSchedule={taskPlans.get(task.id) ?? null}
      activeTimer={activeTimersByTaskId.get(task.id) ?? null}
      disabled={task.status === 2}
      dragging={draggingTaskId === task.id}
      dragOver={dragOverTaskId === task.id && draggingTaskId !== task.id}
      onDone={() => toggleDone(task)}
      onPinned={() => togglePinned(task)}
      onCategoryChange={(categoryId) => updateTaskCategory(task, categoryId)}
      onProgressChange={(progressPercent) => updateTaskProgress(task, progressPercent)}
      onTitleEdit={() => openTaskTitleEditor(task)}
      onStart={() => startTimer(task.id)}
      onPause={(timerId) => stopTimer(timerId, "pause")}
      onFinish={openFinishTimerModal}
      onDelete={() => cancelDailyTask(task)}
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
  const growth = dashboard?.growth;
  const recentRewardEvents = dashboard?.rewardEvents ?? [];
  const sleep = dashboard?.sleepRecord;
  const weeklySeries = dashboard?.weeklySeries ?? [];
  const monthlySleepSeries = dashboard?.monthlySleepSeries ?? [];
  const sleepChartSeries = sleepRange === "week" ? weeklySeries : monthlySleepSeries;
  const water = dashboard?.waterRecord ?? { waterDate: selectedDate, cups: 0, targetCups: 8, lastDrinkAt: null, drinkTimes: "[]" };
  const waterPlan = hydrationPlan(water, sleep ?? null, selectedDate);
  const journalRecord = dashboard?.journalRecord ?? null;
  const morningInsight = dashboard?.aiInsights?.find((item) => item.sourceType === "morning") ?? null;
  const journalInsight = dashboard?.aiInsights?.find((item) => item.sourceType === "journal") ?? null;
  const todayMorningCount = hasText(dashboard?.morningWritingRecord?.content) ? 1 : 0;
  const todayJournalCount = hasText(journalRecord?.content) ? 1 : 0;
  const todayReviewCount = hasStockReviewContent(dashboard?.stockReviewRecord) ? 1 : 0;
  const hasPendingWriting = !todayMorningCount || !todayJournalCount || !todayReviewCount;
  const timelineItems = useMemo(() => {
    const sleepItems = sleep ? [sleepTimelineItem(sleep)] : [];
    return [...schedules, ...sleepItems, ...waterTimelineItems(water)].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [schedules, sleep, water]);
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
      <>
        <AuthPage
          mode={authMode}
          username={authUsername}
          displayName={authDisplayName}
          password={authPassword}
          onModeChange={setAuthMode}
          onUsernameChange={setAuthUsername}
          onDisplayNameChange={setAuthDisplayName}
          onPasswordChange={setAuthPassword}
          onSubmit={submitAuth}
        />
        {feedbackPopup && <FeedbackPopup popup={feedbackPopup} onClose={() => setFeedbackPopup(null)} />}
      </>
    );
  }

  return (
    <main className="page-shell min-h-screen p-2.5 text-ink md:p-3">
      <div className="mx-auto flex max-w-[1540px] flex-col gap-2.5">
        <header className="glass-panel top-workbench-header sticky top-2.5 z-10">
          <div className="top-title-block">
            <p className="text-xs text-soft">个人工作台</p>
            <h1 className="text-lg font-bold leading-tight">今日记录</h1>
          </div>

          <div className="top-control-bar">
            <div className="inline-flex rounded-full border border-white/80 bg-white/70 p-0.5">
              <button className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${pageMode === "workspace" ? "bg-mint-500 text-white" : "text-soft hover:text-ink"}`} onClick={() => setPageMode("workspace")}>
                工作台
              </button>
              <button className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${pageMode === "history" ? "bg-pink-400 text-white" : "text-soft hover:text-ink"}`} onClick={() => setPageMode("history")}>
                回看统计
              </button>
              <button className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${pageMode === "rewards" ? "bg-amber-300 text-ink" : "text-soft hover:text-ink"}`} onClick={() => setPageMode("rewards")}>
                奖励
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
            {growth && <GrowthMini growth={growth} />}
          </div>

          <div className="top-right-block">
            <AccountMenu user={authUser} onView={() => showNotice(`显示名：${authUser.displayName}\n账号：${authUser.username}`, "账号信息")} onLogout={logout} />
            <div className="grid grid-cols-2 gap-1.5">
              <MiniStat label="实际" value={formatDuration(stats?.totalMinutes ?? 0)} />
              <MiniStat label="完成" value={`${stats?.completedTasks ?? 0}`} />
            </div>
            <div className="writing-shortcut-wrap">
              {hasPendingWriting && <span className="writing-nudge">点我记录</span>}
              <WritingShortcut label="晨写" done={Boolean(todayMorningCount)} onClick={() => setWritingModal("morning")} />
              <WritingShortcut label="复盘" done={Boolean(todayReviewCount)} onClick={() => setWritingModal("review")} />
              <WritingShortcut label="日记" done={Boolean(todayJournalCount)} onClick={() => setWritingModal("journal")} />
            </div>
          </div>
        </header>

        {pageMode === "workspace" ? (
          <section className="grid min-h-[calc(100vh-106px)] gap-2.5 xl:grid-cols-[320px_minmax(0,1.28fr)_280px]">
          <Panel
            title="小时记录"
            icon={<CalendarDays size={16} />}
            className="xl:h-full"
            action={
              <div className="flex items-center gap-1">
                <button className="primary-button h-8 gap-1 px-3 text-[11px]" type="button" onClick={() => setScheduleModalOpen(true)}>
                  <Plus size={14} />
                  记录
                </button>
              </div>
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

          <Panel
            title="主要任务"
            icon={<CheckCircle2 size={17} />}
            className="xl:min-h-full"
            action={
              <div className="flex items-center gap-1">
                <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" aria-label="查看已完成任务" onClick={() => setCompletedTasksModalOpen(true)}>
                  <CheckCircle2 size={14} />
                  已完成
                </button>
                <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" aria-label="接取今日任务" onClick={openDailyTaskSelector}>
                  <Gift size={14} />
                  接取
                </button>
                <button className="primary-button h-8 gap-1 px-3 text-[11px]" type="button" onClick={() => setTaskCreateModalOpen(true)}>
                  <Plus size={14} />
                  新增
                </button>
              </div>
            }
          >
              {!!dailyOrderedTasks.length && (
                <TaskDimensionTabs
                dimensions={visibleDimensions(categories)}
                active={taskCategoryFilter}
                allCount={pendingOrderedTasks.length}
                uncategorizedCount={uncategorizedTaskCount}
                dimensionCounts={dimensionTaskCounts}
                onChange={setTaskCategoryFilter}
              />
            )}

            <div className="space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-245px)]">
              {loading && <EmptyText text="加载中..." />}
              {!loading && !tasks.length && <EmptyText text="任务池还没有任务，先添加一个悬赏。" />}
              {!loading && tasks.length > 0 && !dailyOrderedTasks.length && <EmptyText text="今天还没有接取任务，点击上方“接取悬赏”开始选择。" />}
              {!!dailyOrderedTasks.length && (
                <>
                  <TaskSection title="待完成" count={pendingTasks.length}>
                    {pendingTasks.length ? pendingTasks.map(renderTaskRow) : <EmptyText text="今天的悬赏都完成了。" />}
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

            <Panel title="六维能力" icon={<TimerReset size={17} />}>
              <form className="mb-3 grid gap-2" onSubmit={createCategory}>
                <input className="field min-w-0" placeholder="新增技能/主题，比如 缝纫" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select className="field" value={categoryDimensionKey} onChange={(event) => setCategoryDimensionKey(event.target.value as DimensionKey)}>
                    <DimensionOptions />
                  </select>
                <button className="primary-button px-3" type="submit">
                  <Plus size={15} />
                </button>
                </div>
              </form>
              <AbilityOverview categories={categories} onEdit={openCategoryEditor} onDelete={deleteCategory} />
            </Panel>

            <Panel title="小工具" icon={<Sparkles size={17} />}>
              <div className="grid gap-2">
                <button className="tool-entry" type="button" onClick={() => openToolModal("decision")}>
                  <span className="tool-entry-icon"><Scale size={15} /></span>
                  <span>
                    <strong>辅助决策</strong>
                    <small>好处 / 坏处 / 分数</small>
                  </span>
                </button>
                <button className="tool-entry" type="button" onClick={() => openToolModal("bridge")}>
                  <span className="tool-entry-icon"><Sparkles size={15} /></span>
                  <span>
                    <strong>心理桥梁</strong>
                    <small>目标 / 阻力 / 下一步</small>
                  </span>
                </button>
              </div>
            </Panel>
          </div>
        </section>
        ) : pageMode === "history" ? (
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
            categories={categoryTotals}
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
        ) : (
          <RewardCenter
            growth={rewardCenter?.growth ?? growth ?? null}
            items={rewardCenter?.items ?? []}
            events={rewardCenter?.events ?? recentRewardEvents}
            redemptions={rewardCenter?.redemptions ?? []}
            rewardName={rewardName}
            rewardCost={rewardCost}
            rewardDescription={rewardDescription}
            onNameChange={setRewardName}
            onCostChange={setRewardCost}
            onDescriptionChange={setRewardDescription}
            onCreate={createRewardItem}
            onRedeem={redeemRewardItem}
            onDelete={deleteRewardItem}
          />
        )}
      </div>

      {editingTask && (
        <TaskTitleEditModal
          title={editTaskTitle}
          description={editTaskDescription}
          dueDate={editTaskDueDate}
          dueTime={editTaskDueTime}
          difficulty={editTaskDifficulty}
          onTitleChange={setEditTaskTitle}
          onDescriptionChange={setEditTaskDescription}
          onDueDateChange={setEditTaskDueDate}
          onDueTimeChange={setEditTaskDueTime}
          onDifficultyChange={setEditTaskDifficulty}
          onClose={() => {
            setEditingTask(null);
            setEditTaskTitle("");
            setEditTaskDescription("");
            setEditTaskDueDate("");
            setEditTaskDueTime("18:00");
            setEditTaskDifficulty("2");
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
          taskTitle={tasks.find((task) => task.id === finishTimerSession?.taskId)?.title ?? "当前任务"}
          scheduleDate={finishTimerDate}
          startTime={finishTimerStart}
          endTime={finishTimerEnd}
          onDateChange={setFinishTimerDate}
          onStartChange={setFinishTimerStart}
          onEndChange={setFinishTimerEnd}
          onClose={() => {
            setFinishTimerSession(null);
            setFinishTimerModalOpen(false);
          }}
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
          dimensionKey={editCategoryDimensionKey}
          color={editCategoryColor}
          targetHours={editCategoryTargetHours}
          onNameChange={setEditCategoryName}
          onDimensionKeyChange={setEditCategoryDimensionKey}
          onTargetHoursChange={setEditCategoryTargetHours}
          onClose={() => setEditingCategory(null)}
          onSubmit={updateCategory}
        />
      )}

      {writingModal === "morning" && (
        <WritingModal title={`晨写 · ${formatDayLabel(selectedDate)}`} onClose={() => setWritingModal(null)} onSubmit={saveMorningWriting}>
          <div className="flex justify-end">
            <button className="icon-button w-auto gap-1 px-3 text-[11px]" type="button" aria-label="分析晨写内容" onClick={() => analyzeInsight("morning")} disabled={aiInsightLoading === "morning"}>
              <Sparkles size={13} />
              AI分析
            </button>
          </div>
          {morningInsight && <AiInsightCard insight={morningInsight} expanded />}
          <textarea className="writing-textarea" placeholder="早上先写几句：醒来想到什么、今天想把注意力放在哪里..." value={morningContent} onChange={(event) => setMorningContent(event.target.value)} />
          <select className="field" value={morningMoodScore} onChange={(event) => setMorningMoodScore(event.target.value)}>
            <ScoreOptions items={MORNING_STATE_OPTIONS} />
          </select>
        </WritingModal>
      )}

      {writingModal === "journal" && (
        <WritingModal title={`睡前日记 · ${formatDayLabel(selectedDate)}`} onClose={() => setWritingModal(null)} onSubmit={saveJournal}>
          <div className="flex justify-end">
            <button className="icon-button w-auto gap-1 px-3 text-[11px]" type="button" aria-label="分析日记内容" onClick={() => analyzeInsight("journal")} disabled={aiInsightLoading === "journal"}>
              <Sparkles size={13} />
              AI分析
            </button>
          </div>
          {journalInsight && <AiInsightCard insight={journalInsight} expanded />}
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

      {taskCreateModalOpen && (
        <TaskCreateModal
          title={taskTitle}
          description={taskDescription}
          categoryId={taskCategoryId}
          categories={categories}
          difficulty={taskDifficulty}
          dueDate={taskDueDate}
          dueTime={taskDueTime}
          planEnabled={taskPlanEnabled}
          planStart={taskPlanStart}
          planEnd={taskPlanEnd}
          onTitleChange={setTaskTitle}
          onDescriptionChange={setTaskDescription}
          onCategoryChange={setTaskCategoryId}
          onDifficultyChange={setTaskDifficulty}
          onDueDateChange={setTaskDueDate}
          onDueTimeChange={setTaskDueTime}
          onPlanEnabledChange={setTaskPlanEnabled}
          onPlanStartChange={setTaskPlanStart}
          onPlanEndChange={setTaskPlanEnd}
          onClearDueDate={() => setTaskDueDate("")}
          onClose={() => setTaskCreateModalOpen(false)}
          onSubmit={createTask}
          onSubmitAndTake={createAndTakeTask}
        />
      )}

      {completedTasksModalOpen && (
        <CompletedTasksModal
          tasks={completedTaskList}
          categories={categories}
          rewardsByTaskId={taskRewardsById}
          onClose={() => setCompletedTasksModalOpen(false)}
        />
      )}

      {taskSelectionModalOpen && (
        <TaskSelectionModal
          selectedDate={selectedDate}
          tasks={orderedTasks.filter((task) => task.status !== 2 && task.status !== 3)}
          categories={categories}
          selectedIds={selectedDailyTaskIds}
          onToggle={(taskId) => setSelectedDailyTaskIds((ids) => ids.includes(taskId) ? ids.filter((id) => id !== taskId) : [...ids, taskId])}
          onDelete={(task) => deleteTask(task.id, () => setSelectedDailyTaskIds((ids) => ids.filter((id) => id !== task.id)))}
          onClose={() => setTaskSelectionModalOpen(false)}
          onSubmit={saveDailyTaskSelection}
        />
      )}

      {toolModal === "decision" && (
        <DecisionToolModal
          records={decisionRecords}
          selectedDate={selectedDate}
          theme={decisionTheme}
          benefits={decisionBenefits}
          drawbacks={decisionDrawbacks}
          benefitScore={decisionBenefitScore}
          drawbackScore={decisionDrawbackScore}
          conclusion={decisionConclusion}
          onThemeChange={setDecisionTheme}
          onBenefitsChange={setDecisionBenefits}
          onDrawbacksChange={setDecisionDrawbacks}
          onBenefitScoreChange={setDecisionBenefitScore}
          onDrawbackScoreChange={setDecisionDrawbackScore}
          onConclusionChange={setDecisionConclusion}
          onSubmit={saveDecisionRecord}
          onClose={() => setToolModal(null)}
        />
      )}

      {toolModal === "bridge" && (
        <PsychologicalBridgeModal
          records={bridgeRecords}
          selectedDate={selectedDate}
          desiredEffect={bridgeDesiredEffect}
          resistance={bridgeResistance}
          result={bridgeResult}
          loading={bridgeLoading}
          onDesiredEffectChange={setBridgeDesiredEffect}
          onResistanceChange={setBridgeResistance}
          onSubmit={generatePsychologicalBridge}
          onClose={() => setToolModal(null)}
        />
      )}

      {feedbackPopup && <FeedbackPopup popup={feedbackPopup} onClose={() => setFeedbackPopup(null)} />}
    </main>
  );
}

function AuthPage({
  mode,
  username,
  displayName,
  password,
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

          <button className="primary-button mt-4 w-full" type="submit">
            {isRegister ? "注册并进入" : "登录"}
          </button>
        </form>
      </div>
    </main>
  );
}

function RewardCenter(props: {
  growth: Growth | null;
  items: RewardItem[];
  events: RewardEvent[];
  redemptions: RewardRedemption[];
  rewardName: string;
  rewardCost: string;
  rewardDescription: string;
  onNameChange: (value: string) => void;
  onCostChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onRedeem: (item: RewardItem) => void;
  onDelete: (item: RewardItem) => void;
}) {
  const growth = props.growth;
  const percent = growth ? Math.min(100, Math.round((growth.xpInLevel / Math.max(1, growth.xpForNextLevel)) * 100)) : 0;
  return (
    <section className="grid gap-2.5 lg:grid-cols-[minmax(0,1.1fr)_360px]">
      <Panel title="成长进度" icon={<Sparkles size={17} />}>
        <div className="growth-hero">
          <div>
            <p className="text-xs text-soft">当前等级</p>
            <h2 className="mt-1 text-2xl font-bold">Lv.{growth?.level ?? 1}</h2>
          </div>
          <div className="text-right">
            <p className="text-xs text-soft">金币</p>
            <p className="mt-1 inline-flex items-center gap-1 text-2xl font-bold text-amber-500">
              <Coins size={20} />
              {growth?.coins ?? 0}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-soft">
            <span>经验</span>
            <span>{growth?.xpInLevel ?? 0}/{growth?.xpForNextLevel ?? 50}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/70">
            <div className="h-full rounded-full bg-mint-500 transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <section className="reward-list">
            <h3 className="mb-2 text-xs font-semibold text-ink">最近获得</h3>
            {props.events.length ? (
              props.events.map((event) => (
                <div className="reward-row" key={event.id}>
                  <span>{event.reason}</span>
                  <span className="text-right text-mint-700">+{event.xpDelta} XP {event.coinDelta ? `+${event.coinDelta} 金币` : ""}</span>
                </div>
              ))
            ) : (
              <EmptyText text="完成一次记录后，这里会亮起来。" />
            )}
          </section>
          <section className="reward-list">
            <h3 className="mb-2 text-xs font-semibold text-ink">最近兑换</h3>
            {props.redemptions.length ? (
              props.redemptions.map((item) => (
                <div className="reward-row" key={item.id}>
                  <span>{item.name}</span>
                  <span className="text-right text-pink-500">-{item.cost}</span>
                </div>
              ))
            ) : (
              <EmptyText text="还没有兑换奖励。" />
            )}
          </section>
        </div>
      </Panel>

      <Panel title="奖励中心" icon={<Gift size={17} />}>
        <form className="space-y-2" onSubmit={props.onCreate}>
          <input className="field" placeholder="奖励名称，比如：买一杯喜欢的饮料" value={props.rewardName} onChange={(event) => props.onNameChange(event.target.value)} />
          <input className="field" min={1} type="number" placeholder="金币价格" value={props.rewardCost} onChange={(event) => props.onCostChange(event.target.value)} />
          <textarea className="journal-input min-h-20" placeholder="说明，可不填" value={props.rewardDescription} onChange={(event) => props.onDescriptionChange(event.target.value)} />
          <button className="primary-button w-full" type="submit">添加奖励</button>
        </form>

        <div className="mt-3 space-y-2">
          {props.items.length ? (
            props.items.map((item) => (
              <article className="reward-item" key={item.id}>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{item.name}</h3>
                  {item.description && <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-soft">{item.description}</p>}
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-500">
                    <Coins size={13} />
                    {item.cost}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="icon-button w-auto px-3 text-[11px]" type="button" aria-label={`兑换${item.name}`} onClick={() => props.onRedeem(item)} disabled={(growth?.coins ?? 0) < item.cost}>
                    兑换
                  </button>
                  <button className="icon-button h-8 w-8" type="button" aria-label="删除奖励" onClick={() => props.onDelete(item)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            ))
          ) : (
            <EmptyText text="先添加一个想兑换的小奖励。" />
          )}
        </div>
      </Panel>
    </section>
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

function GrowthMini({ growth }: { growth: Growth }) {
  const percent = Math.min(100, Math.round((growth.xpInLevel / Math.max(1, growth.xpForNextLevel)) * 100));
  return (
    <div className="top-growth-card">
      <div className="top-growth-main">
        <span className="top-growth-level">Lv.{growth.level}</span>
        <span className="top-growth-coins">
          <Coins size={16} />
          {growth.coins}
        </span>
      </div>
      <div className="top-growth-meta">
        <span>经验 {growth.xpInLevel}/{growth.xpForNextLevel}</span>
        <span>{percent}%</span>
      </div>
      <div className="top-growth-track">
        <div className="top-growth-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function AccountMenu({ user, onView, onLogout }: { user: AuthUser; onView: () => void; onLogout: () => void }) {
  return (
    <details className="account-menu">
      <summary className="account-menu-trigger" title={user.username}>
        <span className="account-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="account-name">{user.displayName}</span>
      </summary>
      <div className="account-dropdown">
        <button type="button" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onView();
        }}>
          查看账号
        </button>
        <button type="button" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </details>
  );
}

function WritingModal({ title, children, onClose, onSubmit }: { title: string; children: ReactNode; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  return (
    <ModalPortal onClose={onClose}>
      <form className="writing-modal" onSubmit={onSubmit}>
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
          <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}

function TaskSelectionModal(props: {
  selectedDate: string;
  tasks: Task[];
  categories: Category[];
  selectedIds: number[];
  onToggle: (taskId: number) => void;
  onDelete: (task: Task) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const filteredTasks = props.tasks.filter((task) => {
    if (categoryFilter === "all") return true;
    if (categoryFilter === "none") return !task.categoryId;
    return String(task.categoryId) === categoryFilter;
  });
  return (
    <ModalPortal onClose={props.onClose}>
      <form className="task-selection-modal" onSubmit={props.onSubmit}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-soft">{props.selectedDate} · 任务池</p>
            <h3 className="text-sm font-semibold">接取今天的悬赏</h3>
          </div>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-5 text-soft">挑选今天真正要推进的任务。未接取的任务仍会留在任务池里，不会消失。</p>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-soft">任务池 {props.tasks.length} 个</span>
          <select className="field h-8 max-w-[220px] text-[11px]" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">全部分类</option>
            <option value="none">未分类</option>
            <CategoryOptionsGrouped categories={props.categories} />
          </select>
        </div>
        <div className="task-pool-list">
          {filteredTasks.length ? filteredTasks.map((task) => {
            const category = task.categoryId ? categoryById.get(task.categoryId) : null;
            const selected = props.selectedIds.includes(task.id);
            return (
              <div className={`task-pool-option ${selected ? "task-pool-option-selected" : ""}`} key={task.id}>
                <label className="task-pool-main">
                  <input type="checkbox" checked={selected} onChange={() => props.onToggle(task.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="task-pool-line">
                      {task.pinned && <Star className="shrink-0 text-pink-500" size={14} fill="currentColor" />}
                      <strong>{task.title}</strong>
                      {category ? <CategoryTag category={category} /> : <span className="task-pool-empty-category">未分类</span>}
                      <span className="task-pool-inline-meta">发布 {formatDateTime(task.createdAt)}</span>
                      <span className="task-pool-inline-meta">{task.dueAt ? `截止 ${formatDateTime(task.dueAt)}` : "暂无截止"}</span>
                      <span className="task-pool-inline-meta">{difficultyLabel(task.difficulty)}</span>
                      {task.description?.trim() && <span className="task-pool-inline-meta task-pool-description" title={task.description}>{task.description}</span>}
                    </span>
                  </span>
                </label>
                <button className="task-pool-delete" type="button" aria-label="删除任务" title="删除任务" onClick={() => props.onDelete(task)}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          }) : <EmptyText text={props.tasks.length ? "这个分类下没有未完成任务。" : "任务池里还没有未完成任务。"} />}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-soft">已接取 {props.selectedIds.length} 个</span>
          <div className="flex gap-2">
            <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>取消</button>
            <button className="primary-button px-5" type="submit">确认接取</button>
          </div>
        </div>
      </form>
    </ModalPortal>
  );
}

function DecisionToolModal(props: {
  records: DecisionRecord[];
  selectedDate: string;
  theme: string;
  benefits: string;
  drawbacks: string;
  benefitScore: string;
  drawbackScore: string;
  conclusion: string;
  onThemeChange: (value: string) => void;
  onBenefitsChange: (value: string) => void;
  onDrawbacksChange: (value: string) => void;
  onBenefitScoreChange: (value: string) => void;
  onDrawbackScoreChange: (value: string) => void;
  onConclusionChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const balance = Number(props.benefitScore) - Number(props.drawbackScore);
  return (
    <ModalPortal onClose={props.onClose}>
      <form className="tool-modal" onSubmit={props.onSubmit}>
        <ToolModalHeader eyebrow={props.selectedDate} title="辅助决策" onClose={props.onClose} />
        <div className="tool-modal-grid">
          <div className="space-y-2">
            <input className="field" placeholder="这次要决定什么？" value={props.theme} onChange={(event) => props.onThemeChange(event.target.value)} />
            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1">
                <span className="tool-label">好处</span>
                <textarea className="journal-input min-h-36" placeholder="会带来什么收益、成长、轻松感？" value={props.benefits} onChange={(event) => props.onBenefitsChange(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="tool-label">坏处</span>
                <textarea className="journal-input min-h-36" placeholder="会付出什么成本、风险、精力？" value={props.drawbacks} onChange={(event) => props.onDrawbacksChange(event.target.value)} />
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
              <label className="space-y-1">
                <span className="tool-label">好处权重</span>
                <select className="field" value={props.benefitScore} onChange={(event) => props.onBenefitScoreChange(event.target.value)}>
                  <ScoreSelectOptions />
                </select>
              </label>
              <label className="space-y-1">
                <span className="tool-label">坏处权重</span>
                <select className="field" value={props.drawbackScore} onChange={(event) => props.onDrawbackScoreChange(event.target.value)}>
                  <ScoreSelectOptions />
                </select>
              </label>
              <div className={`decision-score ${balance >= 0 ? "decision-score-positive" : "decision-score-negative"}`}>
                <span>倾向</span>
                <strong>{balance > 0 ? `+${balance}` : balance}</strong>
              </div>
            </div>
            <input className="field" placeholder="当前倾向/结论，可不填" value={props.conclusion} onChange={(event) => props.onConclusionChange(event.target.value)} />
            <div className="flex justify-end gap-2">
            <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>取消</button>
              <button className="primary-button px-5" type="submit">保存决策</button>
            </div>
          </div>
          <ToolRecordList
            emptyText="保存后会在这里看到决策记录。"
            items={props.records.map((item) => ({
              id: item.id,
              title: item.theme,
              meta: `${item.decisionDate} · 好处 ${item.benefitScore} / 坏处 ${item.drawbackScore}`,
              body: item.conclusion || item.benefits
            }))}
          />
        </div>
      </form>
    </ModalPortal>
  );
}

function PsychologicalBridgeModal(props: {
  records: PsychologicalBridgeRecord[];
  selectedDate: string;
  desiredEffect: string;
  resistance: string;
  result: PsychologicalBridgeRecord | null;
  loading: boolean;
  onDesiredEffectChange: (value: string) => void;
  onResistanceChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const latest = props.result ?? props.records[0] ?? null;
  return (
    <ModalPortal onClose={props.onClose}>
      <form className="tool-modal" onSubmit={props.onSubmit}>
        <ToolModalHeader eyebrow={props.selectedDate} title="心理桥梁" onClose={props.onClose} />
        <div className="tool-modal-grid">
          <div className="space-y-2">
            <label className="space-y-1">
              <span className="tool-label">想达成的效果</span>
              <textarea className="journal-input min-h-28" placeholder="比如：我想稳定开始画画，不再只停留在想法里。" value={props.desiredEffect} onChange={(event) => props.onDesiredEffectChange(event.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="tool-label">现在的阻力</span>
              <textarea className="journal-input min-h-28" placeholder="比如：一想到要开始就觉得麻烦，怕画得不好。" value={props.resistance} onChange={(event) => props.onResistanceChange(event.target.value)} />
            </label>
            <button className="primary-button w-full px-5" type="submit" disabled={props.loading}>
              {props.loading ? "生成中..." : "生成心理桥梁"}
            </button>
            {latest && (
              <article className="bridge-result">
                <p className="whitespace-pre-wrap text-[12px] leading-6 text-ink">{latest.bridgeText}</p>
                {latest.nextStep && <p className="mt-2 text-[12px] font-semibold text-mint-700">下一步：{latest.nextStep}</p>}
                {latest.reassurance && <p className="mt-2 text-[12px] text-soft">{latest.reassurance}</p>}
              </article>
            )}
          </div>
          <ToolRecordList
            emptyText="生成后会在这里看到心理桥梁记录。"
            items={props.records.map((item) => ({
              id: item.id,
              title: item.desiredEffect,
              meta: item.bridgeDate,
              body: item.nextStep || item.bridgeText
            }))}
          />
        </div>
      </form>
    </ModalPortal>
  );
}

function ToolModalHeader({ eyebrow, title, onClose }: { eyebrow: string; title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div>
        <p className="text-[11px] text-soft">{eyebrow}</p>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}

function ToolRecordList({ items, emptyText }: { items: Array<{ id: number; title: string; meta: string; body: string }>; emptyText: string }) {
  return (
    <aside className="tool-records">
      <h4 className="mb-2 text-[11px] font-semibold text-soft">最近记录</h4>
      {items.length ? (
        items.map((item) => (
          <article className="tool-record-card" key={item.id}>
            <div className="flex items-start justify-between gap-2">
              <h5 className="line-clamp-2 text-[12px] font-semibold text-ink">{item.title}</h5>
              <span className="shrink-0 text-[10px] text-soft">{item.meta}</span>
            </div>
            <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-soft">{item.body}</p>
          </article>
        ))
      ) : (
        <EmptyText text={emptyText} />
      )}
    </aside>
  );
}

function ScoreSelectOptions() {
  return (
    <>
      <option value="1">1 · 很小</option>
      <option value="2">2 · 偏小</option>
      <option value="3">3 · 中等</option>
      <option value="4">4 · 重要</option>
      <option value="5">5 · 很关键</option>
    </>
  );
}

function DifficultyOptions() {
  return (
    <>
      {TASK_DIFFICULTY_OPTIONS.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </>
  );
}

function difficultyLabel(value: number) {
  return TASK_DIFFICULTY_OPTIONS.find((item) => Number(item.value) === value)?.label ?? "普通";
}

function DifficultyPill({ difficulty }: { difficulty: number }) {
  return <span className="difficulty-pill">{difficultyLabel(difficulty)}</span>;
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

function AiInsightCard({ insight, expanded = false }: { insight: AiInsight; expanded?: boolean }) {
  const tags = insight.emotionTags?.split(",").filter(Boolean) ?? [];
  const stress = insight.stressKeywords?.split(",").filter(Boolean) ?? [];
  return (
    <article className="insight-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-mint-700">
          <Sparkles size={13} />
          AI洞察
        </span>
        <span className="badge-gray">能量 {insight.energyScore ?? "-"}/5</span>
      </div>
      {insight.summary && <p className="text-[12px] leading-5 text-ink">{insight.summary}</p>}
      {!!tags.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span className="badge-gray" key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {expanded && (
        <div className="mt-2 space-y-2 text-[12px] leading-6 text-soft">
          {!!stress.length && <p>压力关键词：{stress.join("、")}</p>}
          {insight.suggestion && <p>建议：{insight.suggestion}</p>}
          {insight.fullText && <p className="whitespace-pre-wrap text-ink">{insight.fullText}</p>}
        </div>
      )}
    </article>
  );
}

function ModalPortal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function FeedbackPopup({ popup, onClose }: { popup: FeedbackPopupState; onClose: () => void }) {
  const totalXp = popup.kind === "reward" ? popup.rewards.reduce((sum, reward) => sum + reward.xp, 0) : 0;
  const totalCoins = popup.kind === "reward" ? popup.rewards.reduce((sum, reward) => sum + reward.coins, 0) : 0;
  const hasReward = popup.kind === "reward" && (totalXp > 0 || totalCoins > 0);
  const confirm = async () => {
    if (popup.kind !== "confirm") return;
    const action = popup.onConfirm;
    onClose();
    await action();
  };

  return (
    <ModalPortal onClose={onClose}>
      <article className={`feedback-modal ${popup.kind === "reward" ? "feedback-modal-reward" : ""}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="feedback-icon">
              {popup.kind === "reward" ? <Gift size={22} /> : <Sparkles size={22} />}
            </span>
            <div>
              <h3 className="text-base font-bold">{popup.title}</h3>
              <p className="mt-1 text-xs leading-5 text-soft">{popup.message}</p>
            </div>
          </div>
          <button className="icon-button h-8 w-8 shrink-0" type="button" aria-label="关闭" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {popup.kind === "reward" && (
          hasReward ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="reward-pop-card">
                <Sparkles size={17} />
                <span>+{totalXp} XP</span>
              </div>
              <div className="reward-pop-card">
                <Coins size={17} />
                <span>+{totalCoins} 金币</span>
              </div>
            </div>
          ) : (
              <p className="rounded-card border border-white/80 bg-white/65 p-3 text-xs text-soft">这次奖励之前已经发放过，不会重复计算。</p>
            )
          )}

        {popup.kind === "confirm" ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="icon-button w-full px-4" type="button" aria-label="取消" onClick={onClose}>
              取消
            </button>
            <button className="primary-button w-full" type="button" onClick={confirm}>
              {popup.confirmText}
            </button>
          </div>
        ) : (
          <button className="primary-button mt-4 w-full" type="button" onClick={onClose}>
            收下
          </button>
        )}
      </article>
    </ModalPortal>
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
  const [selectedItem, setSelectedItem] = useState<ArchiveListItem | null>(null);
  const items =
    props.activeTab === "morning"
      ? props.morningItems.map((item) => ({
          id: item.id ?? item.writingDate,
          date: item.writingDate,
          title: "晨写",
          content: item.content,
          score: item.moodScore,
          sections: [
            { label: "内容", value: item.content },
            { label: "状态", value: item.moodScore ? `${item.moodScore}/5` : null }
          ]
        }))
      : props.activeTab === "journal"
        ? props.journalItems.map((item) => ({
            id: item.id,
            date: item.journalDate,
            title: "睡前日记",
            content: item.content,
            score: item.moodScore,
            sections: [
              { label: "内容", value: item.content },
              { label: "状态", value: item.moodScore ? `${item.moodScore}/5` : null }
            ]
          }))
        : props.activeTab === "review"
          ? props.reviewItems.map((item) => ({
              id: item.id,
              date: item.reviewDate,
              title: item.tags?.trim() || "股市复盘",
              content: item.marketSummary || item.operations || item.holdingsReview || item.mistakes || item.tomorrowPlan || item.tags,
              score: item.disciplineScore,
              sections: [
                { label: "大盘结论", value: item.marketSummary },
                { label: "操作记录", value: item.operations },
                { label: "持仓观察", value: item.holdingsReview },
                { label: "错误复盘", value: item.mistakes },
                { label: "明日计划", value: item.tomorrowPlan },
                { label: "标签", value: item.tags },
                { label: "心情", value: item.emotionScore ? `${item.emotionScore}/5` : null },
                { label: "纪律", value: item.disciplineScore ? `${item.disciplineScore}/5` : null }
              ]
            }))
          : props.mediaItems.map((item) => ({
              id: item.id ?? item.watchDate,
              date: item.watchDate,
              title: item.title?.trim() || "影视陪伴",
              content: [item.episode, item.note].filter(Boolean).join(" · "),
              score: null,
              sections: [
                { label: "剧名", value: item.title },
                { label: "进度", value: item.episode },
                { label: "备注", value: item.note }
              ]
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

      <div className="grid gap-2.5 lg:grid-cols-2">
        {!items.length && <EmptyText text="还没有记录。" />}
        {items.map((item) => (
          <button className="archive-card text-left" key={item.id} type="button" onClick={() => setSelectedItem(item)}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="truncate text-[13px] font-semibold text-ink">{item.title}</h3>
              <span className="shrink-0 text-[11px] text-soft">{formatDayLabel(item.date)}</span>
            </div>
            <p className="archive-card-content">{item.content?.trim() || "这天还没写内容。"}</p>
            {item.score && <p className="mt-2 text-[11px] text-mint-700">评分 {item.score}/5</p>}
            <span className="mt-3 inline-flex text-[11px] font-semibold text-pink-500">查看详情</span>
          </button>
        ))}
      </div>

      {selectedItem && <ArchiveDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

function ArchiveDetailModal({ item, onClose }: { item: ArchiveListItem; onClose: () => void }) {
  const sections = filledSections(item.sections);

  return (
    <ModalPortal onClose={onClose}>
      <article className="writing-modal">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-soft">{formatDayLabel(item.date)}</p>
            <h3 className="text-base font-semibold">{item.title}</h3>
          </div>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="writing-body space-y-3">
          {sections.length ? (
            sections.map((section) => (
              <section className="archive-detail-section" key={section.label}>
                <p className="mb-1 text-[11px] font-semibold text-mint-700">{section.label}</p>
                <p className="whitespace-pre-wrap text-[13px] leading-6 text-ink">{section.value}</p>
              </section>
            ))
          ) : (
            <EmptyText text="这天还没写内容。" />
          )}
        </div>
      </article>
    </ModalPortal>
  );
}

function TaskTitleEditModal(props: {
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
  difficulty: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onDueTimeChange: (value: string) => void;
  onDifficultyChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <ModalPortal onClose={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">编辑任务</h3>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="space-y-2">
          <input className="field" autoFocus maxLength={200} placeholder="任务标题" value={props.title} onChange={(event) => props.onTitleChange(event.target.value)} />
          <textarea className="task-description-field" maxLength={2000} placeholder="任务详情：背景、步骤、完成标准、灵感都可以放在这里" value={props.description} onChange={(event) => props.onDescriptionChange(event.target.value)} />
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
            <input className="field" type="date" value={props.dueDate} onChange={(event) => props.onDueDateChange(event.target.value)} />
            <input className="field" type="time" value={props.dueTime} onChange={(event) => props.onDueTimeChange(event.target.value)} disabled={!props.dueDate} />
            <select className="field" value={props.difficulty} onChange={(event) => props.onDifficultyChange(event.target.value)}>
              <DifficultyOptions />
            </select>
              <button className="icon-button w-auto px-3 text-[11px]" type="button" aria-label="清空截止时间" onClick={() => props.onDueDateChange("")}>
              清空截止
            </button>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </ModalPortal>
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
    <ModalPortal onClose={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit}>
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
              <CategoryOptionsGrouped categories={props.categories} />
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
          <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </ModalPortal>
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
    <ModalPortal onClose={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit}>
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
          <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </ModalPortal>
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
    <ModalPortal onClose={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit}>
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
          <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            写入时间轴
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}

function CategoryEditModal(props: {
  name: string;
  dimensionKey: DimensionKey;
  color: string;
  targetHours: string;
  onNameChange: (value: string) => void;
  onDimensionKeyChange: (value: DimensionKey) => void;
  onTargetHoursChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <ModalPortal onClose={props.onClose}>
      <form className="time-modal" onSubmit={props.onSubmit}>
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

        <label className="mt-2 block text-[11px] text-soft">
          能力维度
          <select className="field mt-1" value={props.dimensionKey} onChange={(event) => props.onDimensionKeyChange(event.target.value as DimensionKey)}>
            <DimensionOptions />
          </select>
        </label>

        <div className="mt-2 grid grid-cols-[auto_1fr] items-end gap-2">
          <div>
            <p className="mb-1 text-[11px] text-soft">标签预览</p>
            <CategoryTag category={{ id: 0, name: props.name || "类型预览", dimensionKey: props.dimensionKey, color: props.color, targetMinutes: 6000, totalMinutes: 0 }} />
          </div>
          <label className="text-[11px] text-soft">
            目标小时
            <input className="field mt-1" min="1" type="number" value={props.targetHours} onChange={(event) => props.onTargetHoursChange(event.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            保存
          </button>
        </div>
      </form>
    </ModalPortal>
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
    <ModalPortal onClose={props.onClose}>
      <form className="time-modal max-w-[560px]" onSubmit={props.onSubmit}>
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
          <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            完成并写入时间轴
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}

function CompletedTasksModal(props: {
  tasks: Task[];
  categories: Category[];
  rewardsByTaskId: Map<number, { xp: number; coins: number; events: RewardEvent[] }>;
  onClose: () => void;
}) {
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  return (
    <ModalPortal onClose={props.onClose}>
      <section className="task-selection-modal">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-soft">已完成任务</p>
            <h3 className="text-sm font-semibold">完成记录</h3>
          </div>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="task-pool-list">
          {props.tasks.length ? (
            props.tasks.map((task) => {
              const category = task.categoryId ? categoryById.get(task.categoryId) : null;
              const reward = props.rewardsByTaskId.get(task.id);
              return (
                <article className="completed-task-row" key={task.id}>
                  <span className="task-pool-line">
                    <strong>{task.title}</strong>
                    {category ? <CategoryTag category={category} /> : <span className="task-pool-empty-category">未分类</span>}
                    <span className="task-pool-inline-meta">完成 {formatDateTime(task.completedAt)}</span>
                    <span className="completed-reward-pill">{reward ? `+${reward.xp} XP +${reward.coins} 金币` : "未记录奖励"}</span>
                  </span>
                  {task.completionNote?.trim() && <p className="mt-1 truncate text-[10px] text-soft" title={task.completionNote}>感想：{task.completionNote}</p>}
                </article>
              );
            })
          ) : (
            <EmptyText text="还没有已完成任务。" />
          )}
        </div>
      </section>
    </ModalPortal>
  );
}

function TaskCreateModal(props: {
  title: string;
  description: string;
  categoryId: string;
  categories: Category[];
  difficulty: string;
  dueDate: string;
  dueTime: string;
  planEnabled: boolean;
  planStart: string;
  planEnd: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onDifficultyChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onDueTimeChange: (value: string) => void;
  onPlanEnabledChange: (value: boolean) => void;
  onPlanStartChange: (value: string) => void;
  onPlanEndChange: (value: string) => void;
  onClearDueDate: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  onSubmitAndTake: () => void;
}) {
  return (
    <ModalPortal onClose={props.onClose}>
      <form className="time-modal task-create-modal" onSubmit={props.onSubmit}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-mint-700">发布悬赏</p>
            <h3 className="text-sm font-semibold">新增任务到任务池</h3>
          </div>
          <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="task-create-layout">
          <label className="task-form-field task-form-field-wide">
            <span>任务标题</span>
            <input className="field" placeholder="写一个清楚的悬赏标题" value={props.title} onChange={(event) => props.onTitleChange(event.target.value)} autoFocus />
          </label>
          <label className="task-form-field task-form-field-wide">
            <span>任务详情</span>
            <textarea className="task-description-field" maxLength={2000} placeholder="可以写背景、完成标准、步骤或灵感，任务列表里会保留一行摘要" value={props.description} onChange={(event) => props.onDescriptionChange(event.target.value)} />
          </label>
          <label className="task-form-field">
            <span>事件类型</span>
            <select className="field" value={props.categoryId} onChange={(event) => props.onCategoryChange(event.target.value)} required>
              <option value="">选择技能/主题</option>
              <CategoryOptionsGrouped categories={props.categories} />
            </select>
          </label>
          <label className="task-form-field">
            <span>难度</span>
            <select className="field" value={props.difficulty} onChange={(event) => props.onDifficultyChange(event.target.value)}>
              <DifficultyOptions />
            </select>
          </label>
          <label className="task-form-field task-form-field-due">
            <span>截止</span>
            <span className="task-inline-inputs">
              <input className="field" type="date" value={props.dueDate} onChange={(event) => props.onDueDateChange(event.target.value)} />
              <input className="field" type="time" value={props.dueTime} onChange={(event) => props.onDueTimeChange(event.target.value)} disabled={!props.dueDate} />
              {props.dueDate && (
                <button className="icon-button h-8 w-auto px-3 text-[11px]" type="button" aria-label="清空截止时间" onClick={props.onClearDueDate}>
                  清空
                </button>
              )}
            </span>
          </label>
          <label className="task-form-field task-form-field-plan">
            <span className="task-checkbox-label">
              <input className="accent-mint-500" type="checkbox" checked={props.planEnabled} onChange={(event) => props.onPlanEnabledChange(event.target.checked)} />
              预设时段
            </span>
            <span className="task-inline-inputs">
              <input className="field" type="time" value={props.planStart} onChange={(event) => props.onPlanStartChange(event.target.value)} disabled={!props.planEnabled} />
              <input className="field" type="time" value={props.planEnd} onChange={(event) => props.onPlanEndChange(event.target.value)} disabled={!props.planEnabled} />
            </span>
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>
            取消
          </button>
          <button className="primary-button px-5" type="submit">
            发布
          </button>
          <button className="primary-button px-5" type="button" onClick={props.onSubmitAndTake}>
            发布并接取
          </button>
        </div>
      </form>
    </ModalPortal>
  );
}

function CategoryTag({ category }: { category: Category }) {
  return (
    <span className="category-tag" title={`${dimensionMeta(category.dimensionKey).label} · ${category.name}`} style={{ backgroundColor: `${category.color}24`, borderColor: `${category.color}88`, color: category.color }}>
      <i style={{ backgroundColor: category.color }} />
      <span>{category.name}</span>
    </span>
  );
}

function DimensionOptions() {
  return (
    <>
      {CORE_DIMENSIONS.map((dimension) => (
        <option key={dimension.key} value={dimension.key}>
          {dimension.label}
        </option>
      ))}
      <option value="leisure">兴趣成长</option>
      <option value="foundation">基础状态</option>
    </>
  );
}

function CategoryOptionsGrouped({ categories }: { categories: Category[] }) {
  return (
    <>
      {visibleDimensions(categories).map((dimension) => {
        const items = categoriesInDimension(categories, dimension.key);
        if (!items.length) return null;
        return (
          <optgroup key={dimension.key} label={dimension.label}>
            {items.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

function AbilityOverview({ categories, onEdit, onDelete }: { categories: Category[]; onEdit: (category: Category) => void; onDelete: (category: Category) => void }) {
  if (!categories.length) return <EmptyText text="还没有技能/主题。" />;
  const totalCoreMinutes = CORE_DIMENSIONS.reduce((sum, dimension) => sum + dimensionTotalMinutes(categories, dimension.key), 0);

  return (
    <div className="ability-list">
      {visibleDimensions(categories).map((dimension) => {
        const items = categoriesInDimension(categories, dimension.key);
        if (!items.length) return null;
        const minutes = dimensionTotalMinutes(categories, dimension.key);
        const percent = totalCoreMinutes && dimension.key !== "foundation" && dimension.key !== "leisure" ? Math.max(4, Math.round((minutes / totalCoreMinutes) * 100)) : 0;
        return (
          <section className="ability-card" key={dimension.key}>
            <div className="ability-head">
              <span className="ability-title">
                <i style={{ backgroundColor: dimension.color }} />
                {dimension.label}
              </span>
              <span className="text-[11px] text-soft">{formatDuration(minutes)}</span>
            </div>
            <p className="mb-2 truncate text-[10px] text-soft">{dimension.hint}</p>
            {percent > 0 && (
              <div className="mb-2 h-1.5 rounded-full bg-white/80">
                <div className="progress-fill !h-1.5" style={{ width: `${percent}%`, backgroundColor: dimension.color }} />
              </div>
            )}
            <div className="space-y-1.5">
              {items.map((item) => {
                const hours = item.totalMinutes / 60;
                const skillPercent = Math.min(100, Math.round((item.totalMinutes / item.targetMinutes) * 100));
                return (
                  <div className="category-row" key={item.id}>
                    <CategoryTag category={item} />
                    <div className="min-w-0 flex-1">
                      <div className="h-1.5 rounded-full bg-white/80">
                        <div className="progress-fill !h-1.5" style={{ width: `${skillPercent}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                    <span className="w-10 shrink-0 text-right text-[11px] text-soft">{hours.toFixed(1)}h</span>
                    <button className="icon-button h-7 w-7 shrink-0" aria-label={`编辑${item.name}`} onClick={() => onEdit(item)}>
                      <Pencil size={13} />
                    </button>
                    <button className="icon-button h-7 w-7 shrink-0" aria-label={`删除${item.name}`} onClick={() => onDelete(item)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type TimelineLayout = {
  item: TimelineItem;
  start: number;
  end: number;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
};

function timelineEndMinute(item: TimelineItem) {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  return item.marker === "sleep" && end <= start ? end + 24 * 60 : end;
}

function timelineDurationMinutes(item: TimelineItem) {
  if (item.marker !== "sleep") return durationMinutes(item);
  return Math.max(1, timelineEndMinute(item) - timeToMinutes(item.startTime));
}

function timelineVisualMinute(minute: number) {
  if (minute <= COMPRESSED_START_MINUTE) return minute;
  if (minute < COMPRESSED_END_MINUTE) {
    return COMPRESSED_START_MINUTE + ((minute - COMPRESSED_START_MINUTE) / (COMPRESSED_END_MINUTE - COMPRESSED_START_MINUTE)) * COMPRESSED_VISUAL_MINUTES;
  }
  return minute - (COMPRESSED_END_MINUTE - COMPRESSED_START_MINUTE) + COMPRESSED_VISUAL_MINUTES;
}

function timelineTopPercent(minute: number) {
  return (timelineVisualMinute(minute) / TIMELINE_VISUAL_MINUTES) * 100;
}

function layoutTimelineBlocks(items: TimelineItem[], dayStart: number, dayEnd: number) {
  const layouts: TimelineLayout[] = items
    .filter((item) => item.marker !== "water")
    .map((item) => {
      const rawStart = timeToMinutes(item.startTime);
      const rawEnd = timelineEndMinute(item);
      const start = Math.max(dayStart, rawStart);
      const end = Math.min(dayEnd, rawEnd);
      if (end <= dayStart || start >= dayEnd || end <= start) return null;
      return {
        item,
        start,
        end,
        top: timelineTopPercent(start),
        height: Math.max(2.8, timelineTopPercent(end) - timelineTopPercent(start)),
        lane: 0,
        laneCount: 1
      };
    })
    .filter((item): item is TimelineLayout => Boolean(item))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let group: TimelineLayout[] = [];
  let groupEnd = -1;
  const applyGroupLanes = () => {
    const laneEnds: number[] = [];
    for (const item of group) {
      const reusableLane = laneEnds.findIndex((end) => end <= item.start);
      item.lane = reusableLane === -1 ? laneEnds.length : reusableLane;
      laneEnds[item.lane] = item.end;
    }
    group.forEach((item) => {
      item.laneCount = Math.max(1, laneEnds.length);
    });
  };

  for (const item of layouts) {
    if (!group.length || item.start < groupEnd) {
      group.push(item);
      groupEnd = Math.max(groupEnd, item.end);
      continue;
    }
    applyGroupLanes();
    group = [item];
    groupEnd = item.end;
  }
  applyGroupLanes();
  return layouts;
}

function TimelineBoard({ items, onDelete }: { items: TimelineItem[]; onDelete: (id: number) => void }) {
  const dayStart = HOUR_START * 60;
  const dayEnd = HOUR_END * 60;
  const blockLayouts = layoutTimelineBlocks(items, dayStart, dayEnd);
  const waterItems = items.filter((item) => item.marker === "water");

  return (
    <div className="timeline-board">
      {timelineTicks.map((tick) => {
        const top = timelineTopPercent(tick.minute);
        return (
          <div key={`${tick.minute}-${tick.label}`} className={`timeline-hour ${"compressed" in tick && tick.compressed ? "timeline-hour-compressed" : ""}`} style={{ top: `${top}%` }}>
            <span>{tick.label}</span>
          </div>
        );
      })}

      {blockLayouts.map(({ item, top, height, lane, laneCount }) => {
        const minutes = timelineDurationMinutes(item);
        const short = minutes < 15;
        const planned = item.kind === 0;
        const sleepBlock = item.marker === "sleep";
        const laneWidth = 74 / laneCount;
        return (
          <div
            key={item.id}
            className={`timeline-block ${short ? "timeline-block-short" : ""} ${laneCount > 1 ? "timeline-block-overlap" : ""} ${planned ? "timeline-block-planned" : "timeline-block-actual"} ${sleepBlock ? "timeline-block-sleep" : ""}`}
            title={[`${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)} · ${sourceText(item)} · ${formatDuration(minutes)}`, item.title, item.note ? `备注：${item.note}` : ""].filter(Boolean).join("\n")}
            style={{
              top: `${top}%`,
              height: `max(${height}%, ${short ? 28 : 34}px)`,
              borderColor: item.color,
              left: `${23 + lane * laneWidth}%`,
              width: `calc(${laneWidth}% - ${laneCount > 1 ? 4 : 0}px)`
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="timeline-block-title inline-flex max-w-full items-center gap-1.5">
                {sleepBlock && <Moon className="shrink-0" size={12} />}
                <span className="truncate">{item.title}</span>
              </p>
              <p className="timeline-block-meta">{`${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)} · ${sourceText(item)} · ${formatDuration(minutes)}`}</p>
            </div>
            {!sleepBlock && (
              <button className="timeline-delete" aria-label="删除时间记录" onClick={() => onDelete(item.id)}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      })}

      {waterItems.map((item) => {
        const start = Math.max(dayStart, timeToMinutes(item.startTime));
        const top = timelineTopPercent(start);
        return (
          <div key={`water-${item.id}-${item.startTime}`} className="timeline-point timeline-point-water" title={`${item.startTime.slice(0, 5)} · ${item.title}`} style={{ top: `${top}%` }}>
            <span className="timeline-point-dot">
              <Droplets size={12} />
            </span>
            <span className="truncate">{`${item.startTime.slice(0, 5)} ${item.title}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function sourceText(item: TimelineItem) {
  if (item.marker === "sleep") return "睡眠";
  if (item.kind === 0) return "安排";
  if (item.source === 1) return "计时";
  return "实际";
}

function TaskDimensionTabs(props: {
  dimensions: ReadonlyArray<(typeof ALL_DIMENSIONS)[number]>;
  active: TaskCategoryFilter;
  allCount: number;
  uncategorizedCount: number;
  dimensionCounts: Map<DimensionKey, number>;
  onChange: (value: TaskCategoryFilter) => void;
}) {
  return (
    <div className="task-tabs" aria-label="能力维度筛选">
      <button className={`task-tab ${props.active === "all" ? "task-tab-active" : ""}`} type="button" onClick={() => props.onChange("all")}>
        全部 <span>{props.allCount}</span>
      </button>
      {props.dimensions.map((dimension) => (
        <button className={`task-tab ${props.active === dimension.key ? "task-tab-active" : ""}`} type="button" key={dimension.key} onClick={() => props.onChange(dimension.key)}>
          <i style={{ backgroundColor: dimension.color }} />
          {dimension.label}
          <span>{props.dimensionCounts.get(dimension.key) ?? 0}</span>
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
  activeTimer: TimerSession | null;
  disabled: boolean;
  dragging: boolean;
  dragOver: boolean;
  onDone: () => void;
  onPinned: () => void;
  onCategoryChange: (categoryId: number | null) => void;
  onProgressChange: (progressPercent: number) => void;
  onTitleEdit: () => void;
  onStart: () => void;
  onPause: (timerId: number) => void;
  onFinish: (timer: TimerSession) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const { task, category, categories, plannedSchedule, activeTimer, disabled, dragging, dragOver, onDone, onPinned, onCategoryChange, onProgressChange, onTitleEdit, onStart, onPause, onFinish, onDelete, onDragStart, onDragEnter, onDragEnd, onDrop } = props;
  const active = Boolean(activeTimer);
  const estimatedReward = estimatePlannedTaskReward(task, plannedSchedule);
  const [editingProgress, setEditingProgress] = useState(false);
  const saveProgress = (value: string) => {
    const next = Number(value);
    setEditingProgress(false);
    if (Number.isFinite(next)) onProgressChange(next);
  };
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
        <div className="flex min-w-0 items-center gap-3">
          <input className="h-4 w-4 accent-mint-500" type="checkbox" checked={task.status === 2} onChange={onDone} />
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`task-title ${task.status === 2 ? "text-soft line-through" : ""}`}>{task.title}</span>
                <span className="task-created-inline">创建 {formatDateTime(task.createdAt)}</span>
                {category && <CategoryTag category={category} />}
                <DifficultyPill difficulty={task.difficulty} />
              </span>
              <span className="task-meta">{plannedSchedule ? `${plannedSchedule.startTime.slice(0, 5)}-${plannedSchedule.endTime.slice(0, 5)} · 安排` : "未安排时段"}</span>
              {task.description?.trim() && <span className="task-meta" title={task.description}>详情：{task.description}</span>}
              {estimatedReward && <span className="task-reward-estimate">预计 +{estimatedReward.xp} XP +{estimatedReward.coins} 金币</span>}
              {task.dueAt && <span className="task-meta">截止 {formatDateTime(task.dueAt)}</span>}
              <span className="task-progress-line">
                <button
                  className="task-progress-track"
                  type="button"
                  aria-label="编辑任务完成百分比"
                  title={`进度 ${task.progressPercent}%，点击编辑`}
                  onClick={() => setEditingProgress(true)}
                >
                  <span className="task-progress-fill" style={{ width: `${task.progressPercent}%` }} />
                </button>
                {editingProgress && (
                  <input
                    className="field task-progress-input"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={task.progressPercent}
                    autoFocus
                    aria-label="任务完成百分比"
                    onBlur={(event) => saveProgress(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setEditingProgress(false);
                    }}
                  />
                )}
              </span>
              {task.status === 2 && task.completionNote?.trim() && <span className="task-meta" title={task.completionNote}>感想：{task.completionNote}</span>}
            </span>
          </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {activeTimer && <span className="timer-pill">{elapsedText(activeTimer.startTime)}</span>}
        <button className="icon-button h-8 w-8" aria-label="编辑任务" title="编辑任务" onClick={onTitleEdit}>
          <Pencil size={14} />
        </button>
        <select className="task-category-picker" aria-label="修改事件类型" value={task.categoryId ?? ""} onChange={(event) => onCategoryChange(event.target.value ? Number(event.target.value) : null)}>
          <option value="">未分类</option>
          <CategoryOptionsGrouped categories={categories} />
        </select>
        {activeTimer ? (
          <>
            <button className="icon-button" aria-label="暂停并记录阶段完成" title="暂停并记录阶段完成" onClick={() => onPause(activeTimer.id)}>
              <Pause size={17} />
            </button>
            <button className="icon-button" aria-label="结束并计入时间轴" title="结束并计入时间轴" onClick={() => onFinish(activeTimer)}>
              <Square size={17} />
            </button>
          </>
        ) : (
          <button className="icon-button" aria-label="开始计时" disabled={disabled} onClick={onStart}>
            <Play size={17} />
          </button>
        )}
        <button className="icon-button" aria-label="取消今日任务" title="取消今日任务，放回任务池" onClick={onDelete}>
          <X size={15} />
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

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mini-stat">
      <p className="text-[11px] text-soft">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function WritingShortcut({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <button className={`writing-shortcut ${done ? "writing-shortcut-done" : ""}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <DoneMark done={done} />
    </button>
  );
}

function DoneMark({ done }: { done: boolean }) {
  return done ? <CheckCircle2 className="text-mint-500" size={16} /> : <X className="text-pink-400" size={16} />;
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{text}</p>;
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00+08:00`));
}

function filledSections(sections: ArchiveListItem["sections"]) {
  return sections.filter((section) => String(section.value ?? "").trim());
}

function HistoryPage(props: {
  selectedDate: string;
  onBack: () => void;
  archiveTab: ArchiveTab;
  sleepRange: SleepRange;
  stats: Dashboard["weeklyStats"] | undefined;
  sleep: SleepRecord | null;
  categories: Category[];
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
    <section className="grid gap-2.5">
      <Panel
        title="全部记录"
        icon={<ListFilter size={17} />}
        className="min-h-[420px]"
        action={<button className="icon-button h-8 w-auto px-3 text-[11px]" type="button" aria-label="回到工作台" onClick={props.onBack}>回工作台</button>}
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

      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-2.5">
        <Panel
          title={`晨写 · ${formatDayLabel(props.selectedDate)}`}
          icon={<SunMedium size={17} />}
          action={
            <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" aria-label="打开晨写编辑" onClick={() => props.onOpenWritingModal("morning")}>
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
            <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" aria-label="打开日记编辑" onClick={() => props.onOpenWritingModal("journal")}>
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
            <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" aria-label="打开复盘编辑" onClick={() => props.onOpenWritingModal("review")}>
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

        <Panel title="能力总统计" icon={<TimerReset size={17} />}>
          <AbilityTotalStats categories={props.categories} />
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
      </div>
    </section>
  );
}

function AbilityTotalStats({ categories }: { categories: Category[] }) {
  const items = categories.filter((category) => category.totalMinutes > 0).sort((a, b) => b.totalMinutes - a.totalMinutes);
  const coreDimensions = CORE_DIMENSIONS
    .map((dimension) => ({ ...dimension, minutes: dimensionTotalMinutes(categories, dimension.key) }))
    .filter((dimension) => dimension.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const extraDimensions = EXTRA_DIMENSIONS
    .map((dimension) => ({ ...dimension, minutes: dimensionTotalMinutes(categories, dimension.key) }))
    .filter((dimension) => dimension.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const coreItems = items.filter((item) => isCoreDimensionKey(item.dimensionKey));
  const totalMinutes = coreDimensions.reduce((sum, item) => sum + item.minutes, 0);
  const extraTotalMinutes = extraDimensions.reduce((sum, item) => sum + item.minutes, 0);
  if (!totalMinutes && !extraTotalMinutes) {
    return <EmptyText text="还没有能力耗时记录。" />;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        <Metric label="六维累计" value={formatDuration(totalMinutes)} />
        <Metric label="六维技能" value={`${coreItems.length}`} />
      </div>
      {!!coreDimensions.length && (
        <div className="space-y-2">
          {coreDimensions.map((dimension) => {
          const percent = Math.max(1, Math.round((dimension.minutes / totalMinutes) * 100));
          const skillItems = categoriesInDimension(coreItems, dimension.key);
          return (
            <div className="rounded-card bg-white/55 p-2" key={dimension.key}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <span className="ability-title">
                  <i style={{ backgroundColor: dimension.color }} />
                  {dimension.label}
                </span>
                <span className="shrink-0 text-soft">{formatDuration(dimension.minutes)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/80">
                <div className="progress-fill" style={{ width: `${percent}%`, backgroundColor: dimension.color }} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skillItems.map((item) => (
                  <span className="text-[10px] text-soft" key={item.id}>
                    {item.name} {formatDuration(item.totalMinutes)}
                  </span>
                ))}
              </div>
            </div>
          );
          })}
        </div>
      )}
      {!!extraDimensions.length && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-soft">附加记录，不计入六维</p>
          {extraDimensions.map((dimension) => {
            const percent = Math.max(1, Math.round((dimension.minutes / Math.max(1, extraTotalMinutes)) * 100));
            const skillItems = categoriesInDimension(items, dimension.key);
            return (
              <div className="rounded-card bg-white/45 p-2" key={dimension.key}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                  <span className="ability-title">
                    <i style={{ backgroundColor: dimension.color }} />
                    {dimension.label}
                  </span>
                  <span className="shrink-0 text-soft">{formatDuration(dimension.minutes)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/80">
                  <div className="progress-fill" style={{ width: `${percent}%`, backgroundColor: dimension.color }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skillItems.map((item) => (
                    <span className="text-[10px] text-soft" key={item.id}>
                      {item.name} {formatDuration(item.totalMinutes)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
