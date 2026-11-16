// Isolated visual regression fixture: real public UI, in-memory responses, no API/DB writes.
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { WorkspaceRouter } from "../../apps/web/src/app/shell";
import { ApplicationFeedback } from "../../apps/web/src/app/feedback";
import { I18nProvider } from "../../apps/web/src/app/i18n";
import "../../apps/web/src/styles.css";

const date = "2026-11-16", timezone = "Asia/Shanghai";
const profile = { id: 7, username: "qa", displayName: "冒险者", timezone };
const hero = { level: 5, xpTotal: 1927, coins: 604, xpInLevel: 677, xpForNextLevel: 1250 };
const metrics = { actualMinutes: 235, actualSeconds: 14100, completionEventCount: 11, closedSegmentCount: 3 };
const dimension = { id: 1, dimensionKey: "career", name: "事业", color: "#5B8DEF", iconKey: "briefcase", sortOrder: 1, enabled: 1, version: 1 };
const titles = ["整理导游考试练习资料并打印", "调研股市相关开源方案", "梳理股市项目需求", "梳理导游考试内容", "为个人续期 SSL", "打印考前十页纸", "核对导入资料与来源", "这是一条需要在窄屏完整换行显示的很长的已完成任务标题，查看记录时仍然保留完成时间和进入详情的入口"];
const completions = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, taskId: index + 11, title: titles[index % titles.length], businessDate: date, occurredAt: `${date}T${String(11 - index).padStart(2, "0")}:26:00Z`, categoryIdAtOccurrence: 1 }));
const waterRecord = { waterDate: date, cups: 3, targetCups: 8 };
const sleepRecord = { id: 1, sleepDate: date, sleepStart: `${date}T03:10:00+08:00`, wakeTime: `${date}T11:30:00+08:00`, recordTimezone: timezone, durationMinutes: 500, qualityScore: 3 };
const request = async (path: string, init?: RequestInit): Promise<any> => {
  if (path === "/api/hero/daily-entry/claim") return { claimed: false, reason: "ALREADY_ENTERED" };
  if (path === "/api/daily-carryovers") return {};
  if (init?.method && init.method !== "GET") throw new Error(`Unexpected fixture write: ${path}`);
  if (path === "/api/settings") return { profile, appearance: { fontScale: 100, locale: "zh-CN", reducedMotion: true }, rewards: { show: true }, feedback: { showSuccess: true }, continuation: { mode: "manual" }, writingSlots: [] };
  if (path === "/api/onboarding/status") return { eligible: false, flow: null, hints: [] };
  if (path.startsWith("/api/hero?")) return { businessDate: date, timezone, profile: { ...profile, userId: 7, version: 1 }, progress: hero, dailyStatus: null, earthOnlineDay: null };
  if (path.startsWith("/api/dashboard?")) return { date, categories: [], schedules: [], sleepRecord, waterRecord, stockReviewRecord: null, journalRecord: null, morningWritingRecord: null, growth: hero, rewardEvents: [], aiInsights: [], weeklySeries: [], monthlySleepSeries: [], weeklyStats: { totalMinutes: 235, completedTasks: 11, journalDays: 0, stockReviewDays: 0 } };
  if (path.startsWith("/api/tasks/completions?")) return completions;
  if (path === "/api/tasks") return [];
  if (path.startsWith("/api/task-days?")) return { taskDate: date, taskIds: [], assignments: [] };
  if (path === "/api/timer-sessions/current") return null;
  if (path.startsWith("/api/timer-sessions/actual-time")) return { date, timezone, entries: [], summary: { actualSeconds: 14100 } };
  if (path.startsWith("/api/habits/summary")) return { items: [], specialized: { water: waterRecord, sleep: { recorded: true }, morningWriting: { completed: false } } };
  if (path.startsWith("/api/growth/dimensions")) return { dimensions: [dimension], categories: [] };
  if (path.startsWith("/api/growth/overview")) return { period: { days: 30, from: "2026-10-18", to: date, timezone }, hero, summary: { ...metrics, mappedActualMinutes: 235, mappedActualSeconds: 14100, completedTaskCount: 11, habitCompletedCount: 1 }, dimensions: [{ ...dimension, ...metrics, share: 1, completedTaskCount: 11, lastActivityDate: date }], trend: [], unmapped: { actualMinutes: 0, completedTaskCount: 0 }, categoryBreakdown: [], recent: completions.map(item => ({ ...item, kind: "TASK_COMPLETION", dimensionName: "事业", xpDelta: 10 })) };
  return [];
};
const route = new URLSearchParams(location.search).get("route") ?? "/today";
createRoot(document.getElementById("root")!).render(<I18nProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[`${route}?date=${date}`]}><ApplicationFeedback>{feedback => <WorkspaceRouter request={request} session={{ user: profile, logout() {} }} feedback={feedback} />}</ApplicationFeedback></MemoryRouter></QueryClientProvider></I18nProvider>);
