import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import type { ProjectDetail, ProjectSummary } from ".";

export function isAssignableProject(project: Pick<ProjectSummary, "status" | "archivedAt">) {
  return !project.archivedAt && project.status !== 3;
}

export function useProjects(request: Request, userId: number, view = "active", enabled = true) {
  return useQuery({ queryKey: queryKeys.projects(userId, view), enabled, queryFn: () => request<ProjectSummary[]>(`/api/projects?view=${view}`) });
}

/** Only resolved canonical entities enter list snapshots; a POST receipt is not a Project. */
export function commitProject(client: QueryClient, userId: number, detail: ProjectDetail) {
  const saved = detail.project;
  client.setQueryData(queryKeys.project(userId, saved.id), detail);
  client.setQueriesData<ProjectSummary[]>({ queryKey: ["projects", userId] }, (rows) => rows?.map((row) => row.id === saved.id ? saved : row));
  for (const view of ["active", "archived", "all"]) {
    client.setQueryData<ProjectSummary[]>(queryKeys.projects(userId, view), (rows) => {
      if (!rows && view !== "active") return rows;
      const remaining = (rows ?? []).filter((row) => row.id !== saved.id);
      return view === "all" || (view === "archived" ? Boolean(saved.archivedAt) : !saved.archivedAt) ? [...remaining, saved] : remaining;
    });
  }
  void client.invalidateQueries({ queryKey: ["projects", userId] });
  void client.invalidateQueries({ queryKey: queryKeys.project(userId, saved.id) });
}
