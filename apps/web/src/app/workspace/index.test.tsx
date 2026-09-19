// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../api";
import type { FeedbackActions } from "../feedback";
import { WorkspaceShell } from ".";

afterEach(cleanup);

const feedback: FeedbackActions = {
  notice: vi.fn(),
  confirm: vi.fn(),
  taskReward: vi.fn(),
  recordReward: vi.fn()
};

function dashboard(date: string) {
  return {
    date,
    activeTimer: null,
    activeTimers: [],
    dailyTaskIds: [],
    stockReviewRecord: null,
    tasks: [],
    categories: [],
    categoryTotals: [],
    schedules: [],
    sleepRecord: null,
    journalRecord: null,
    morningWritingRecord: null,
    waterRecord: null,
    mediaWatchRecord: null,
    growth: { level: 1, xpTotal: 0, coins: 0, xpInLevel: 0, xpForNextLevel: 100 },
    rewardEvents: [],
    taskRewardEvents: [],
    aiInsights: [],
    weeklySeries: [],
    monthlySleepSeries: [],
    weeklyStats: { totalMinutes: 0, completedTasks: 0, journalDays: 0, stockReviewDays: 0 }
  };
}

describe("WorkspaceShell ownership", () => {
  it("prepares a selected date before loading its Dashboard snapshot", async () => {
    const calls: string[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path.startsWith("/api/dashboard?date=")) return dashboard(path.split("=")[1]);
      return {};
    }) as unknown as Request;

    render(<WorkspaceShell request={request} session={{ user: { id: 1, username: "owner", displayName: "Owner" }, logout: vi.fn() }} feedback={feedback} />);
    const date = screen.getByLabelText<HTMLInputElement>("工作日期").value;

    await waitFor(() => expect(calls).toContain(`GET /api/dashboard?date=${date}`));
    expect(calls.slice(0, 2)).toEqual(["POST /api/daily-carryovers", `GET /api/dashboard?date=${date}`]);
  });

  it("refreshes with a read-only Dashboard request", async () => {
    const requestMock = vi.fn(async (path: string) => path.startsWith("/api/dashboard?date=") ? dashboard(path.split("=")[1]) : {});
    render(<WorkspaceShell request={requestMock as unknown as Request} session={{ user: { id: 1, username: "owner", displayName: "Owner" }, logout: vi.fn() }} feedback={feedback} />);
    await waitFor(() => expect(requestMock.mock.calls.some(([path]) => String(path).startsWith("/api/dashboard?date="))).toBe(true));
    requestMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledOnce());
    expect(String(requestMock.mock.calls[0][0])).toMatch(/^\/api\/dashboard\?date=/);
  });

  it("starts a new prepare-and-load lifecycle when the selected date changes", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push([path, init]);
      if (path.startsWith("/api/dashboard?date=")) return dashboard(path.split("=")[1]);
      return {};
    }) as unknown as Request;
    render(<WorkspaceShell request={request} session={{ user: { id: 1, username: "owner", displayName: "Owner" }, logout: vi.fn() }} feedback={feedback} />);
    await waitFor(() => expect(calls.some(([path]) => path.startsWith("/api/dashboard?date="))).toBe(true));
    calls.length = 0;

    fireEvent.change(screen.getByLabelText("工作日期"), { target: { value: "2026-09-20" } });

    await waitFor(() => expect(calls.some(([path]) => path === "/api/dashboard?date=2026-09-20")).toBe(true));
    expect(calls[0][0]).toBe("/api/daily-carryovers");
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ targetDate: "2026-09-20" });
    expect(calls[1][0]).toBe("/api/dashboard?date=2026-09-20");
  });
});
