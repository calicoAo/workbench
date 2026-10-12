// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskDetailPage, type TaskDetailPayload } from ".";

afterEach(cleanup);
type Entry = TaskDetailPayload["actualEntries"][number];
const task = { id: 1, title: "Agent task", description: null, categoryId: null, status: 1, priority: 2, difficulty: 2, pinned: 0, sortOrder: 1, dueAt: null, progressPercent: 0, version: 2, createdAt: "2026-10-10T00:00:00Z", completedAt: null, completionNote: null };
function period(id: number, start: string, end: string, overrides: Partial<Entry> = {}): Entry {
  return { source: "TIMER_SEGMENT", sourceId: id, startedAt: `2026-10-10T${start}:00+08:00`, endedAt: `2026-10-10T${end}:00+08:00`, businessDate: "2026-10-10", recordTimezone: "Asia/Shanghai", note: "Session progress", timerSessionId: 10, sessionNote: "Session progress", sessionStartedAt: "2026-10-10T13:20:00+08:00", sessionEndedAt: null, sessionDurationSeconds: 3180, ...overrides };
}
function show(entries: Entry[], options: { finished?: boolean; running?: boolean } = {}) {
  return render(<MemoryRouter><TaskDetailPage detail={{ task: { ...task, status: options.finished ? 2 : 1, completionNote: options.finished ? "Task outcome" : null }, assignments: [], plannedSchedules: [], actualEntries: entries }} assigned active={!options.finished} paused={!options.running} date="2026-10-10" pending={false} currentExecution={options.running ? { startedAt: "2026-10-10 07:00:00", recordTimezone: "Asia/Shanghai" } : undefined} onAccept={vi.fn()} onStart={vi.fn()} onComplete={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()} /></MemoryRouter>);
}
function records() { return screen.getAllByRole("list", { name: "已完成执行区间" }).flatMap((list) => within(list).getAllByRole("listitem")); }

describe("Task → Session → Segment history", () => {
  it("shows a closed 27-minute pause immediately without an unknown Session end or completing Task", () => {
    show([period(1, "13:20", "13:47", { sessionDurationSeconds: 1620 })]);
    expect(records()).toHaveLength(1);
    expect(records()[0].textContent).toMatch(/13:20.*13:47.*27 分钟/);
    expect(screen.queryByText(/未知结束/)).toBeNull();
    expect(screen.getAllByText("进行中")).toHaveLength(1);
    expect(screen.queryByText("已完成")).toBeNull();
  });

  for (const finished of [false, true]) it(`${finished ? "finished" : "paused"} multi-Segment Session keeps two work periods, 53 minutes and one note`, () => {
    show([period(2, "14:05", "14:31", { sessionEndedAt: finished ? "2026-10-10T14:31:00+08:00" : null }), period(1, "13:20", "13:47")], { finished });
    expect(records()).toHaveLength(2);
    expect(records()[0].textContent).toMatch(/13:20.*13:47.*27 分钟/);
    expect(records()[1].textContent).toMatch(/14:05.*14:31.*26 分钟/);
    expect(screen.getByText("实际投入 53 分钟")).toBeTruthy();
    expect(screen.getAllByText("Session progress")).toHaveLength(1);
    expect(screen.queryByText(/未知结束/)).toBeNull();
    if (finished) {
      expect(screen.getByText("完成结果").parentElement?.textContent).toContain("Task outcome");
      expect(screen.getByText("完成结果").parentElement?.textContent).not.toContain("Session progress");
    }
  });

  it("keeps current OPEN execution distinct from already completed periods", () => {
    show([period(1, "13:20", "13:47", { sessionDurationSeconds: 1620 })], { running: true });
    expect(records()).toHaveLength(1);
    expect(records()[0].textContent).not.toContain("15:00");
    expect(screen.getByText(/当前执行/).textContent).toMatch(/15:00.*进行中/);
    expect(screen.getByText("实际投入 27 分钟")).toBeTruthy();
  });

  const slices = [
    period(3, "23:55", "23:59", { startedAt: "2026-10-10 15:55:00", endedAt: "2026-10-10 16:00:00", sessionDurationSeconds: 1200, isTerminalSlice: false }),
    period(3, "00:00", "00:15", { startedAt: "2026-10-10 16:00:00", endedAt: "2026-10-10 16:15:00", businessDate: "2026-10-11", sessionDurationSeconds: 1200, isTerminalSlice: true })
  ];
  it("reconstructs two midnight slices into one 20-minute Segment", () => {
    show(slices);
    expect(records()).toHaveLength(1);
    expect(records()[0].textContent).toMatch(/23:55.*00:15.*20 分钟/);
    expect(screen.getAllByText("Session progress")).toHaveLength(1);
  });
  it("keeps every Segment when one crosses midnight, without duplicate slices or notes", () => {
    show([...slices.map((entry) => ({ ...entry, sessionDurationSeconds: 1800 })), period(4, "01:00", "01:10", { startedAt: "2026-10-10 17:00:00", endedAt: "2026-10-10 17:10:00", businessDate: "2026-10-11" })]);
    expect(records()).toHaveLength(2);
    expect(screen.getByText("实际投入 30 分钟")).toBeTruthy();
    expect(screen.getAllByText("Session progress")).toHaveLength(1);
  });
  it("keeps different Session notes attached to their own context and hides empty notes", () => {
    show([period(1, "13:20", "13:47"), period(2, "14:05", "14:31", { timerSessionId: 11, sessionNote: "Other session" }), period(3, "15:00", "15:10", { timerSessionId: 12, sessionNote: null })]);
    expect(screen.getByText("Session progress").parentElement?.textContent).toContain("Session #10");
    expect(screen.getByText("Other session").parentElement?.textContent).toContain("Session #11");
    expect(document.querySelectorAll(".detail-history-note")).toHaveLength(2);
  });
});
