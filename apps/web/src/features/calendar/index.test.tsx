// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarFeature, type TimelineItem } from ".";

type FeatureProps = ComponentProps<typeof CalendarFeature>;

afterEach(cleanup);

const tasks = [{ id: 11, title: "完成架构切片" }];
const categories = [{ id: 7, name: "编程", dimensionKey: "career" as const, color: "#5B8DEF", targetMinutes: 6000, totalMinutes: 120 }];
const items: TimelineItem[] = [
  { id: 1, taskId: 11, categoryId: 7, startTime: "09:00:00", endTime: "10:00:00", title: "实际投入", note: null, kind: 1, source: 0, color: "#35C99A" },
  { id: 2, taskId: 11, categoryId: 7, startTime: "11:00:00", endTime: "12:00:00", title: "后续安排", note: null, kind: 0, source: 2, color: "#35C99A" },
  { id: -1, taskId: null, categoryId: null, startTime: "12:30:00", endTime: "12:30:00", title: "喝水", note: null, kind: 1, source: 0, color: "#7EC8E3", marker: "water" }
];

function feature(options: Partial<FeatureProps> = {}) {
  return (
    <CalendarFeature
      request={options.request ?? (vi.fn(async () => ({})) as FeatureProps["request"])}
      selectedDate={options.selectedDate ?? "2026-09-19"}
      loading={options.loading ?? false}
      items={options.items ?? items}
      tasks={options.tasks ?? tasks}
      categories={options.categories ?? categories}
      onError={options.onError ?? vi.fn()}
      onChanged={options.onChanged ?? vi.fn()}
    />
  );
}

function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "记录" }));
}

describe("CalendarFeature workflow ownership", () => {
  it("renders schedule metrics and deletes only persisted Schedule rows", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request: requestMock as FeatureProps["request"], onChanged }));

    expect(screen.getByText("1h")).toBeTruthy();
    expect(screen.getByText("1段")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "删除时间记录" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "删除时间记录" })[0]);

    await waitFor(() => expect(requestMock).toHaveBeenCalledWith("/api/schedules/1", { method: "DELETE" }));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("submits the owned draft and closes only after a successful mutation", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({ id: 3 }));
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request: requestMock as FeatureProps["request"], onChanged }));
    openEditor();
    fireEvent.change(screen.getByLabelText("时间块标题"), { target: { value: "  手工记录  " } });
    fireEvent.change(screen.getByLabelText("时间块备注"), { target: { value: "  保持专注  " } });
    fireEvent.change(screen.getByLabelText("开始"), { target: { value: "13:00" } });
    fireEvent.change(screen.getByLabelText("结束"), { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(requestMock.mock.calls[0][0]).toBe("/api/schedules");
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body))).toEqual({
      scheduleDate: "2026-09-19",
      startTime: "13:00",
      endTime: "14:30",
      kind: 1,
      categoryId: 7,
      title: "手工记录",
      note: "保持专注"
    });
    expect(screen.queryByRole("heading", { name: "记录时间块" })).toBeNull();
  });

  it("keeps the editor and active draft open when creation fails", async () => {
    const request = vi.fn(async () => { throw new Error("保存失败"); }) as FeatureProps["request"];
    const onError = vi.fn();
    render(feature({ request, onError }));
    openEditor();
    fireEvent.change(screen.getByLabelText("时间块标题"), { target: { value: "不要丢失" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("保存失败", "操作没有成功"));
    expect(screen.getByRole("heading", { name: "记录时间块" })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("时间块标题").value).toBe("不要丢失");
  });

  it("preserves an active draft through a same-date Dashboard refresh", () => {
    const view = render(feature());
    openEditor();
    fireEvent.change(screen.getByLabelText("时间块标题"), { target: { value: "未保存内容" } });

    view.rerender(feature({ items: [] }));

    expect(screen.getByLabelText<HTMLInputElement>("时间块标题").value).toBe("未保存内容");
  });

  it("closes and resets the editor when the selected date changes", () => {
    const view = render(feature());
    openEditor();
    fireEvent.change(screen.getByLabelText("时间块标题"), { target: { value: "旧日期草稿" } });

    view.rerender(feature({ selectedDate: "2026-09-20", items: [] }));

    expect(screen.queryByRole("heading", { name: "记录时间块" })).toBeNull();
    openEditor();
    expect(screen.getByLabelText<HTMLInputElement>("时间块标题").value).toBe("");
  });

  it("rejects a manual block without a title before sending a request", async () => {
    const request = vi.fn(async () => ({})) as FeatureProps["request"];
    const onError = vi.fn();
    render(feature({ request, onError }));
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(request).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("不关联任务时，需要写一下这段时间做了什么");
  });
});
