import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../../shared/ui";
import { CategoryQuickManager, CategoryRefreshStatus, useCategoryOptions, type Category } from "../categories";
import { type ProjectOption, type Request, type Task, dueAtPayload, perform } from "./model";
import { CategoryOptions, CloseButton, DifficultyOptions, ModalPortal } from "./task-ui";
import { tx } from "../../app/i18n";
import { useFeedbackPresentation } from "../../app/feedback";
import { ProjectQuickManager, ProjectRefreshStatus, isAssignableProject, useProjects } from "../projects";

type CreateResult = { id: number };

export function CreateTaskWorkflow({ children, request, selectedDate, categories, projects, onError, onChanged, timezone, userId }: {
  children: (open: (options?: { projectId?: number }) => void) => ReactNode;
  request: Request;
  userId: number;
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
  const [activePanel, setActivePanel] = useState<"bounty" | "category" | "project">("bounty");
  const categoryPanel = activePanel === "category";
  const projectPanel = activePanel === "project";
  const secondaryPanel = activePanel !== "bounty";
  const secondaryPending = useRef(false);
  const categoryLaunch = useRef<HTMLDivElement>(null);
  const projectLaunch = useRef<HTMLDivElement>(null);
  const returnTo = useRef<"category" | "project" | null>(null);
  const popupIsOpen = useFeedbackPresentation();
  useEffect(() => {
    if (!secondaryPanel && !popupIsOpen && returnTo.current) {
      (returnTo.current === "category" ? categoryLaunch : projectLaunch).current?.querySelector<HTMLButtonElement>("button")?.focus();
      returnTo.current = null;
    }
  }, [secondaryPanel, popupIsOpen]);
  const options = useCategoryOptions(request, userId, categories, open);
  const categoryOptions = options.data ?? categories;
  const projectQuery = useProjects(request, userId, "active", open);
  const projectOptions = Array.isArray(projectQuery.data) ? projectQuery.data : projects;
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
  const effectiveCategoryId = categoryId && categoryOptions.some((category) => String(category.id) === categoryId) ? categoryId : timezone === undefined ? String(categoryOptions[0]?.id ?? "") : "";

  function closeSecondary() {
    if (secondaryPending.current) return;
    returnTo.current = activePanel === "project" ? "project" : "category";
    setActivePanel("bounty");
  }
  function closeBounty() { setActivePanel("bounty"); returnTo.current = null; setOpen(false); }
  async function submit(takeToday: boolean) {
    if (secondaryPanel) return;
    if (projectId && !projectOptions.some((project) => String(project.id) === projectId && isAssignableProject(project))) {
      onError(tx("所选项目不可用，请重新选择或刷新项目列表。")); return;
    }
    if (!title.trim()) {
      onError(tx("先写一个任务标题。"));
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
      <ModalPortal panelKey={activePanel} label={categoryPanel ? tx("管理分类") : projectPanel ? tx("管理项目") : tx("发布悬赏")} onClose={secondaryPanel ? closeSecondary : closeBounty}>
        <div hidden={secondaryPanel} {...(secondaryPanel ? { inert: "" } : {})} {...(!secondaryPanel ? { "data-active-task-panel": true } : {})}>
        <form className="time-modal task-create-modal" onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(false); }}>
          <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-mint-700">{tx("发布悬赏")}</p><h3 className="text-sm font-semibold">{tx("新增任务到任务池")}</h3></div><CloseButton onClose={closeBounty} /></div>
          <div className="task-create-layout">
            <label data-guide-anchor="task.title" className="task-form-field task-form-field-wide"><span>{tx("任务标题")}</span><input aria-label={tx("任务标题")} className="field" placeholder={tx("写一个清楚的悬赏标题")} value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
            <label className="task-form-field task-form-field-wide"><span>{tx("任务详情")}</span><textarea aria-label={tx("任务详情")} className="task-description-field" maxLength={2000} placeholder={tx("可以写背景、完成标准、步骤或灵感，任务列表里会保留一行摘要")} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <label className="task-form-field"><span>{tx("分类（可选）")}</span><div ref={categoryLaunch} className="category-field"><select aria-label={tx("事件类型")} className="field" value={effectiveCategoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">{tx("未分类 / Inbox")}</option><CategoryOptions categories={categoryOptions} /></select><Button type="button" size="sm" onClick={() => setActivePanel("category")}>{tx("新建 / 管理分类")}</Button></div></label>
            <label className="task-form-field"><span>{tx("所属项目")}</span><div ref={projectLaunch} className="category-field"><select aria-label={tx("所属项目")} className="field" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{tx("Inbox / 无项目")}</option>{projectId && !projectOptions.some((project) => String(project.id) === projectId && isAssignableProject(project)) ? <option value={projectId} disabled>{tx("所选项目不可用，请重新选择或刷新项目列表。")}</option> : null}{projectOptions.filter(isAssignableProject).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><Button type="button" size="sm" onClick={() => setActivePanel("project")}>{tx("新建 / 管理项目")}</Button></div></label>
            <label className="task-form-field"><span>{tx("优先级")}</span><select aria-label={tx("优先级")} className="field" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="1">{tx("低")}</option><option value="2">{tx("中")}</option><option value="3">{tx("高")}</option></select></label>
            <label className="task-form-field"><span>{tx("难度")}</span><select aria-label={tx("难度")} className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><DifficultyOptions /></select></label>
            <label className="task-form-field"><span>{tx("预计分钟")}</span><input aria-label={tx("预计分钟")} className="field" type="number" min="1" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label>
            <label className="task-form-field"><span>{tx("初始进度")}</span><input aria-label={tx("初始进度")} className="field" type="number" min="0" max="100" value={progressPercent} onChange={(event) => setProgressPercent(event.target.value)} /></label>
            <label className="task-form-field task-form-field-due"><span>{tx("截止")}</span><span className="task-inline-inputs"><input aria-label={tx("截止日期")} className="field" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><input aria-label={tx("截止时间")} className="field" type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} disabled={!dueDate} />{dueDate ? <Button variant="ghost" size="sm" type="button" onClick={() => setDueDate("")}>{tx("清空")}</Button> : null}</span></label>
          </div>
          <CategoryRefreshStatus request={request} userId={userId} />
          <ProjectRefreshStatus request={request} userId={userId} />
          <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" type="button" onClick={closeBounty}>{tx("取消")}</Button><Button variant="primary" type="submit">{tx("发布")}</Button><Button variant="primary" type="button" onClick={() => void submit(true)}>{tx("发布并接取")}</Button></div>
        </form>
        </div>
        {categoryPanel ? <div data-active-task-panel className="task-category-panel"><CategoryQuickManager key={userId} request={request} userId={userId} onPending={(pending) => { secondaryPending.current = pending; }} onClose={closeSecondary} onError={onError} onSelect={(category) => { setCategoryId(String(category.id)); closeSecondary(); }} onSaved={(category, created) => {
          if (created || String(category.id) === categoryId) setCategoryId(String(category.id));
          secondaryPending.current = false;
          closeSecondary();
          queueMicrotask(() => onError(tx("{value0}已保存", { value0: category.name }), created ? tx("分类已创建") : tx("分类已更新")));
        }} /></div> : null}
        {projectPanel ? <div data-active-task-panel className="task-project-panel"><ProjectQuickManager key={userId} request={request} userId={userId} onPending={(pending) => { secondaryPending.current = pending; }} onClose={closeSecondary} onError={onError} onSelect={(project) => { setProjectId(String(project.id)); closeSecondary(); }} onSaved={(project, created) => {
          if (created) setProjectId(String(project.id));
          secondaryPending.current = false; closeSecondary();
          queueMicrotask(() => onError(tx("{value0}已保存", { value0: project.name }), created ? tx("项目已创建") : tx("项目已更新")));
        }} /></div> : null}
      </ModalPortal>
    )}
  </>;
}
