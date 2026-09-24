// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../api";
import type { FeedbackActions } from "../feedback";
import { queryKeys } from "../query";
import { WorkspaceRouter } from ".";

afterEach(cleanup);

const task = { id: 11, title: "R1C integration", description: "real contract", categoryId: 1, status: 0, priority: 2, difficulty: 2, pinned: 0, sortOrder: 1, dueAt: null, progressPercent: 0, version: 1, createdAt: "2026-09-19T00:00:00Z", completedAt: null, completionNote: null };
const current = { id: 5, taskId: 11, startTime: "2026-09-19T09:00:00Z", durationMinutes: 0, status: 0, version: 1, recordTimezone: "Asia/Shanghai", segments: [{ id: 1, timerSessionId: 5, taskId: 11, status: 0, startedAt: "2026-09-19 09:00:00", endedAt: null, businessDate: "2026-09-19" }] };

function dashboard(date: string) {
  return { date, stockReviewRecord: null, categories: [{ id: 1, name: "coding", color: "#35C99A", icon: "code", dimensionKey: "career", targetMinutes: 6000, sortOrder: 1, enabled: 1, totalMinutes: 0 }], categoryTotals: [], schedules: [], sleepRecord: null, journalRecord: null, morningWritingRecord: null, waterRecord: null, growth: { level: 1, xpTotal: 0, coins: 0, xpInLevel: 0, xpForNextLevel: 100 }, rewardEvents: [], taskRewardEvents: [], aiInsights: [], weeklySeries: [], monthlySleepSeries: [], weeklyStats: { totalMinutes: 0, completedTasks: 0, journalDays: 0, stockReviewDays: 0 } };
}

function requestFor(active: boolean | null = null, writingSlots: Array<{ slotKey: "MORNING_WRITING" | "JOURNAL" | "STOCK_REVIEW"; enabled: boolean; sortOrder: number }> = []) {
  return vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/daily-carryovers" && init?.method === "POST") return {};
    if (path.startsWith("/api/dashboard?date=")) return dashboard(path.split("=")[1]);
    if (path === "/api/tasks") return [task];
    if (path.startsWith("/api/task-days/continuations")) return [];
    if (path.startsWith("/api/task-days?")) return { taskDate: "2026-09-19", taskIds: [11] };
    if (path === "/api/timer-sessions/current") return active ? current : null;
    if (path.startsWith("/api/timer-sessions/actual-time")) return { date: "2026-09-19", timezone: "Asia/Shanghai", entries: [] };
    if (path === "/api/settings") return { profile: session.user, appearance: { theme: "light", reducedMotion: false }, rewards: { show: true }, continuation: { mode: "manual", automaticAvailable: false }, categories: [], writingSlots };
    if (path === "/api/rewards") return { growth: dashboard("2026-09-19").growth, items: [], events: [], redemptions: [] };
    if (path.startsWith("/api/growth/overview")) return { period: { days: 30, from: "2026-08-21", to: "2026-09-19", timezone: "Asia/Shanghai" }, hero: dashboard("2026-09-19").growth, summary: { actualMinutes: 0, mappedActualMinutes: 0, completedTaskCount: 0, habitCompletedCount: 0 }, dimensions: [], unmapped: { actualMinutes: 0, completedTaskCount: 0, lastActivityDate: null }, recent: [] };
    if (path === "/api/growth/dimensions") return { dimensions: [], categories: [] };
    if (path.startsWith("/api/morning-writings") || path.startsWith("/api/journals") || path.startsWith("/api/stock-reviews")) return [];
    return {};
  }) as unknown as Request;
}

const feedback: FeedbackActions = { notice: vi.fn(), confirm: vi.fn(), taskReward: vi.fn(), recordReward: vi.fn() };
const session = { user: { id: 7, username: "owner", displayName: "Owner", timezone: "Asia/Shanghai" }, logout: vi.fn() };

function renderShell(path: string, request = requestFor()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>{children}</MemoryRouter></QueryClientProvider>;
  return { ...render(<WorkspaceRouter request={request} session={session} feedback={feedback} />, { wrapper }), client, request };
}

function HistoryDriver() {
  const navigate = useNavigate();
  return <><button type="button" onClick={() => navigate(-1)}>test-back</button><button type="button" onClick={() => navigate(1)}>test-forward</button></>;
}

function renderHistoryShell(request = requestFor()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/today?date=2026-09-19", "/tasks?date=2026-09-19"]} initialIndex={1}><HistoryDriver /><WorkspaceRouter request={request} session={session} feedback={feedback} /></MemoryRouter></QueryClientProvider>);
}

