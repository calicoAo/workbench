import { useRef, useState } from "react";
import { tx } from "../../app/i18n";
import { perform, type Request, type Task } from "./model";

export function useDailyFocus({ request, date, tasks, dailyTaskIds, focusTaskIds, onError, onChanged }: {
  request: Request; date: string; tasks: Task[]; dailyTaskIds: number[]; focusTaskIds: number[];
  onError: (message: string) => void; onChanged: () => void | Promise<void>;
}) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const accepted = dailyTaskIds.filter((id) => tasks.some((task) => task.id === id && task.status < 2));
  const focused = focusTaskIds.filter((id) => accepted.includes(id));
  async function setFocus(taskId: number, value: boolean) {
    if (busy.current || !accepted.includes(taskId) || focused.includes(taskId) === value) return;
    if (value && focused.length >= 3) { onError(tx("今日重点最多 3 项，请先取消一项。")); return; }
    busy.current = true;
    setPending(true);
    try {
      await perform(onError, async () => {
        await request("/api/task-days", { method: "PUT", body: JSON.stringify({ taskDate: date, taskIds: accepted, focusTaskIds: value ? [...focused, taskId] : focused.filter((id) => id !== taskId) }) });
        await onChanged();
      });
    } finally { busy.current = false; setPending(false); }
  }
  return { pending, focused, setFocus };
}
