// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dateInput, timeInput } from "./model";
import { TaskDetailPage, TasksFeature, TasksPanel, type TaskDetailPayload } from ".";

type Props = ComponentProps<typeof TasksFeature>;

afterEach(cleanup);

const category = {
  id: 10,
  name: "编程",
  dimensionKey: "career" as const,
  color: "#5B8DEF",
  targetMinutes: 6000,
  totalMinutes: 120
};

const task = {
  id: 1,
  title: "任务 A",
  description: null,
  categoryId: category.id,
  status: 0,
  priority: 2,
  difficulty: 2,
  pinned: 0,
  sortOrder: 1,
  dueAt: null,
  progressPercent: 0,
  version: 1,
  createdAt: "2026-09-18T08:00:00+08:00",
  completedAt: null,
  completionNote: null
};

const taskB = { ...task, id: 2, title: "任务 B", sortOrder: 2 };

function feature(overrides: Partial<Props> = {}) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TasksFeature
      userId={1}
      request={overrides.request ?? (vi.fn(async () => ({})) as Props["request"])}
      selectedDate={overrides.selectedDate ?? "2026-09-18"}
      loading={overrides.loading ?? false}
      tasks={overrides.tasks ?? [task, taskB]}
      categories={overrides.categories ?? [category]}
      schedules={overrides.schedules ?? []}
      dailyTaskIds={overrides.dailyTaskIds ?? [task.id]}
      focusTaskIds={overrides.focusTaskIds ?? []}
      runningTimers={overrides.runningTimers ?? []}
      taskRewardEvents={overrides.taskRewardEvents ?? []}
      onError={overrides.onError ?? vi.fn()}
      onConfirm={overrides.onConfirm ?? vi.fn()}
      onChanged={overrides.onChanged ?? vi.fn()}
      onReward={overrides.onReward ?? vi.fn()}
      onStartTimer={overrides.onStartTimer ?? vi.fn()}
      onCompleteAndFinish={overrides.onCompleteAndFinish}
    >
      <TasksPanel />
    </TasksFeature></QueryClientProvider>
  );
}

function openCreate() {
  fireEvent.click(screen.getByRole("button", { name: "新增" }));
}

