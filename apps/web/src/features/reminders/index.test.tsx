// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeadlineCountdown, ReminderBell } from ".";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Today reminders", () => {
  it("shows countdowns only for pinned unfinished tasks and upcoming recurring items", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T11:00:00.000Z"));
    render(<MemoryRouter><ReminderBell tasks={[
      { id: 1, title: "Pinned deadline", dueAt: "2026-10-21T12:00:00.000Z", status: 1, pinned: 1 },
      { id: 2, title: "Not pinned", dueAt: "2026-10-21T13:00:00.000Z", status: 0, pinned: 0 },
      { id: 3, title: "Already done", dueAt: "2026-10-21T14:00:00.000Z", status: 2, pinned: 1 },
    ]} recurring={[{ templateId: 4, name: "房租", type: "EXPENSE", scheduledDate: "2026-10-22", scheduledTime: "09:00", dueAt: "2026-10-22T01:00:00.000Z", amountCents: "300000", accountName: "银行卡", categoryName: "居住" }]} date="2026-10-21" /></MemoryRouter>);
    expect(screen.queryByText("Pinned deadline")).toBeNull();
    const bell = screen.getByRole("button", { name: "主页提醒" });
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(bell);
    expect(screen.getByText("Pinned deadline")).toBeTruthy();
    expect(screen.getByText("房租")).toBeTruthy();
    expect(screen.getByText("还剩 1小时 0分钟")).toBeTruthy();
    expect(screen.queryByText("Not pinned")).toBeNull();
    expect(screen.queryByText("Already done")).toBeNull();
    expect(screen.getByRole("link", { name: /房租/ }).getAttribute("href")).toBe("/finance?tab=recurring");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("房租")).toBeNull();
    fireEvent.click(bell);
    fireEvent.pointerDown(document.body);
    expect(bell.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows only pinned task deadlines in the independent countdown surface", () => {
    render(<MemoryRouter><DeadlineCountdown tasks={[{ id: 1, title: "Deadline", dueAt: "2026-10-22T12:00:00Z", status: 0, pinned: 1 }]} date="2026-10-21" /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "截止倒数" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Deadline/ }).getAttribute("href")).toBe("/tasks/1?date=2026-10-21");
  });

  it("does not hide a reminder request failure behind an empty state", () => {
    const retry = vi.fn();
    render(<MemoryRouter><ReminderBell tasks={[]} recurring={[]} date="2026-10-21" error onRetry={retry} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "主页提醒" }));
    expect(screen.getByRole("alert").textContent).toContain("提醒加载失败");
    expect(screen.queryByText("没有固定截止事项或近期周期缴费。")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
