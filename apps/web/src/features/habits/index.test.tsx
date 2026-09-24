// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { HabitTodaySnapshot, RoutinesFeature } from ".";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); }
const habit = { id: 9, name: "阅读", description: "每天读一点", categoryId: null, startDate: "2026-09-01", endDate: null, recordMode: 0, unit: null, taskCompletionEnabled: 1, version: 1, archivedAt: null, rules: [{ id: 1, effectiveFrom: "2026-09-01", frequencyType: 0, weekdayMask: null, weeklyTarget: null, enabled: 1 }], goals: [{ id: 1, effectiveFrom: "2026-09-01", targetValue: "1.00" }] };
const summary = { date: "2026-09-21", weekFrom: "2026-09-21", weekTo: "2026-09-27", items: [{ ...habit, frequencyType: 0, targetValue: 1, status: "PENDING", occurrence: null }, { ...habit, id: 10, name: "力量训练", frequencyType: 2, weeklyTarget: 3, completed: 1, targetValue: 1, status: "IN_PROGRESS", occurrence: null }], specialized: { water: { cups: 5, targetCups: 8, status: "PARTIAL" }, morningWriting: { completed: true }, sleep: { recorded: true, durationMinutes: 450, qualityScore: 4 } } };

function Feature({ request, entry = "/routines?date=2026-09-21" }: { request: Request; entry?: string }) {
  return <QueryClientProvider client={client()}><MemoryRouter initialEntries={[entry]}><RoutinesFeature request={request} userId={7} date="2026-09-21" timezone="Asia/Shanghai" categories={[{ id: 3, name: "学习" }]} lifeContent={<div>专用生活组件</div>} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>;
}

describe("Habits", () => {
  it("shows daily and weekly-N progress and records through the Habit owner", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => init?.method === "POST" ? { id: 1, version: 1, status: 1 } : path.startsWith("/api/habits/summary") ? summary : [habit]) as Request;
    render(<Feature request={request} />);
    expect(await screen.findByText("阅读")).toBeTruthy(); expect(screen.getByText("本周 1/3 次")).toBeTruthy(); expect(screen.getByText("5/8 杯")).toBeTruthy();
    expect(screen.getByText("已保存正文")).toBeTruthy(); expect(screen.getByText("450 分钟")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "完成" })[0]);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/habits/9/occurrences", expect.objectContaining({ method: "POST", body: expect.stringContaining('"occurrenceDate":"2026-09-21"') })));
    fireEvent.click(screen.getByRole("button", { name: "跳过阅读" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/habits/9/occurrences", expect.objectContaining({ body: expect.stringContaining('"skipped":true') })));
    fireEvent.click(screen.getAllByRole("button", { name: "转悬赏" })[0]);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/habits/9/task", expect.objectContaining({ method: "POST" })));
  });

  it("uses a progressive create form for weekday and weekly targets", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => init?.method === "POST" ? { id: 11, version: 1 } : path.startsWith("/api/habits/summary") ? summary : [habit]) as Request;
    render(<Feature request={request} entry="/routines?date=2026-09-21&view=habits" />);
    await screen.findByText("阅读"); fireEvent.click(screen.getByRole("button", { name: "新建习惯" }));
    expect(screen.queryByLabelText("选择星期")).toBeNull(); fireEvent.change(screen.getByLabelText("频率"), { target: { value: "1" } }); expect(screen.getByLabelText("选择星期")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("频率"), { target: { value: "2" } }); expect(screen.getByLabelText("每周次数")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "每周复盘" } }); fireEvent.click(screen.getByRole("button", { name: "创建习惯" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/habits", expect.objectContaining({ method: "POST", body: expect.stringContaining('"weeklyTarget":3') })));
  });

  it("deep-links to immutable history and sends future-effective goal revisions", async () => {
    const detail = { habit, rules: habit.rules, goals: habit.goals, occurrences: [{ id: 4, occurrenceDate: "2026-09-20", status: 1, actualValue: "1.00", skipReason: null, source: 0, version: 1 }], links: [] };
    const request = vi.fn(async (path: string, init?: RequestInit) => init?.method === "PUT" ? { id: 9, version: 2 } : path === "/api/habits/9" ? detail : path.startsWith("/api/habits/summary") ? summary : [habit]) as Request;
    render(<Feature request={request} entry="/routines?date=2026-09-21&habit=9" />);
    expect(await screen.findByText("2026-09-20")).toBeTruthy(); expect(screen.getByText("手动记录")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("生效日期"), { target: { value: "2026-09-22" } });
    fireEvent.change(screen.getByLabelText("新目标"), { target: { value: "2" } }); fireEvent.click(screen.getByRole("button", { name: "更新目标" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/habits/9/goal", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"effectiveFrom":"2026-09-22"') })));
    fireEvent.change(screen.getByLabelText("新频率"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "周二" }));
    fireEvent.click(screen.getByRole("button", { name: "周四" }));
    fireEvent.click(screen.getByRole("button", { name: "更新频率" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/habits/9/rule", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"weekdayMask":21') })));
  });

  it("records an untruncated quantity through the owner", async () => {
    const quantity = { ...habit, id: 12, name: "页数", recordMode: 2, unit: "页", taskCompletionEnabled: 0 };
    const quantitySummary = { ...summary, items: [{ ...quantity, frequencyType: 0, targetValue: 30, status: "PENDING", occurrence: null }] };
    const request = vi.fn(async (path: string, init?: RequestInit) => init?.method === "POST" ? { id: 5, version: 1, status: 0, actualValue: 20 } : path.startsWith("/api/habits/summary") ? quantitySummary : [quantity]) as Request;
    render(<Feature request={request} />); await screen.findByText("页数");
    fireEvent.change(screen.getByLabelText("页数实际值"), { target: { value: "20" } }); fireEvent.click(screen.getByRole("button", { name: "记录" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/habits/12/occurrences", expect.objectContaining({ body: expect.stringContaining('"actualValue":20') })));
  });

  it("keeps specialized life controls in their owning composition", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/api/habits/summary") ? summary : [habit]) as Request;
    render(<Feature request={request} />); await screen.findByText("阅读"); fireEvent.click(screen.getByRole("button", { name: "生活记录" }));
    expect(await screen.findByText("专用生活组件")).toBeTruthy(); expect(screen.getByText("专用记录保持唯一真值")).toBeTruthy();
  });

  it("hides archived definitions until explicitly requested", async () => {
    const archived = { ...habit, archivedAt: "2026-09-21T08:00:00.000Z" };
    const request = vi.fn(async (path: string) => path.startsWith("/api/habits/summary") ? { ...summary, items: [] } : [archived]) as Request;
    render(<Feature request={request} entry="/routines?date=2026-09-21&view=habits" />); await screen.findByText("还没有习惯");
    fireEvent.click(screen.getByRole("checkbox", { name: "显示已归档" })); expect(await screen.findByText("阅读")).toBeTruthy(); expect(screen.getByText("已归档")).toBeTruthy();
  });

  it("renders a lightweight Today snapshot linked to Routines", async () => {
    const request = vi.fn(async () => summary) as Request;
    render(<QueryClientProvider client={client()}><MemoryRouter><HabitTodaySnapshot request={request} userId={7} date="2026-09-21" /></MemoryRouter></QueryClientProvider>);
    const link = await screen.findByRole("link", { name: /今日习惯 0\/2/ }); expect(link.getAttribute("href")).toBe("/routines?date=2026-09-21");
  });
});