describe("R1C router and AppShell", () => {
  it("opens a task detail deep link directly and preserves it on a fresh render", async () => {
    renderShell("/tasks/11?date=2026-09-19");
    expect(await screen.findByRole("heading", { name: "R1C integration" })).toBeTruthy();
    expect(screen.getByText("已接取")).toBeTruthy();
    expect(document.title).toContain("任务详情");
  });

  it("redirects root to the current Today route", async () => {
    renderShell("/");
    expect(await screen.findByRole("heading", { name: "今日" })).toBeTruthy();
    expect(document.title).toContain("今日");
  });

  it("uses URL navigation rather than pageMode", async () => {
    renderShell("/today?date=2026-09-19");
    fireEvent.click((await screen.findAllByRole("link", { name: "任务" }))[0]);
    expect(await screen.findByRole("heading", { name: "任务", level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /R1C integration/ }));
    expect(await screen.findByRole("heading", { name: "R1C integration" })).toBeTruthy();
  });

  it("honors browser-style back and forward history", async () => {
    renderHistoryShell();
    expect(await screen.findByRole("heading", { name: "任务", level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "test-back" }));
    expect(await screen.findByRole("heading", { name: "今日" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "test-forward" }));
    expect(await screen.findByRole("heading", { name: "任务", level: 1 })).toBeTruthy();
  });

  it("keeps one current-session query while route composition deduplicates Timer controls", async () => {
    const request = requestFor(true);
    renderShell("/today?date=2026-09-19", request);
    expect(await screen.findByLabelText("当前专注控制")).toBeTruthy();
    expect(screen.queryByLabelText("当前计时")).toBeNull();
    fireEvent.click((await screen.findAllByRole("link", { name: "文字" }))[0]);
    expect(await screen.findByLabelText("当前计时")).toBeTruthy();
    const currentCalls = (request as ReturnType<typeof vi.fn>).mock.calls.filter(([path]) => path === "/api/timer-sessions/current");
    expect(currentCalls).toHaveLength(1);
  });

  it.each(["/calendar", "/journal", "/growth", "/rewards", "/tools", "/insights", "/settings"])("keeps existing route %s usable", async (path) => {
    renderShell(`${path}?date=2026-09-19`);
    await waitFor(() => expect(document.title).not.toContain("工作台 ·"));
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("isolates date query caches", async () => {
    const { client } = renderShell("/tasks?date=2026-09-19");
    await screen.findByRole("heading", { name: "任务", level: 1 });
    client.setQueryData(queryKeys.today(7, "2026-09-19"), { date: "2026-09-19" });
    client.setQueryData(queryKeys.today(7, "2026-09-20"), { date: "2026-09-20" });
    expect(client.getQueryData(queryKeys.today(7, "2026-09-19"))).not.toEqual(client.getQueryData(queryKeys.today(7, "2026-09-20")));
  });

  it("clearing the client removes user A data before user B", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.tasks(1), [task]);
    client.clear();
    expect(client.getQueryData(queryKeys.tasks(1))).toBeUndefined();
    expect(client.getQueryData(queryKeys.tasks(2))).toBeUndefined();
  });

  it("keeps mobile primary actions compact and moves overflow actions into More", async () => {
    const slots = [
      { slotKey: "MORNING_WRITING" as const, enabled: true, sortOrder: 10 },
      { slotKey: "JOURNAL" as const, enabled: true, sortOrder: 20 },
      { slotKey: "STOCK_REVIEW" as const, enabled: true, sortOrder: 30 }
    ];
    const request = requestFor(null, slots);
    renderShell("/today?date=2026-09-19", request);
    await waitFor(() => expect((request as ReturnType<typeof vi.fn>).mock.calls.some(([path]) => path === "/api/settings")).toBe(true));
    await screen.findByRole("checkbox", { name: "完成R1C integration" });
    fireEvent.click(await screen.findByRole("button", { name: "打开快捷操作" }));
    const menu = await screen.findByRole("menu");
    expect(menu.querySelector(".quick-add-primary")?.textContent).toContain("发布悬赏随手记记一笔支出喝水晨写更多…");
    expect(menu.querySelector(".quick-add-secondary")?.textContent).toContain("返回日记股市复盘安排计划补录实际记录睡眠记一笔收入转账");
    fireEvent.click(screen.getByRole("button", { name: "更多…" }));
    expect(menu.classList.contains("is-more-open")).toBe(true);
  });

  it("marks Settings to hide only its mobile Quick Action", async () => {
    const settings = renderShell("/settings?date=2026-09-19");
    await screen.findByRole("heading", { name: "设置" });
    expect(document.querySelector(".quick-add-wrap")?.classList.contains("is-mobile-hidden")).toBe(true);
    settings.unmount();
    renderShell("/today?date=2026-09-19");
    await screen.findByRole("heading", { name: "今日" });
    expect(document.querySelector(".quick-add-wrap")?.classList.contains("is-mobile-hidden")).toBe(false);
    expect(screen.getByRole("button", { name: "打开快捷操作" })).toBeTruthy();
  });

  it("adds Growth to desktop navigation while mobile navigation stays five items", async () => {
    renderShell("/growth?date=2026-09-19");
    expect(await screen.findByRole("heading", { name: "我的成长" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "成长" })).toHaveLength(1);
    expect(document.querySelectorAll(".mobile-nav .shell-link")).toHaveLength(5);
  });

  it("closes Quick Action on outside tap, Escape, action selection, and route change", async () => {
    renderShell("/today?date=2026-09-19");
    const trigger = await screen.findByRole("button", { name: "打开快捷操作" });
    fireEvent.click(trigger); fireEvent.pointerDown(document.body); expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger); fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger); fireEvent.click(screen.getByRole("button", { name: "更多…" })); fireEvent.click(screen.getByRole("button", { name: "安排计划" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "打开快捷操作" }));
    fireEvent.change(screen.getByLabelText("工作日期"), { target: { value: "2026-09-20" } });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});
