// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TasksFeature, TasksPanel } from ".";

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
  createdAt: "2026-09-18T08:00:00+08:00",
  completedAt: null,
  completionNote: null
};

const taskB = { ...task, id: 2, title: "任务 B", sortOrder: 2 };

function feature(overrides: Partial<Props> = {}) {
  return (
    <TasksFeature
      request={overrides.request ?? (vi.fn(async () => ({})) as Props["request"])}
      selectedDate={overrides.selectedDate ?? "2026-09-18"}
      loading={overrides.loading ?? false}
      tasks={overrides.tasks ?? [task, taskB]}
      categories={overrides.categories ?? [category]}
      schedules={overrides.schedules ?? []}
      dailyTaskIds={overrides.dailyTaskIds ?? [task.id]}
      runningTimers={overrides.runningTimers ?? []}
      taskRewardEvents={overrides.taskRewardEvents ?? []}
      onError={overrides.onError ?? vi.fn()}
      onConfirm={overrides.onConfirm ?? vi.fn()}
      onChanged={overrides.onChanged ?? vi.fn()}
      onReward={overrides.onReward ?? vi.fn()}
      onStartTimer={overrides.onStartTimer ?? vi.fn()}
      onPauseTimer={overrides.onPauseTimer ?? vi.fn()}
      onFinishTimer={overrides.onFinishTimer ?? vi.fn()}
    >
      <TasksPanel />
    </TasksFeature>
  );
}

function openCreate() {
  fireEvent.click(screen.getByRole("button", { name: "新增" }));
}

describe("TasksFeature ownership", () => {
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
    expect(requestMock.mock.calls[0][0]).toBe("/api/tasks");
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body))).toMatchObject({ title: "新任务", categoryId: category.id });
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
    expect(requestMock.mock.calls[0][0]).toBe("/api/task-days");
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body))).toEqual({
      taskDate: "2026-09-18",
      taskIds: [task.id, taskB.id]
    });
  });

  it("keeps an edit draft open when the mutation fails", async () => {
    const request = vi.fn(async () => { throw new Error("编辑失败"); }) as Props["request"];
    const onError = vi.fn();
    render(feature({ request, onError }));
    fireEvent.click(screen.getByRole("button", { name: "编辑任务" }));
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
    const onPauseTimer = vi.fn();
    const onFinishTimer = vi.fn();
    render(feature({
      request,
      onChanged,
      onReward,
      onPauseTimer,
      onFinishTimer,
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
    fireEvent.click(screen.getByRole("button", { name: "完成并写入时间轴" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(requestMock.mock.calls[0][0]).toBe("/api/tasks/1/complete");
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body))).toMatchObject({
      scheduleDate: "2026-09-18",
      startTime: "09:00",
      endTime: "10:00",
      completionNote: "完成得很扎实"
    });
    expect(onReward).toHaveBeenCalledWith(task, { xp: 12, coins: 3 });
    expect(onPauseTimer).not.toHaveBeenCalled();
    expect(onFinishTimer).not.toHaveBeenCalled();
  });
});
