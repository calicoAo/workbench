import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "../../shared/ui";
import type { Category } from "../categories";
import { type ProjectOption, type Request, type Task, dueAtPayload, perform } from "./model";
import { CategoryField, CloseButton, DifficultyOptions, ModalPortal } from "./task-ui";

type CreateResult = { id: number };

export function CreateTaskWorkflow({ children, request, selectedDate, categories, projects, onError, onChanged, timezone }: {
  children: (open: (options?: { projectId?: number }) => void) => ReactNode;
  request: Request;
  selectedDate: string;
  tasks: Task[];
  categories: Category[];
  projects: ProjectOption[];
  dailyTaskIds: number[];
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
  timezone?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [difficulty, setDifficulty] = useState("2");
  const [priority, setPriority] = useState("2");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [progressPercent, setProgressPercent] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("18:00");
  const effectiveCategoryId = categoryId && categories.some((category) => String(category.id) === categoryId) ? categoryId : timezone === undefined ? String(categories[0]?.id ?? "") : "";

  async function submit(takeToday: boolean) {
    if (!title.trim()) {
      onError("先写一个任务标题。");
      return;
    }
    await perform(onError, async () => {
      await request<CreateResult>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          title: title.trim(),
          description: description.trim() || undefined,
          categoryId: effectiveCategoryId ? Number(effectiveCategoryId) : undefined,
          projectId: projectId ? Number(projectId) : null,
          priority: Number(priority),
          difficulty: Number(difficulty),
          dueAt: dueAtPayload(dueDate, dueTime) ?? undefined,
          estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
          progressPercent: Number(progressPercent),
          acceptDate: takeToday ? selectedDate : undefined,
          recordTimezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      setTitle("");
      setDescription("");
      setProjectId("");
      setDifficulty("2");
      setPriority("2");
      setEstimatedMinutes("");
      setProgressPercent("0");
      setDueDate("");
      setDueTime("18:00");
      setOpen(false);
      await onChanged();
    });
  }

  return <>
    {children((options) => { setProjectId(options?.projectId ? String(options.projectId) : ""); setOpen(true); })}
    {open && (
      <ModalPortal onClose={() => setOpen(false)}>
        <form className="time-modal task-create-modal" onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(false); }}>
          <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-mint-700">发布悬赏</p><h3 className="text-sm font-semibold">新增任务到任务池</h3></div><CloseButton onClose={() => setOpen(false)} /></div>
          <div className="task-create-layout">
            <label data-guide-anchor="task.title" className="task-form-field task-form-field-wide"><span>任务标题</span><input aria-label="任务标题" className="field" placeholder="写一个清楚的悬赏标题" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
            <label className="task-form-field task-form-field-wide"><span>任务详情</span><textarea aria-label="任务详情" className="task-description-field" maxLength={2000} placeholder="可以写背景、完成标准、步骤或灵感，任务列表里会保留一行摘要" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label className="task-form-field"><span>分类（可选）</span><CategoryField request={request} categories={categories} value={effectiveCategoryId} onChange={setCategoryId} onChanged={onChanged} /></label>
            <label className="task-form-field"><span>所属项目</span><select aria-label="所属项目" className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Inbox / 无项目</option>{projects.filter((project) => !project.archivedAt && project.status !== 3).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label className="task-form-field"><span>优先级</span><select aria-label="优先级" className="field" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="1">低</option><option value="2">中</option><option value="3">高</option></select></label>
            <label className="task-form-field"><span>难度</span><select aria-label="难度" className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><DifficultyOptions /></select></label>
            <label className="task-form-field"><span>预计分钟</span><input aria-label="预计分钟" className="field" type="number" min="1" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
            <label className="task-form-field"><span>初始进度</span><input aria-label="初始进度" className="field" type="number" min="0" max="100" value={progressPercent} onChange={(event) => setProgressPercent(event.target.value)} /></label>
            <label className="task-form-field task-form-field-due"><span>截止</span><span className="task-inline-inputs"><input aria-label="截止日期" className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><input aria-label="截止时间" className="field" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} disabled={!dueDate} />{dueDate ? <Button variant="ghost" size="sm" type="button" onClick={() => setDueDate("")}>清空</Button> : null}</span></label>
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>取消</Button><Button variant="primary" type="submit">发布</Button><Button variant="primary" type="button" onClick={() => void submit(true)}>发布并接取</Button></div>
        </form>
      </ModalPortal>
    )}
  </>;
}
