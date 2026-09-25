// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaterFeature, type WaterRecord, waterTimelineItems } from ".";

type FeatureProps = ComponentProps<typeof WaterFeature>;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const record: WaterRecord = {
  waterDate: "2026-09-19",
  cups: 3,
  targetCups: 8,
  lastDrinkAt: "2026-09-19T10:30:00+08:00",
  drinkTimes: JSON.stringify(["2026-09-19T08:00:00+08:00", "2026-09-19T09:15:00+08:00", "2026-09-19T10:30:00+08:00"])
};

function feature(options: Partial<FeatureProps> = {}) {
  return (
    <WaterFeature
      request={options.request ?? (vi.fn(async () => ({})) as FeatureProps["request"])}
      selectedDate={options.selectedDate ?? "2026-09-19"}
      record={options.record === undefined ? record : options.record}
      sleep={options.sleep === undefined ? { sleepStart: "23:00", wakeTime: "07:00" } : options.sleep}
      onError={options.onError ?? vi.fn()}
      onChanged={options.onChanged ?? vi.fn()}
    />
  );
}

describe("WaterFeature workflow ownership", () => {
  it("renders the snapshot and derives the historical rhythm from sleep", () => {
    const view = render(feature({ selectedDate: "2026-09-18" }));

    expect(view.container.querySelectorAll(".water-cup")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "再喝一杯" })).toBeTruthy();
    expect(screen.queryByText("历史记录")).toBeNull();
    expect(screen.queryByLabelText("手动修正喝水杯数")).toBeNull();
  });

  it("saves an inline extra cup and refreshes on success", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request: requestMock as FeatureProps["request"], onChanged }));

    fireEvent.click(screen.getByRole("button", { name: "再喝一杯" }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledOnce());
    expect(requestMock).toHaveBeenCalledWith("/api/water-records", {
      method: "POST",
      body: JSON.stringify({ waterDate: "2026-09-19", cups: 4, targetCups: 8 })
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps the recommended eight-cup display while allowing extra cups", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    render(feature({ request: requestMock as FeatureProps["request"], record: { ...record, cups: 8 } }));

    expect(screen.getByLabelText("饮水进度 8 杯").querySelectorAll("svg")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "再喝一杯" }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body)).cups).toBe(9);
  });

  it("marks the next cup with a reminder animation when today's rhythm is behind", () => {
    const now = new Date();
    vi.setSystemTime(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0));
    const selectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const view = render(feature({ selectedDate, record: { ...record, waterDate: selectedDate, cups: 0 } }));

    expect(view.container.querySelector(".water-cup.is-reminder")).toBeTruthy();
  });

  it("reports a failed mutation without refreshing", async () => {
    const request = vi.fn(async () => { throw new Error("保存失败"); }) as FeatureProps["request"];
    const onError = vi.fn();
    const onChanged = vi.fn();
    render(feature({ request, onError, onChanged }));

    fireEvent.click(screen.getByRole("button", { name: "再喝一杯" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("保存失败", "操作没有成功"));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("projects only recorded drink timestamps into Calendar markers", () => {
    const firstTime = new Date("2026-09-19T08:00:00+08:00").toTimeString().slice(0, 5);
    const secondTime = new Date("2026-09-19T09:15:00+08:00").toTimeString().slice(0, 5);
    expect(waterTimelineItems({ ...record, cups: 2 })).toEqual([
      expect.objectContaining({ id: -10001, startTime: `${firstTime}:00`, endTime: `${firstTime}:00`, title: "喝水 · 第 1 杯", marker: "water" }),
      expect.objectContaining({ id: -10002, startTime: `${secondTime}:00`, endTime: `${secondTime}:00`, title: "喝水 · 第 2 杯", marker: "water" })
    ]);
  });

  it("falls back to the legacy last-drink timestamp when drinkTimes is invalid", () => {
    const lastTime = new Date("2026-09-19T10:30:00+08:00").toTimeString().slice(0, 5);
    expect(waterTimelineItems({ ...record, cups: 1, drinkTimes: "invalid" })).toEqual([
      expect.objectContaining({ startTime: `${lastTime}:00`, title: "喝水 · 第 1 杯" })
    ]);
  });

  it("projects no markers before a Water snapshot exists", () => {
    expect(waterTimelineItems(null)).toEqual([]);
  });
});
