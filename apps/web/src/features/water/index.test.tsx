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
    render(feature({ selectedDate: "2026-09-18" }));

    expect(screen.getByText("3/8 杯")).toBeTruthy();
    expect(screen.getByText("历史记录")).toBeTruthy();
    expect(screen.getByText("约每 2h 一杯，当前应到 8/8 杯")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+1 杯" })).toBeTruthy();
    expect(screen.getByLabelText("手动修正喝水杯数")).toBeTruthy();
  });

  it("saves a selected cup count and refreshes on success", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request: requestMock as FeatureProps["request"], onChanged }));

    fireEvent.change(screen.getByLabelText("手动修正喝水杯数"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledOnce());
    expect(requestMock).toHaveBeenCalledWith("/api/water-records", {
      method: "POST",
      body: JSON.stringify({ waterDate: "2026-09-19", cups: 6, targetCups: 8 })
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("clamps manual correction at zero", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    render(feature({ request: requestMock as FeatureProps["request"], record: { ...record, cups: 0 } }));

    fireEvent.change(screen.getByLabelText("手动修正喝水杯数"), { target: { value: "-2" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body)).cups).toBe(0);
  });

  it("reports a failed mutation without refreshing", async () => {
    const request = vi.fn(async () => { throw new Error("保存失败"); }) as FeatureProps["request"];
    const onError = vi.fn();
    const onChanged = vi.fn();
    render(feature({ request, onError, onChanged }));

    fireEvent.click(screen.getByRole("button", { name: "+1 杯" }));

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
