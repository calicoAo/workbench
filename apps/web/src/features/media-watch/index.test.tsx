// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaWatchEditor, MediaWatchFeature, type MediaWatchRecord } from ".";

type FeatureProps = ComponentProps<typeof MediaWatchFeature>;

afterEach(cleanup);

function record(suffix: string, watchDate = "2026-09-18"): MediaWatchRecord {
  return {
    id: 1,
    watchDate,
    title: `标题 ${suffix}`,
    episode: `进度 ${suffix}`,
    note: `备注 ${suffix}`
  };
}

function feature(options: Partial<FeatureProps> = {}) {
  return (
    <MediaWatchFeature
      request={options.request ?? (vi.fn(async () => record("saved")) as FeatureProps["request"])}
      selectedDate={options.selectedDate ?? "2026-09-18"}
      initialRecord={options.initialRecord === undefined ? record("A") : options.initialRecord}
      snapshotReady={options.snapshotReady ?? true}
      disabled={options.disabled}
      onError={options.onError ?? vi.fn()}
      onChanged={options.onChanged ?? vi.fn()}
    >
      <MediaWatchEditor />
    </MediaWatchFeature>
  );
}

function input(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
}

describe("MediaWatchFeature draft ownership", () => {
  it("initializes the draft from the selected-date snapshot", () => {
    render(feature());

    expect(input("影视标题").value).toBe("标题 A");
    expect(input("影视进度").value).toBe("进度 A");
    expect(input("影视备注").value).toBe("备注 A");
  });

  it("preserves the active draft when the same-date Dashboard snapshot refreshes", () => {
    const view = render(feature());
    fireEvent.change(input("影视标题"), { target: { value: "未保存标题" } });
    fireEvent.change(input("影视备注"), { target: { value: "未保存备注" } });

    view.rerender(feature({ initialRecord: record("remote") }));

    expect(input("影视标题").value).toBe("未保存标题");
    expect(input("影视备注").value).toBe("未保存备注");
  });

  it("waits for and then initializes from the new date snapshot", () => {
    const view = render(feature());
    fireEvent.change(input("影视标题"), { target: { value: "旧日期草稿" } });

    view.rerender(feature({ selectedDate: "2026-09-19", initialRecord: null, snapshotReady: false }));

    expect(input("影视标题").value).toBe("");
    expect(input("影视标题").disabled).toBe(true);

    view.rerender(feature({ selectedDate: "2026-09-19", initialRecord: record("new", "2026-09-19"), snapshotReady: true }));

    expect(input("影视标题").value).toBe("标题 new");
    expect(input("影视标题").disabled).toBe(false);
  });

  it("normalizes the owned draft from a successful save response", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => record("normalized"));
    const request = requestMock as FeatureProps["request"];
    const onChanged = vi.fn(async () => undefined);
    render(feature({ initialRecord: null, request, onChanged }));
    fireEvent.change(input("影视标题"), { target: { value: "  原始标题  " } });
    fireEvent.change(input("影视进度"), { target: { value: "  第 3 集  " } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body))).toMatchObject({
      watchDate: "2026-09-18",
      title: "  原始标题  ",
      episode: "  第 3 集  "
    });
    expect(input("影视标题").value).toBe("标题 normalized");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps the active draft when saving fails", async () => {
    const request = vi.fn(async () => { throw new Error("保存失败"); }) as FeatureProps["request"];
    const onError = vi.fn();
    render(feature({ initialRecord: null, request, onError }));
    fireEvent.change(input("影视标题"), { target: { value: "未保存标题" } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("保存失败", "操作没有成功"));
    expect(input("影视标题").value).toBe("未保存标题");
  });
});
