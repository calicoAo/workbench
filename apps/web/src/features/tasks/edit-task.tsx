import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../../shared/ui";
import { CategoryQuickManager, useCategoryOptions, type Category } from "../categories";
import { type ProjectOption, type Request, type Task, dateInput, dueAtPayload, perform, timeInput } from "./model";
import { CategoryField, CloseButton, DifficultyOptions, ModalActions, ModalPortal } from "./task-ui";
import { tx } from "../../app/i18n";
import { useFeedbackPresentation } from "../../app/feedback";

export function EditTaskWorkflow({ children, request, projects, categories, onError, onChanged, userId }: {
  children: (open: (task: Task) => void) => ReactNode;
  request: Request;
  userId: number;
  projects: ProjectOption[];
  categories: Category[];
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [categoryPanel, setCategoryPanel] = useState(false);
  const categoryPending = useRef(false);
  const categoryLaunch = useRef<HTMLDivElement>(null);
  const returnToCategory = useRef(false);
  const popupIsOpen = useFeedbackPresentation();
  useEffect(() => {
    if (!categoryPanel && !popupIsOpen && returnToCategory.current) {
      categoryLaunch.current?.querySelector<HTMLButtonElement>("button")?.focus();
      returnToCategory.current = false;
    }
  }, [categoryPanel, popupIsOpen]);
  const options = useCategoryOptions(request, userId, categories, Boolean(task));
  function closeCategory() { if (categoryPending.current) return; setCategoryPanel(false); returnToCategory.current = true; }
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
    setCategoryPanel(false);
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
    if (!task || categoryPanel) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      onError(tx("任务标题不能为空"));
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
      <ModalPortal panelKey={categoryPanel ? "category" : "task"} label={categoryPanel ? tx("管理分类") : tx("编辑任务")} onClose={categoryPanel ? closeCategory : close}>
        <div hidden={categoryPanel} {...(categoryPanel ? { inert: "" } : { "data-active-task-panel": true })}>
        <form className="time-modal" onSubmit={submit}>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{tx("编辑任务")}</h3><CloseButton onClose={close} /></div>
          <div className="space-y-2">
            <input aria-label={tx("编辑任务标题")} className="field" autoFocus maxLength={200} placeholder={tx("任务标题")} value={title} onChange={(event) => setTitle(event.target.value)} />
            <textarea aria-label={tx("编辑任务详情")} className="task-description-field" maxLength={2000} placeholder={tx("任务详情：背景、步骤、完成标准、灵感都可以放在这里")} value={description} onChange={(event) => setDescription(event.target.value)} />
            <label className="task-form-field"><span>{tx("所属项目")}</span><select aria-label={tx("编辑所属项目")} className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{tx("Inbox / 无项目")}</option>{projects.filter((project) => !project.archivedAt && project.status !== 3).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label className="task-form-field"><span>{tx("分类（可选）")}</span><div ref={categoryLaunch}><CategoryField categories={options.data ?? categories} value={categoryId} onChange={setCategoryId} onManage={() => setCategoryPanel(true)} /></div></label>
            <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
              <input className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              <input className="field" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} disabled={!dueDate} />
              <select className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><DifficultyOptions /></select>
              <Button variant="ghost" size="sm" type="button" onClick={() => setDueDate("")}>{tx("清空截止")}</Button>
            </div>
          </div>
          <ModalActions onClose={close} submitLabel={tx("保存")} />
        </form></div>
        {categoryPanel ? <div data-active-task-panel className="task-category-panel"><CategoryQuickManager key={userId} request={request} userId={userId} onPending={(pending) => { categoryPending.current = pending; }} onClose={closeCategory} onError={onError} onSelect={(category) => { setCategoryId(String(category.id)); closeCategory(); }} onSaved={(category, created) => {
          if (created || String(category.id) === categoryId) setCategoryId(String(category.id));
          categoryPending.current = false; closeCategory();
          queueMicrotask(() => onError(tx("{value0}已保存", { value0: category.name }), created ? tx("分类已创建") : tx("分类已更新")));
        }} /></div> : null}
      </ModalPortal>
    )}
  </>;
}
