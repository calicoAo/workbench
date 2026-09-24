// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { ProjectDetailPage, ProjectsPage, type ProjectSummary } from ".";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const project: ProjectSummary = { id: 9, name: "导游考试", description: "准备考试", status: 1, priority: 3, startDate: "2026-09-01", targetDate: "2026-12-31", notes: "按章节推进", version: 2, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z", archivedAt: null, taskCount: 2, completedTaskCount: 1, progressPercent: 60, actualSeconds: 7200, nextTask: { id: 41, title: "第三章练习", priority: 2, dueAt: null, progressPercent: 20, status: 1, version: 3 } };
const task = { id: 41, title: "第三章练习", description: null, categoryId: null, projectId: 9, status: 1, priority: 2, difficulty: 2, pinned: 0, sortOrder: 1, dueAt: null, progressPercent: 20, version: 3, createdAt: "2026-09-01T00:00:00Z", completedAt: null, completionNote: null };
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); }

describe("Projects", () => {
  it("renders list metrics and creates through the Project owner", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === "POST" ? { id: 10, version: 1 } : [project]) as Request;
    render(<QueryClientProvider client={client()}><MemoryRouter><ProjectsPage request={request} userId={7} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("导游考试")).toBeTruthy(); expect(screen.getByText("60%")).toBeTruthy(); expect(screen.getByText("2h 0m")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "创建项目" })); fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "新项目" } }); fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/projects", expect.objectContaining({ method: "POST" })));
  });

  it("keeps tabs in the URL and exposes existing Task actions", async () => {
    const request = vi.fn(async () => ({ project, tasks: [task], plannedSchedules: [], actualEntries: [] })) as Request;
    const createTask = vi.fn(), editTask = vi.fn();
    render(<QueryClientProvider client={client()}><MemoryRouter initialEntries={["/projects/9"]}><ProjectDetailPage request={request} userId={7} projectId={9} onError={vi.fn()} onCreateTask={createTask} onEditTask={editTask} /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "导游考试" })).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "悬赏" }));
    expect(await screen.findByText("第三章练习")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "发布所属悬赏" })); expect(createTask).toHaveBeenCalledWith({ projectId: 9 });
    fireEvent.click(screen.getByRole("button", { name: "编辑悬赏" })); expect(editTask).toHaveBeenCalledWith(task);
  });

  it("requires an explicit unfinished-Task choice before completion", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === "PUT" ? { id: 9, status: 3, version: 3 } : ({ project, tasks: [task], plannedSchedules: [], actualEntries: [] })) as Request;
    render(<QueryClientProvider client={client()}><MemoryRouter><ProjectDetailPage request={request} userId={7} projectId={9} onError={vi.fn()} onCreateTask={vi.fn()} onEditTask={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    await screen.findByRole("heading", { name: "导游考试" }); fireEvent.click(screen.getByRole("button", { name: "完成项目" }));
    expect(screen.getByText("仍有 1 个未完成悬赏")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "完成项目，但保留未完成悬赏" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/projects/9/status", expect.objectContaining({ body: expect.stringContaining('"unfinishedTaskPolicy":"KEEP"') })));
  });

  it("shows linked QuickNote summaries as deep-linked materials", async () => {
    const request = vi.fn(async (path: string) => path.endsWith("/materials") ? { items: [{ id: 15, title: "路线素材", excerpt: "只展示轻量摘要", noteDate: "2026-09-21", tag: "备考", archivedAt: null, deepLink: "/notes/15?date=2026-09-21" }] } : { project, tasks: [], plannedSchedules: [], actualEntries: [] }) as Request;
    render(<QueryClientProvider client={client()}><MemoryRouter initialEntries={["/projects/9?tab=notes"]}><ProjectDetailPage request={request} userId={7} projectId={9} onError={vi.fn()} onCreateTask={vi.fn()} onEditTask={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("路线素材")).toBeTruthy();
    expect(screen.getByText("只展示轻量摘要")).toBeTruthy();
    expect(screen.getByRole("link", { name: /路线素材/ }).getAttribute("href")).toBe("/notes/15?date=2026-09-21");
  });
});
