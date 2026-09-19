// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SleepFeature, type SleepRecord } from ".";

type FeatureProps = ComponentProps<typeof SleepFeature>;

afterEach(cleanup);

function record(suffix: string, sleepDate = "2026-09-19"): SleepRecord {
  return {
    id: 1,
    sleepDate,
    sleepStart: `23:${suffix}`,
    wakeTime: `07:${suffix}`,
    durationMinutes: 450,
    qualityScore: 4
  };
}

function feature(options: Partial<FeatureProps> = {}) {
  return (
    <SleepFeature
      request={options.request ?? (vi.fn(async () => ({})) as FeatureProps["request"])}
      selectedDate={options.selectedDate ?? "2026-09-19"}
      record={options.record === undefined ? record("15") : options.record}
      snapshotReady={options.snapshotReady ?? true}
      onError={options.onError ?? vi.fn()}
      onChanged={options.onChanged ?? vi.fn()}
    />
  );
}

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "编辑睡眠" }));
}

function timeInput(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

describe("SleepFeature workflow ownership", () => {
  it("renders the remote snapshot and initializes the editor draft", () => {
    render(feature());

    expect(screen.getByText("7.5h")).toBeTruthy();
    expect(screen.getByText("4/5")).toBeTruthy();
    openEditor();
    expect(timeInput("入睡").value).toBe("23:15");
    expect(timeInput("起床").value).toBe("07:15");
    expect((screen.getByLabelText("睡眠质量") as HTMLSelectElement).value).toBe("4");
  });

  it("preserves the active draft when the same-date Dashboard snapshot refreshes", () => {
    const view = render(feature());
    openEditor();
    fireEvent.change(timeInput("入睡"), { target: { value: "22:45" } });

    view.rerender(feature({ record: record("30") }));

    expect(timeInput("入睡").value).toBe("22:45");
  });

  it("closes the old editor and waits for the new date snapshot", () => {
    const view = render(feature());
    openEditor();
    fireEvent.change(timeInput("入睡"), { target: { value: "22:45" } });

    view.rerender(feature({ selectedDate: "2026-09-20", record: null, snapshotReady: false }));

    expect(screen.queryByRole("heading", { name: "编辑睡眠" })).toBeNull();
    expect((screen.getByRole("button", { name: "编辑睡眠" }) as HTMLButtonElement).disabled).toBe(true);

    view.rerender(feature({ selectedDate: "2026-09-20", record: record("35", "2026-09-20"), snapshotReady: true }));
    openEditor();
    expect(timeInput("入睡").value).toBe("23:35");
  });

  it("submits the owned draft, closes the editor, and refreshes on success", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({ sleepDate: "2026-09-19", durationMinutes: 480, reward: null }));
    const request = requestMock as FeatureProps["request"];
    const onChanged = vi.fn(async () => undefined);
    render(feature({ record: null, request, onChanged }));
    openEditor();
    fireEvent.change(timeInput("入睡"), { target: { value: "22:40" } });
    fireEvent.change(timeInput("起床"), { target: { value: "06:50" } });
    fireEvent.change(screen.getByLabelText("睡眠质量"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body))).toEqual({
      sleepDate: "2026-09-19",
      sleepStart: "22:40",
      wakeTime: "06:50",
      qualityScore: 5
    });
    expect(screen.queryByRole("heading", { name: "编辑睡眠" })).toBeNull();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps the editor and active draft open when saving fails", async () => {
    const request = vi.fn(async () => { throw new Error("保存失败"); }) as FeatureProps["request"];
    const onError = vi.fn();
    render(feature({ record: null, request, onError }));
    openEditor();
    fireEvent.change(timeInput("入睡"), { target: { value: "22:45" } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("保存失败", "操作没有成功"));
    expect(screen.getByRole("heading", { name: "编辑睡眠" })).toBeTruthy();
    expect(timeInput("入睡").value).toBe("22:45");
  });
});
