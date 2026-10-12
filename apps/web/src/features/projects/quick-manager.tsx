import { useState } from "react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import type { ProjectSummary } from ".";
import { ProjectEditor } from "./editor";
import { isAssignableProject, useProjects } from "./queries";

export function ProjectRefreshStatus({ request, userId }: { request: Request; userId: number }) {
  const query = useProjects(request, userId);
  return query.isError ? <p className="notes-error category-refresh" role="alert">{tx("项目列表加载失败，已保存的项目仍保留。")}
    <Button type="button" size="sm" onClick={() => void query.refetch()}>{tx("刷新项目列表")}</Button></p> : null;
}

/** Embedded Projects capability; Tasks owns the surrounding active panel. */
export function ProjectQuickManager({ request, userId, onPending, onClose, onSelect, onSaved, onError }: {
  request: Request; userId: number; onPending: (pending: boolean) => void; onClose: () => void;
  onSelect: (project: ProjectSummary) => void; onSaved: (project: ProjectSummary, created: boolean) => void;
  onError: (message: string, title?: string) => void;
}) {
  const query = useProjects(request, userId);
  const [editing, setEditing] = useState<ProjectSummary | null>(null);
  const [pending, setPending] = useState(false);
  const projects = Array.isArray(query.data) ? query.data.filter(isAssignableProject) : [];
  return <section className="project-quick-manager">
    <ProjectEditor key={`${userId}:${editing?.id ?? "new"}`} request={request} userId={userId} project={editing} embedded onClose={onClose} onSaved={onSaved} onError={onError} onPending={(value) => { setPending(value); onPending(value); }} />
    <ProjectRefreshStatus request={request} userId={userId} />
    <div className="project-quick-list"><h3>{tx("已有项目")}</h3>{editing ? <Button type="button" size="sm" disabled={pending} onClick={() => setEditing(null)}>{tx("新建项目")}</Button> : null}
      {projects.map((project) => <div className="project-quick-row" key={project.id}><span>{project.name}</span><Button type="button" size="sm" disabled={pending} onClick={() => onSelect(project)}>{tx("使用")}</Button><Button type="button" size="sm" disabled={pending} aria-label={tx("编辑项目 {value0}", { value0: project.name })} onClick={() => setEditing(project)}>{tx("编辑")}</Button></div>)}
    </div>
  </section>;
}
