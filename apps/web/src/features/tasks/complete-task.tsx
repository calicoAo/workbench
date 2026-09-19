import { type FormEvent, type ReactNode, useState } from "react";
import type { RewardGrant } from "../rewards";
import { type CompleteResult, type Request, type Schedule, type Task, currentTimeInput, minutesAgoInput, perform } from "./model";
import { CloseButton, ModalActions, ModalPortal } from "./task-ui";

export function CompleteTaskWorkflow({ children, request, selectedDate, taskPlans, onError, onChanged, onReward }: {
  children: (toggle: (task: Task) => void | Promise<void>) => ReactNode;
  request: Request;
  selectedDate: string;
  taskPlans: Map<number, Schedule>;
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
  onReward: (task: Pick<Task, "id" | "title">, reward: RewardGrant | null) => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [note, setNote] = useState("");
  const [completionKey, setCompletionKey] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");

  function close() {
    setTask(null);
    setNote("");
    setCompletionKey("");
  }

  async function toggle(nextTask: Task) {
    if (nextTask.status === 2) {
      await perform(onError, async () => {
        await request(`/api/tasks/${nextTask.id}/status`, { method: "PUT", body: JSON.stringify({ status: 0 }) });
        if (task?.id === nextTask.id) close();
        await onChanged();
      });
      return;
    }
    const plan = taskPlans.get(nextTask.id);
    setDate(selectedDate);
    setStart(plan?.startTime.slice(0, 5) ?? minutesAgoInput(30));
    setEnd(plan?.endTime.slice(0, 5) ?? currentTimeInput());
    setTask(nextTask);
    setNote(nextTask.completionNote ?? "");
    setCompletionKey(crypto.randomUUID());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!task) return;
    if (end <= start) {
      onError("结束时间需要晚于开始时间");
      return;
    }
    await perform(onError, async () => {
      const completedTask = task;
      const stableKey = completionKey || crypto.randomUUID();
      if (!completionKey) setCompletionKey(stableKey);
      const result = await request<CompleteResult>(`/api/tasks/${completedTask.id}/complete`, {
        method: "PUT",
        body: JSON.stringify({
          completionKey: stableKey,
          scheduleDate: date,
          startTime: start,
          endTime: end,
          completionNote: note.trim() || undefined
        })
      });
      close();
      await onChanged();
      onReward(completedTask, result.reward);
    });
  }

  return <>
    {children(toggle)}
    {task && (
      <ModalPortal onClose={close}>
        <form className="time-modal max-w-[560px]" onSubmit={submit}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold text-mint-700">任务完成了</p><h3 className="text-sm font-semibold">{task.title}</h3><p className="mt-1 text-[11px] text-soft">确认实际完成时段，也可以给自己留一句感想。</p></div>
            <CloseButton onClose={close} />
          </div>
          <label className="text-[11px] text-soft">日期<input aria-label="完成日期" className="field mt-1" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-soft">开始<input aria-label="完成开始时间" className="field mt-1" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            <label className="text-[11px] text-soft">结束<input aria-label="完成结束时间" className="field mt-1" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          </div>
          <textarea aria-label="完成感想" className="journal-input mt-2 min-h-28" placeholder="刚刚完成后的感想..." value={note} onChange={(event) => setNote(event.target.value)} />
          <ModalActions onClose={close} submitLabel="完成并写入时间轴" />
        </form>
      </ModalPortal>
    )}
  </>;
}
