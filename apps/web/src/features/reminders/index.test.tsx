// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodayReminders } from ".";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Today reminders", () => {
  it("shows countdowns only for pinned unfinished tasks and upcoming recurring items", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T11:00:00.000Z"));
    render(<MemoryRouter><TodayReminders tasks={[
      { id: 1, title: "Pinned deadline", dueAt: "2026-10-21T12:00:00.000Z", status: 1, pinned: 1 },
      { id: 2, title: "Not pinned", dueAt: "2026-10-21T13:00:00.000Z", status: 0, pinned: 0 },
      { id: 3, title: "Already done", dueAt: "2026-10-21T14:00:00.000Z", status: 2, pinned: 1 },
    ]} recurring={[{ templateId: 4, name: "房租", type: "EXPENSE", scheduledDate: "2026-10-22", scheduledTime: "09:00", dueAt: "2026-10-22T01:00:00.000Z", amountCents: "300000", accountName: "银行卡", categoryName: "居住" }]} date="2026-10-21" /></MemoryRouter>);
    expect(screen.getByText("Pinned deadline")).toBeTruthy();
    expect(screen.getByText("房租")).toBeTruthy();
    expect(screen.getByText("还剩 1小时 0分钟")).toBeTruthy();
    expect(screen.queryByText("Not pinned")).toBeNull();
    expect(screen.queryByText("Already done")).toBeNull();
    expect(screen.getByRole("link", { name: /房租/ }).getAttribute("href")).toBe("/finance?tab=recurring");
  });
});
