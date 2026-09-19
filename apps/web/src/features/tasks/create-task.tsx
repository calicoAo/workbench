import { type FormEvent, type ReactNode, useState } from "react";
import type { Category } from "../categories";
import { type Request, type Task, dueAtPayload, perform } from "./model";
import { CategoryOptions, CloseButton, DifficultyOptions, ModalPortal } from "./task-ui";

type CreateResult = { id: number };

export function CreateTaskWorkflow({ children, request, selectedDate, tasks, categories, dailyTaskIds, onError, onChanged }: {
  children: (open: () => void) => ReactNode;
  request: Request;
  selectedDate: string;
  tasks: Task[];
  categories: Category[];
  dailyTaskIds: number[];
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [difficulty, setDifficulty] = useState("2");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("18:00");
  const [planEnabled, setPlanEnabled] = useState(false);
  const [planStart, setPlanStart] = useState("09:00");
  const [planEnd, setPlanEnd] = useState("10:00");
  const effectiveCategoryId = categoryId && categories.some((category) => String(category.id) === categoryId)
    ? categoryId
    : String(categories[0]?.id ?? "");

  async function submit(takeToday: boolean) {
    if (!title.trim()) {
      onError("先写一个任务标题。");
      return;
    }
    if (!effectiveCategoryId) {
      onError("新增任务需要选择事件类型。");
      return;
    }
    await perform(onError, async () => {
      const result = await request<CreateResult>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          categoryId: Number(effectiveCategoryId),
          priority: 2,
          difficulty: Number(difficulty),
          dueAt: dueAtPayload(dueDate, dueTime) ?? undefined,
          plannedDate: planEnabled ? selectedDate : undefined,
          plannedStartTime: planEnabled ? planStart : undefined,
          plannedEndTime: planEnabled ? planEnd : undefined
        })
      });
      if (takeToday) {
        const currentIds = dailyTaskIds.filter((taskId) => {
          const task = tasks.find((item) => item.id === taskId);
          return task && task.status !== 2 && task.status !== 3;
        });
        await request("/api/task-days", {
          method: "PUT",
          body: JSON.stringify({ taskDate: selectedDate, taskIds: [...currentIds, result.id] })
        });
      }
      setTitle("");
      setDescription("");
      setDifficulty("2");
      setDueDate("");
      setDueTime("18:00");
      setPlanEnabled(false);
      setOpen(false);
      await onChanged();
    });
  }

  return <>
    {children(() => setOpen(true))}
    {open && (
      <ModalPortal onClose={() => setOpen(false)}>
        <form className="time-modal task-create-modal" onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(false); }}>
          <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-mint-700">发布悬赏</p><h3 className="text-sm font-semibold">新增任务到任务池</h3></div><CloseButton onClose={() => setOpen(false)} /></div>
          <div className="task-create-layout">
            <label className="task-form-field task-form-field-wide"><span>任务标题</span><input aria-label="任务标题" className="field" placeholder="写一个清楚的悬赏标题" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
            <label className="task-form-field task-form-field-wide"><span>任务详情</span><textarea aria-label="任务详情" className="task-description-field" maxLength={2000} placeholder="可以写背景、完成标准、步骤或灵感，任务列表里会保留一行摘要" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label className="task-form-field"><span>事件类型</span><select aria-label="事件类型" className="field" value={effectiveCategoryId} onChange={(event) => setCategoryId(event.target.value)} required><option value="">选择技能/主题</option><CategoryOptions categories={categories} /></select></label>
            <label className="task-form-field"><span>难度</span><select aria-label="难度" className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><DifficultyOptions /></select></label>
            <label className="task-form-field task-form-field-due"><span>截止</span><span className="task-inline-inputs"><input aria-label="截止日期" className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><input aria-label="截止时间" className="field" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} disabled={!dueDate} />{dueDate ? <button className="icon-button h-8 w-auto px-3 text-[11px]" type="button" onClick={() => setDueDate("")}>清空</button> : null}</span></label>
            <label className="task-form-field task-form-field-plan"><span className="task-checkbox-label"><input aria-label="预设时段" className="accent-mint-500" type="checkbox" checked={planEnabled} onChange={(event) => setPlanEnabled(event.target.checked)} />预设时段</span><span className="task-inline-inputs"><input aria-label="预设开始时间" className="field" type="time" value={planStart} onChange={(event) => setPlanStart(event.target.value)} disabled={!planEnabled} /><input aria-label="预设结束时间" className="field" type="time" value={planEnd} onChange={(event) => setPlanEnd(event.target.value)} disabled={!planEnabled} /></span></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><button className="icon-button w-auto px-4" type="button" onClick={() => setOpen(false)}>取消</button><button className="primary-button px-5" type="submit">发布</button><button className="primary-button px-5" type="button" onClick={() => void submit(true)}>发布并接取</button></div>
        </form>
      </ModalPortal>
    )}
  </>;
}
