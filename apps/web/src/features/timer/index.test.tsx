// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimerFeature, type TimerActions, type TimerSession } from ".";

afterEach(cleanup);

const timer: TimerSession = { id: 5, taskId: 11, startTime: "2026-09-19T09:00:00+08:00", durationMinutes: 0, status: 0 };
type Props = ComponentProps<typeof TimerFeature>;

function feature({ request = vi.fn(async () => ({ rewards: [] })) as Props["request"], onError = vi.fn(), onChanged = vi.fn(), onReward = vi.fn() }: Partial<Props> = {}) {
  return {
    element: (
      <TimerFeature request={request} tasks={[{ id: 11, title: "完成切片" }]} runningTimers={[timer]} onError={onError} onChanged={onChanged} onReward={onReward}>
        {(actions: TimerActions) => <><button onClick={() => actions.start(11)}>开始测试</button><button onClick={() => actions.pause(5)}>暂停测试</button><button onClick={() => actions.finish(timer)}>结束测试</button></>}
      </TimerFeature>
    ),
    request,
    onError,
    onChanged,
    onReward
  };
}

describe("TimerFeature workflow ownership", () => {
  it("starts and pauses through the owned mutations", async () => {
    const setup = feature();
    render(setup.element);
    fireEvent.click(screen.getByRole("button", { name: "开始测试" }));
    await waitFor(() => expect(setup.request).toHaveBeenCalledWith("/api/timer-sessions/start", { method: "POST", body: JSON.stringify({ taskId: 11 }) }));
    fireEvent.click(screen.getByRole("button", { name: "暂停测试" }));
    await waitFor(() => expect(setup.request).toHaveBeenCalledWith("/api/timer-sessions/5/pause", { method: "PUT" }));
    expect(setup.onReward).toHaveBeenCalledWith({ id: 11, title: "完成切片" }, [], "partial");
  });

  it("opens a finish draft and submits the explicit terminal command", async () => {
    const setup = feature();
    render(setup.element);
    fireEvent.click(screen.getByRole("button", { name: "结束测试" }));
    expect(screen.getByRole("heading", { name: "完成切片" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("计时日期"), { target: { value: "2026-09-19" } });
    fireEvent.change(screen.getByLabelText("计时开始"), { target: { value: "09:15" } });
    fireEvent.change(screen.getByLabelText("计时结束"), { target: { value: "10:45" } });
    fireEvent.click(screen.getByRole("button", { name: "写入时间轴" }));

    await waitFor(() => expect(setup.request).toHaveBeenCalledWith("/api/timer-sessions/5/finish", { method: "PUT", body: JSON.stringify({ scheduleDate: "2026-09-19", startTime: "09:15", endTime: "10:45", completeTask: true }) }));
    expect(screen.queryByRole("heading", { name: "完成切片" })).toBeNull();
    expect(setup.onReward).toHaveBeenCalledWith({ id: 11, title: "完成切片" }, [], "done");
  });

  it("rejects an invalid time range before sending", () => {
    const setup = feature();
    render(setup.element);
    fireEvent.click(screen.getByRole("button", { name: "结束测试" }));
    fireEvent.change(screen.getByLabelText("计时开始"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText("计时结束"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "写入时间轴" }));
    expect(setup.request).not.toHaveBeenCalled();
    expect(setup.onError).toHaveBeenCalledWith("结束时间需要晚于开始时间");
  });

  it("keeps the finish draft open when the request fails", async () => {
    const setup = feature({ request: vi.fn(async () => { throw new Error("结束失败"); }) });
    render(setup.element);
    fireEvent.click(screen.getByRole("button", { name: "结束测试" }));
    fireEvent.change(screen.getByLabelText("计时开始"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("计时结束"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "写入时间轴" }));
    await waitFor(() => expect(setup.onError).toHaveBeenCalledWith("结束失败", "操作没有成功"));
    expect(screen.getByRole("heading", { name: "完成切片" })).toBeTruthy();
  });
});
