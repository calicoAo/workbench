import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "../../shared/ui";
import type { Category } from "../categories";
import { type ProjectOption, type Request, type Task, dateInput, dueAtPayload, perform, timeInput } from "./model";
import { CategoryField, CloseButton, DifficultyOptions, ModalActions, ModalPortal } from "./task-ui";

export function EditTaskWorkflow({ children, request, projects, categories, onError, onChanged }: {
  children: (open: (task: Task) => void) => ReactNode;
  request: Request;
  projects: ProjectOption[];
  categories: Category[];
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("18:00");
  const [difficulty, setDifficulty] = useState("2");
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  function open(nextTask: Task) {
    setTask(nextTask);
    setTitle(nextTask.title);
    setDescription(nextTask.description ?? "");
    setDueDate(dateInput(nextTask.dueAt));
    setDueTime(timeInput(nextTask.dueAt));
    setDifficulty(String(nextTask.difficulty ?? 2));
    setProjectId(nextTask.projectId ? String(nextTask.projectId) : "");
    setCategoryId(nextTask.categoryId ? String(nextTask.categoryId) : "");
  }

  function close() {
    setTask(null);
    setTitle("");
    setDescription("");
    setDueDate("");
    setDueTime("18:00");
    setDifficulty("2");
    setProjectId("");
    setCategoryId("");
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
          expectedVersion: task.version,
          description: description.trim() || null,
          difficulty: Number(difficulty),
          projectId: projectId ? Number(projectId) : null,
          categoryId: categoryId ? Number(categoryId) : null,
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
            <label className="task-form-field"><span>所属项目</span><select aria-label="编辑所属项目" className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Inbox / 无项目</option>{projects.filter((project) => !project.archivedAt && project.status !== 3).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label className="task-form-field"><span>分类（可选）</span><CategoryField request={request} categories={categories} value={categoryId} onChange={setCategoryId} onChanged={onChanged} /></label>
            <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
              <input className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              <input className="field" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} disabled={!dueDate} />
              <select className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><DifficultyOptions /></select>
              <Button variant="ghost" size="sm" type="button" onClick={() => setDueDate("")}>清空截止</Button>
            </div>
          </div>
          <ModalActions onClose={close} submitLabel="保存" />
        </form>
      </ModalPortal>
    )}
  </>;
}
