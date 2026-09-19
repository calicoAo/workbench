import { type FormEvent, type ReactNode, useState } from "react";
import { type Request, type Task, dateInput, dueAtPayload, perform, timeInput } from "./model";
import { CloseButton, DifficultyOptions, ModalActions, ModalPortal } from "./task-ui";

export function EditTaskWorkflow({ children, request, onError, onChanged }: {
  children: (open: (task: Task) => void) => ReactNode;
  request: Request;
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("18:00");
  const [difficulty, setDifficulty] = useState("2");

  function open(nextTask: Task) {
    setTask(nextTask);
    setTitle(nextTask.title);
    setDescription(nextTask.description ?? "");
    setDueDate(dateInput(nextTask.dueAt));
    setDueTime(timeInput(nextTask.dueAt));
    setDifficulty(String(nextTask.difficulty ?? 2));
  }

  function close() {
    setTask(null);
    setTitle("");
    setDescription("");
    setDueDate("");
    setDueTime("18:00");
    setDifficulty("2");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!task) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      onError("任务标题不能为空");
      return;
    }
    await perform(onError, async () => {
      await request(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: nextTitle,
          description: description.trim() || null,
          difficulty: Number(difficulty),
          dueAt: dueAtPayload(dueDate, dueTime)
        })
      });
      close();
      await onChanged();
    });
  }

  return <>
    {children(open)}
    {task && (
      <ModalPortal onClose={close}>
        <form className="time-modal" onSubmit={submit}>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">编辑任务</h3><CloseButton onClose={close} /></div>
          <div className="space-y-2">
            <input aria-label="编辑任务标题" className="field" autoFocus maxLength={200} placeholder="任务标题" value={title} onChange={(event) => setTitle(event.target.value)} />
            <textarea aria-label="编辑任务详情" className="task-description-field" maxLength={2000} placeholder="任务详情：背景、步骤、完成标准、灵感都可以放在这里" value={description} onChange={(event) => setDescription(event.target.value)} />
            <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
              <input className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              <input className="field" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} disabled={!dueDate} />
              <select className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><DifficultyOptions /></select>
              <button className="icon-button w-auto px-3 text-[11px]" type="button" onClick={() => setDueDate("")}>清空截止</button>
            </div>
          </div>
          <ModalActions onClose={close} submitLabel="保存" />
        </form>
      </ModalPortal>
    )}
  </>;
}
