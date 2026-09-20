import { type FormEvent, type ReactNode, useState } from "react";
import type { RewardGrant } from "../rewards";
import { type CompleteResult, type Request, type Schedule, type Task, perform } from "./model";
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

  function close() {
    setTask(null);
    setNote("");
    setCompletionKey("");
  }

  async function toggle(nextTask: Task) {
    if (nextTask.status === 2) {
      await perform(onError, async () => {
        await request(`/api/tasks/${nextTask.id}/reopen`, { method: "PUT", body: JSON.stringify({ operationId: crypto.randomUUID(), expectedVersion: nextTask.version, progressPercent: 0 }) });
        if (task?.id === nextTask.id) close();
        await onChanged();
      });
      return;
    }
    void taskPlans;
    void selectedDate;
    setTask(nextTask);
    setNote(nextTask.completionNote ?? "");
    setCompletionKey(crypto.randomUUID());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!task) return;
    await perform(onError, async () => {
      const completedTask = task;
      const stableKey = completionKey || crypto.randomUUID();
      if (!completionKey) setCompletionKey(stableKey);
      const result = await request<CompleteResult>(`/api/tasks/${completedTask.id}/complete`, {
        method: "PUT",
        body: JSON.stringify({
          operationId: stableKey,
          expectedVersion: completedTask.version,
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
            <div><p className="text-xs font-semibold text-mint-700">任务完成了</p><h3 className="text-sm font-semibold">{task.title}</h3><p className="mt-1 text-[11px] text-soft">Task 完成不会伪造 Actual 时间；实际投入请由计时或手工 Actual 记录。</p></div>
            <CloseButton onClose={close} />
          </div>
          <textarea aria-label="完成感想" className="journal-input mt-2 min-h-28" placeholder="刚刚完成后的感想..." value={note} onChange={(event) => setNote(event.target.value)} />
          <ModalActions onClose={close} submitLabel="完成任务" />
        </form>
      </ModalPortal>
    )}
  </>;
}
