// Public UI acceptance fixture; all data and mutations stay in this disposable page.
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { WorkspaceRouter } from "../../apps/web/src/app/shell";
import { ApplicationFeedback } from "../../apps/web/src/app/feedback";
import { I18nProvider } from "../../apps/web/src/app/i18n";
import "../../apps/web/src/styles.css";

const timezone = "Asia/Shanghai";
const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const profile = { id: 7, username: "qa", displayName: "冒险者", timezone };
const category = { id: 1, name: "编程", color: "#35C99A", icon: "code", dimensionKey: "career", enabled: 1, sortOrder: 1, targetMinutes: 60, totalMinutes: 0 };
const task = { id: 11, title: "完成项目验收", categoryId: 1, projectId: null, status: 0, priority: 2, difficulty: 2, pinned: 1, sortOrder: 1, dueAt: new Date(Date.now() + 86400000).toISOString(), progressPercent: 0, version: 1, createdAt: new Date().toISOString(), completionNote: null };
const bank = { id: 1, name: "生活账户", type: "BANK", currency: "CNY", includeInOverview: true, openingDate: date, archivedAt: null, version: 1, balanceCents: "100000" };
const financeCategory = { id: 2, kind: "EXPENSE", name: "日常", enabled: true, version: 1, sortOrder: 1 };
let xp = 30;
let templates = [{ id: 9, type: "EXPENSE", name: "宽带缴费", amountCents: "9900", accountId: 1, accountName: bank.name, categoryId: 2, categoryName: "日常", frequency: "MONTHLY", scheduleValue: 26, scheduledTime: "09:00", startDate: `${date.slice(0, 7)}-01`, endDate: null, enabled: true, version: 1 }];
let occurrences = [];
const growth = () => ({ level: 2, xpTotal: 100 + xp, coins: 4, xpInLevel: xp, xpForNextLevel: 200 });
const request = async (path, init) => {
  const body = init?.body ? JSON.parse(init.body) : {};
  if (path === "/api/finance/expenses") { xp += 5; return { transactionId: 30, reward: { xp: 5, coins: 2, reason: "财务记录" } }; }
  if (path === "/api/finance/recurring-templates" && init?.method === "POST") { templates = [...templates, { ...templates[0], ...body, id: 10 }]; return { id: 10, version: 1 }; }
  if (path === "/api/finance/recurring-occurrences/prepare") { const selected = templates.filter(item => body.templateIds.includes(item.id) && !occurrences.some(occurrence => occurrence.templateId === item.id)); occurrences = [...occurrences, ...selected.map((item) => ({ id: item.id, templateId: item.id, scheduledDate: `${date.slice(0,7)}-26`, scheduledTime: "09:00", status: "PENDING", amountCentsSnapshot: item.amountCents, templateName: item.name, categoryName: "日常", version: 1 }))]; return { created: selected.length, existing: body.templateIds.length - selected.length }; }
  if (path === "/api/hero/daily-entry/claim") return { claimed: false, reason: "ALREADY_ENTERED" };
  if (init?.method && init.method !== "GET") { if (path === "/api/daily-carryovers") return {}; throw new Error(`Unexpected QA write: ${path}`); }
  if (path === "/api/settings") return { profile, appearance: { theme: "light", reducedMotion: false, fontScale: 100, locale: "zh-CN" }, feedback: { showSuccess: true }, rewards: { show: true }, continuation: { mode: "manual" }, categories: [category], writingSlots: [] };
  if (path === "/api/onboarding/status") return { eligible: false, flow: null, hints: [] };
  if (path.startsWith("/api/hero?")) return { businessDate: date, timezone, profile: { ...profile, userId: 7, version: 1 }, progress: growth(), dailyStatus: { id: 1, statusKey: "GOOD", version: 1 }, earthOnlineDay: null };
  if (path.startsWith("/api/dashboard?")) return { date, categories: [category], categoryTotals: [], schedules: [], sleepRecord: null, waterRecord: { waterDate: date, cups: 3, targetCups: 8 }, stockReviewRecord: null, journalRecord: null, morningWritingRecord: null, growth: growth(), rewardEvents: [], taskRewardEvents: [], aiInsights: [], weeklySeries: [], monthlySleepSeries: [], weeklyStats: { totalMinutes: 0, completedTasks: 0, journalDays: 0, stockReviewDays: 0 } };
  if (path === "/api/tasks") return [task];
  if (path.startsWith("/api/task-days?")) return { taskDate: date, taskIds: [11], assignments: [] };
  if (path.startsWith("/api/task-days/continuations")) return [];
  if (path === "/api/timer-sessions/current") return new URLSearchParams(location.search).has("focused") ? { id: 5, taskId: 11, startTime: new Date(Date.now() - 900000).toISOString(), durationMinutes: 0, status: 0, version: 1, recordTimezone: timezone, segments: [{ id: 1, timerSessionId: 5, taskId: 11, status: 0, startedAt: new Date(Date.now() - 900000).toISOString(), endedAt: null, businessDate: date }] } : null;
  if (path.startsWith("/api/timer-sessions/actual-time")) return { date, timezone, entries: [], summary: { actualSeconds: 0 } };
  if (path.startsWith("/api/habits/summary")) return { items: [], specialized: { water: { cups: 3, targetCups: 8 }, sleep: { recorded: false }, morningWriting: { completed: false } } };
  if (path === "/api/projects") return [];
  if (path.startsWith("/api/finance/reminders")) return [{ templateId: 9, name: "宽带缴费", scheduledDate: `${date.slice(0,7)}-26`, scheduledTime: "09:00", dueAt: new Date(Date.now() + 2 * 86400000).toISOString(), amountCents: "9900", accountName: bank.name, categoryName: "日常" }];
  if (path.startsWith("/api/finance/overview")) return { currency: "CNY", month: date.slice(0,7), recordTimezone: timezone, totalAssetsCents: "100000", totalLiabilitiesCents: "0", netWorthCents: "100000", monthlyIncomeCents: "0", monthlyExpenseCents: "0", accountCount: 1, accounts: [bank], recentTransactions: [] };
  if (path.startsWith("/api/finance/accounts")) return [bank];
  if (path.startsWith("/api/finance/categories")) return [financeCategory];
  if (path.startsWith("/api/finance/transactions")) return { items: [], nextCursor: null };
  if (path.startsWith("/api/finance/recurring-templates")) return templates;
  if (path.startsWith("/api/finance/recurring-occurrences")) return occurrences;
  return [];
};
const route = new URLSearchParams(location.search).get("route") ?? "/today";
createRoot(document.getElementById("root")!).render(<I18nProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[route]}><ApplicationFeedback>{(feedback) => <WorkspaceRouter request={request} session={{ user: profile, logout() {} }} feedback={feedback} />}</ApplicationFeedback></MemoryRouter></QueryClientProvider></I18nProvider>);