describe("TasksFeature ownership", () => {
  it("collapses cross-midnight slices to one Session note and keeps completion note separate", () => {
    const detail: TaskDetailPayload = {
      task: { ...task, status: 2, completionNote: "Task outcome" },
      assignments: [],
      plannedSchedules: [],
      actualEntries: [
        { source: "TIMER_SEGMENT", sourceId: 21, title: "任务 A", startedAt: "2026-10-06T15:55:00Z", endedAt: "2026-10-06T16:00:00Z", businessDate: "2026-10-06", recordTimezone: "Asia/Shanghai", note: "session note", timerSessionId: 44, sessionNote: "session note", sessionStartedAt: "2026-10-06T15:55:00Z", sessionEndedAt: "2026-10-06T16:15:00Z", sessionDurationSeconds: 1200, isTerminalSlice: false },
        { source: "TIMER_SEGMENT", sourceId: 22, title: "任务 A", startedAt: "2026-10-06T16:00:00Z", endedAt: "2026-10-06T16:15:00Z", businessDate: "2026-10-07", recordTimezone: "Asia/Shanghai", note: "session note", timerSessionId: 44, sessionNote: "session note", sessionStartedAt: "2026-10-06T15:55:00Z", sessionEndedAt: "2026-10-06T16:15:00Z", sessionDurationSeconds: 1200, isTerminalSlice: true }
      ]
    };
    render(<MemoryRouter><TaskDetailPage detail={detail} assigned active={false} paused={false} date="2026-10-07" pending={false} onAccept={vi.fn()} onStart={vi.fn()} onComplete={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()} /></MemoryRouter>);

    expect(screen.getByText("Task outcome")).toBeTruthy();
    expect(screen.getAllByText("session note")).toHaveLength(1);
  });

  it("preserves an active create draft across an ordinary snapshot refresh", () => {
    const view = render(feature());
    openCreate();
    fireEvent.change(screen.getByLabelText("任务标题"), { target: { value: "未保存标题" } });
    fireEvent.change(screen.getByLabelText("任务详情"), { target: { value: "未保存详情" } });

    view.rerender(feature({ tasks: [{ ...task, title: "服务端新标题" }, taskB] }));

    expect(screen.getByLabelText<HTMLInputElement>("任务标题").value).toBe("未保存标题");
    expect(screen.getByLabelText<HTMLTextAreaElement>("任务详情").value).toBe("未保存详情");
  });

  it("keeps the create draft open when the mutation fails", async () => {
    const request = vi.fn(async () => { throw new Error("发布失败"); }) as Props["request"];
    const onError = vi.fn();
    render(feature({ request, onError }));
    openCreate();
    fireEvent.change(screen.getByLabelText("任务标题"), { target: { value: "保留这段输入" } });

    fireEvent.click(screen.getByRole("button", { name: /^发布$/ }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("发布失败", "操作没有成功"));
    expect(screen.getByLabelText<HTMLInputElement>("任务标题").value).toBe("保留这段输入");
  });

  it("resets and closes the create workflow only after a successful mutation", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({ id: 3 }));
    const request = requestMock as Props["request"];
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request, onChanged }));
    openCreate();
    fireEvent.change(screen.getByLabelText("任务标题"), { target: { value: "  新任务  " } });

    fireEvent.click(screen.getByRole("button", { name: /^发布$/ }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText("任务标题")).toBeNull();
    const publishCall = requestMock.mock.calls.find(([path]) => path === "/api/tasks")!;
    expect(JSON.parse(String(publishCall[1]?.body))).toMatchObject({ title: "新任务", categoryId: category.id });
  });

  it("initializes daily selection when opened and does not overwrite the active selection on refresh", () => {
    const view = render(feature({ dailyTaskIds: [task.id] }));
    fireEvent.click(screen.getByRole("button", { name: "接取今日任务" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /任务 B/ }));

    view.rerender(feature({ dailyTaskIds: [task.id] }));

    expect(screen.getByText("已接取 2 个")).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /任务 B/ }).checked).toBe(true);
  });

  it("submits the active daily selection with the selected business date", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request: requestMock as Props["request"], onChanged }));
    fireEvent.click(screen.getByRole("button", { name: "接取今日任务" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /任务 B/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认接取" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(requestMock.mock.calls.filter((call) => call[1]?.method)[0][0]).toBe("/api/task-days");
    expect(JSON.parse(String(requestMock.mock.calls.filter((call) => call[1]?.method)[0][1]?.body))).toEqual({
      taskDate: "2026-09-18",
      taskIds: [task.id, taskB.id],
      focusTaskIds: []
    });
  });

  it("keeps an edit draft open when the mutation fails", async () => {
    const request = vi.fn(async () => { throw new Error("编辑失败"); }) as Props["request"];
    const onError = vi.fn();
    render(feature({ request, onError }));
    fireEvent.click(screen.getByRole("button", { name: "在更多菜单中编辑任务" }));
    fireEvent.change(screen.getByLabelText("编辑任务标题"), { target: { value: "保留编辑草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("编辑失败", "操作没有成功"));
    expect(screen.getByLabelText<HTMLInputElement>("编辑任务标题").value).toBe("保留编辑草稿");
  });

  it("sends direct completion to the Task completion contract without using Timer callbacks", async () => {
    const requestMock = vi.fn(async (path: string, _init?: RequestInit) => path.endsWith("/complete")
      ? { id: task.id, status: 2, scheduleId: 7, reward: { xp: 12, coins: 3 } }
      : {});
    const request = requestMock as Props["request"];
    const onChanged = vi.fn(async () => undefined);
    const onReward = vi.fn();
    render(feature({
      request,
      onChanged,
      onReward,
      schedules: [{
        id: 4,
        taskId: task.id,
        categoryId: category.id,
        startTime: "09:00:00",
        endTime: "10:00:00",
        title: task.title,
        note: null,
        kind: 0,
        source: 0,
        color: category.color
      }]
    }));

    fireEvent.click(screen.getByRole("checkbox", { name: "完成任务 A" }));
    fireEvent.change(screen.getByLabelText("完成感想"), { target: { value: "完成得很扎实" } });
    fireEvent.click(screen.getByRole("button", { name: "直接完成" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(requestMock.mock.calls.filter((call) => call[1]?.method)[0][0]).toBe("/api/tasks/1/complete");
    expect(JSON.parse(String(requestMock.mock.calls.filter((call) => call[1]?.method)[0][1]?.body))).toMatchObject({
      expectedVersion: 1,
      completionNote: "完成得很扎实"
    });
    expect(JSON.parse(String(requestMock.mock.calls.filter((call) => call[1]?.method)[0][1]?.body)).operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(onReward).toHaveBeenCalledWith(task, { xp: 12, coins: 3 });
  });

  it("sends completion with Actual time through one atomic Manual Actual command", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({ rewards: [{ xp: 12, coins: 3 }] }));
    const onChanged = vi.fn(async () => undefined);
    render(feature({ request: requestMock as Props["request"], onChanged }));

    fireEvent.click(screen.getByRole("checkbox", { name: "完成任务 A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "同时补录实际投入" }));
    fireEvent.change(screen.getByLabelText("完成补录开始时间"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("完成补录结束时间"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "完成并记录时间" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(requestMock.mock.calls.filter((call) => call[1]?.method)).toHaveLength(1);
    expect(requestMock.mock.calls.filter((call) => call[1]?.method)[0][0]).toBe("/api/schedules");
    expect(JSON.parse(String(requestMock.mock.calls.filter((call) => call[1]?.method)[0][1]?.body))).toMatchObject({
      taskId: task.id,
      expectedTaskVersion: task.version,
      kind: 1,
      completeTask: true,
      includeInActualTime: true,
      startTime: "09:00",
      endTime: "10:00"
    });
  });
});


describe("daily focus and historical completions", () => {
  it("star uses daily focus rather than global countdown pin", async () => {
    const request = vi.fn(async () => ({}));
    const changed = vi.fn();
    render(feature({ request: request as Props["request"], onChanged: changed }));
    fireEvent.click(screen.getByRole("button", { name: "设为今日重点" }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    const writes = request.mock.calls as unknown as [string, RequestInit][];
    const write = writes.find(([, init]) => init?.method === "PUT")!;
    expect(write[0]).toBe("/api/task-days");
    expect(JSON.parse(String(write[1].body))).toEqual({ taskDate: "2026-09-18", taskIds: [1], focusTaskIds: [1] });
    expect(writes.some(([url]) => url.includes("/pinned"))).toBe(false);
  });
  it("drag into the empty focus zone saves focus once", async () => {
    const request = vi.fn(async () => ({})); const changed = vi.fn();
    const { container } = render(feature({ request: request as Props["request"], onChanged: changed }));
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(container.querySelector(".drag-handle")!, { dataTransfer });
    fireEvent.dragOver(container.querySelector("[data-focus-dropzone]")!, { dataTransfer });
    fireEvent.drop(container.querySelector("[data-focus-dropzone]")!, { dataTransfer });
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    const writes = (request.mock.calls as unknown as [string, RequestInit][]).filter(([, init]) => init?.method);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1].body)).focusTaskIds).toEqual([1]);
  });
  it("max three prevents a fourth and failures remain retryable", async () => {
    const four = [task, taskB, { ...task, id: 3, title: "三" }, { ...task, id: 4, title: "四" }];
    const request = vi.fn(async () => ({})); const onError = vi.fn();
    const view = render(feature({ tasks: four, dailyTaskIds: [1, 2, 3, 4], focusTaskIds: [1, 2, 3], request: request as Props["request"], onError }));
    fireEvent.click(screen.getByRole("button", { name: "设为今日重点" }));
    expect(onError).toHaveBeenCalledWith("今日重点最多 3 项，请先取消一项。");
    expect((request.mock.calls as unknown as [string, RequestInit][]).filter(([, init]) => init?.method)).toHaveLength(0);
    let fails = true;
    const retry = vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method && fails) throw new Error("offline"); return {}; });
    view.unmount(); render(feature({ request: retry as Props["request"], onError }));
    fireEvent.click(screen.getByRole("button", { name: "设为今日重点" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("offline", "操作没有成功"));
    fails = false; fireEvent.click(screen.getByRole("button", { name: "设为今日重点" }));
    await waitFor(() => expect(retry.mock.calls.filter(([, init]) => init?.method)).toHaveLength(2));
  });
  it("reordering already-focused rows preserves the existing ordering command", async () => {
    const request = vi.fn(async (_url: string, _init?: RequestInit) => ({}));
    const { container } = render(feature({ tasks: [task, taskB], dailyTaskIds: [1, 2], focusTaskIds: [1, 2], request: request as Props["request"] }));
    const rows = container.querySelectorAll("[data-focus-dropzone] .task-row");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(rows[0].querySelector(".drag-handle")!, { dataTransfer });
    fireEvent.drop(rows[1], { dataTransfer });
    await waitFor(() => expect(request.mock.calls.filter((call) => String(call[0]).includes("/reorder"))).toHaveLength(1));
    expect(request.mock.calls.some((call) => call[0] === "/api/task-days")).toBe(false);
  });
  it("deadline editor values follow authenticated timezone across midnight", () => {
    const instant = "2026-10-22T15:15:00.000Z";
    expect(dateInput(instant, "Asia/Tokyo")).toBe("2026-10-23");
    expect(timeInput(instant, "Asia/Tokyo")).toBe("00:15");
    expect(dateInput(instant, "America/New_York")).toBe("2026-10-22");
    expect(timeInput(instant, "America/New_York")).toBe("11:15");
  });
  it("completion event survives remount without any accepted tasks", async () => {
    const request = vi.fn(async () => [{ id: 81, taskId: 1, title: "完成的任务", businessDate: "2026-09-18", occurredAt: "2026-09-18T01:00:00Z", categoryIdAtOccurrence: 10 }]);
    const view = render(feature({ dailyTaskIds: [], request: request as Props["request"] }));
    expect(await screen.findByText("完成的任务")).toBeTruthy();
    view.unmount(); render(feature({ dailyTaskIds: [], request: request as Props["request"] }));
    expect(await screen.findByText("完成的任务")).toBeTruthy();
    expect(screen.getByRole("link", { name: /完成的任务/ }).getAttribute("href")).toContain("date=2026-09-18");
  });
});
