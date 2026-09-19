// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WritingReflectionFeature } from "../writing-reflection";
import { HistoryFeature } from ".";

type Props = ComponentProps<typeof HistoryFeature>;
afterEach(cleanup);

function feature(overrides: Partial<Props> = {}) {
  const request = overrides.request ?? (vi.fn(async (path: string) => path.includes("morning-writings") ? [{ id: 1, writingDate: "2026-09-18", content: "晨写内容", moodScore: 4 }] : []) as Props["request"]);
  return <WritingReflectionFeature request={request} selectedDate="2026-09-19" initialSnapshot={{ morning: null, journal: null, review: null, insights: [] }} onError={vi.fn()} onChanged={vi.fn()}><HistoryFeature request={request} selectedDate="2026-09-19" refreshRevision={0} loading={false} stats={{ totalMinutes: 90, completedTasks: 2, journalDays: 3, stockReviewDays: 1 }} sleep={null} categories={[{ id: 7, name: "编程", dimensionKey: "career", color: "#5B8DEF", targetMinutes: 6000, totalMinutes: 120 }]} schedules={[{ id: 1, taskId: null, categoryId: 7, startTime: "09:00:00", endTime: "10:30:00", title: "投入", note: null, kind: 1, source: 0, color: "#5B8DEF" }]} weeklySeries={[]} monthlySleepSeries={[]} onError={overrides.onError ?? vi.fn()} onBack={overrides.onBack ?? vi.fn()} /></WritingReflectionFeature>;
}

describe("HistoryFeature ownership", () => {
  it("loads the active archive and renders derived time statistics", async () => {
    render(feature());
    await waitFor(() => expect(screen.getByText("晨写内容")).toBeTruthy());
    expect(screen.getAllByText("1h 30m").length).toBeGreaterThan(0);
    expect(screen.getByText("编程")).toBeTruthy();
  });

  it("loads only the selected archive tab", async () => {
    const requestMock = vi.fn(async (_path: string) => []) as Props["request"];
    render(feature({ request: requestMock }));
    await waitFor(() => expect(requestMock).toHaveBeenCalledWith("/api/morning-writings/list?limit=50"));
    fireEvent.click(screen.getByRole("button", { name: "影视" }));
    await waitFor(() => expect(requestMock).toHaveBeenCalledWith("/api/media-watch-records/list?limit=50"));
  });

  it("reports archive loading failures", async () => {
    const request = vi.fn(async () => { throw new Error("列表失败"); }) as Props["request"];
    const onError = vi.fn();
    render(feature({ request, onError }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("列表失败", "列表加载失败"));
  });
});
