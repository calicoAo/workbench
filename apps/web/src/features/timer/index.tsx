import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { type FormEvent, type ReactNode, useState } from "react";
import { type RewardGrant } from "../rewards";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Task = { id: number; title: string };
type StopResult = { rewards: RewardGrant[] };

export type TimerSession = { id: number; taskId: number; startTime: string; durationMinutes: number; status: number };
export type TimerActions = {
  start: (taskId: number) => Promise<void>;
  pause: (timerId: number) => Promise<void>;
  finish: (timer: TimerSession) => void;
};

export function TimerFeature({ request, tasks, runningTimers, onError, onChanged, onReward, children }: {
  request: Request;
  tasks: Task[];
  runningTimers: TimerSession[];
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
  onReward: (task: Task | undefined, rewards: RewardGrant[], mode: "done" | "partial") => void;
  children: (actions: TimerActions) => ReactNode;
}) {
  const [finishing, setFinishing] = useState<TimerSession | null>(null);
  const [scheduleDate, setScheduleDate] = useState(todayString());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  async function start(taskId: number) {
    try {
      await request("/api/timer-sessions/start", { method: "POST", body: JSON.stringify({ taskId }) });
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  async function pause(timerId: number) {
    try {
      const timer = runningTimers.find((item) => item.id === timerId);
      const result = await request<StopResult>(`/api/timer-sessions/${timerId}/pause`, { method: "PUT" });
      await onChanged();
      onReward(tasks.find((task) => task.id === timer?.taskId), result.rewards ?? [], "partial");
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  function openFinish(timer: TimerSession) {
    setFinishing(timer);
    setScheduleDate(localDateInput(timer.startTime));
    setStartTime(timeText(timer.startTime));
    setEndTime(timeInputFromDate(new Date()));
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    if (!finishing) return;
    if (endTime <= startTime) {
      onError("结束时间需要晚于开始时间");
      return;
    }
    try {
      const task = tasks.find((item) => item.id === finishing.taskId);
      const result = await request<StopResult>(`/api/timer-sessions/${finishing.id}/finish`, {
        method: "PUT",
        body: JSON.stringify({ scheduleDate, startTime, endTime, completeTask: true })
      });
      setFinishing(null);
      await onChanged();
      onReward(task, result.rewards ?? [], "done");
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  return (
    <>
      {children({ start, pause, finish: openFinish })}
      {finishing && (
        <FinishTimerDialog
          taskTitle={tasks.find((task) => task.id === finishing.taskId)?.title ?? "当前任务"}
          scheduleDate={scheduleDate}
          startTime={startTime}
          endTime={endTime}
          onDateChange={setScheduleDate}
          onStartChange={setStartTime}
          onEndChange={setEndTime}
          onClose={() => setFinishing(null)}
          onSubmit={finish}
        />
      )}
    </>
  );
}

function FinishTimerDialog(props: {
  taskTitle: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  onDateChange: (value: string) => void;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>
        <form className="time-modal" onSubmit={props.onSubmit}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold text-mint-700">结束计时</p><h3 className="text-sm font-semibold">{props.taskTitle}</h3><p className="mt-1 text-[11px] text-soft">确认这段实际投入时间，会写入小时记录。</p></div>
            <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={props.onClose}><X size={15} /></button>
          </div>
          <label className="text-[11px] text-soft">日期<input aria-label="计时日期" className="field mt-1" type="date" value={props.scheduleDate} onChange={(event) => props.onDateChange(event.target.value)} /></label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-soft">开始<input aria-label="计时开始" className="field mt-1" type="time" value={props.startTime} onChange={(event) => props.onStartChange(event.target.value)} /></label>
            <label className="text-[11px] text-soft">结束<input aria-label="计时结束" className="field mt-1" type="time" value={props.endTime} onChange={(event) => props.onEndChange(event.target.value)} /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={props.onClose}>取消</button>
            <button className="primary-button px-5" type="submit">写入时间轴</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayString();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return date.toTimeString().slice(0, 5);
}

function timeInputFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
