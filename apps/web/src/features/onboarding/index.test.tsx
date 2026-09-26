// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { OnboardingFeature } from ".";
import { resolveGuideAnchor } from "./definition";
import type { TaskSnapshot } from "../tasks";
import type { CurrentSession } from "../timer";

const user = { id: 8, username: "new-user", displayName: "New User", timezone: "Asia/Shanghai" };
afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
function renderOnboarding(request: Request, options: { tasks?: TaskSnapshot[]; assignments?: number[]; currentSession?: CurrentSession | null; children?: React.ReactNode; initialEntry?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[options.initialEntry ?? "/today"]}><OnboardingFeature request={request} userId={user.id} tasks={options.tasks ?? []} assignments={options.assignments ?? []} currentSession={options.currentSession ?? null} onError={vi.fn()}>{options.children ?? <button data-guide-anchor="task.publish" type="button">发布</button>}</OnboardingFeature></MemoryRouter></QueryClientProvider>);
}

const task: TaskSnapshot = { id: 42, title: "真实任务", description: null, categoryId: null, status: 0, priority: 2, difficulty: 2, pinned: 0, sortOrder: 1, dueAt: null, progressPercent: 0, version: 1, createdAt: "2026-09-25T01:00:00.000Z", completedAt: null, completionNote: null };
const session: CurrentSession = { id: 9, taskId: task.id, startTime: "2026-09-25T01:10:00.000Z", durationMinutes: 25, status: 0, version: 1, recordTimezone: "Asia/Shanghai", segments: [] };

describe("onboarding runtime", () => {
  it("shows the welcome only for an eligible new user and supports skip", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/api/onboarding/status") return { eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "NOT_STARTED", currentStepId: "publish" }, hints: [] };
      return { flowId: "core-loop", flowVersion: 1, status: "SKIPPED", currentStepId: null };
    }) as unknown as Request;
    renderOnboarding(request);
    expect(await screen.findByRole("heading", { name: "欢迎来到养成系统" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "直接进入" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/flows/core-loop/skip", expect.objectContaining({ method: "POST" })));
  });

  it("does not render any onboarding UI for an existing user", async () => {
    const request = vi.fn(async () => ({ eligible: false, flow: null, hints: [] })) as unknown as Request;
    renderOnboarding(request);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/status"));
    expect(screen.queryByRole("heading", { name: "欢迎来到养成系统" })).toBeNull();
    expect(screen.getByRole("button", { name: "发布" })).toBeTruthy();
  });

  it("keeps the product surface intact when onboarding is disabled", () => {
    vi.stubEnv("VITE_ONBOARDING_DISABLED", "true");
    const request = vi.fn() as unknown as Request;
    renderOnboarding(request);
    expect(screen.getByRole("button", { name: "发布" })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("keeps the product usable when onboarding status is unavailable", async () => {
    const request = vi.fn(async () => { throw new Error("offline"); }) as unknown as Request;
    renderOnboarding(request);
    expect(screen.getByRole("button", { name: "发布" })).toBeTruthy();
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/status"));
    expect(screen.queryByRole("heading", { name: "欢迎来到养成系统" })).toBeNull();
  });

  it("recovers an accepted task after refresh and advances from business truth", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/onboarding/status") return { eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "IN_PROGRESS", currentStepId: "accept", startedAt: "2026-09-25T00:00:00.000Z" }, hints: [] };
      if (path.endsWith("/advance") && JSON.parse(String(init?.body)).stepId === "accept") return { flowId: "core-loop", flowVersion: 1, status: "IN_PROGRESS", currentStepId: "start", startedAt: "2026-09-25T00:00:00.000Z" };
      throw new Error(`unexpected request ${path}`);
    }) as unknown as Request;
    renderOnboarding(request, { tasks: [task], assignments: [task.id], children: <button data-guide-anchor="task.accept" data-guide-task-id={task.id}>接取</button> });
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/flows/core-loop/advance", expect.objectContaining({ body: JSON.stringify({ stepId: "accept" }) })));
  });

  it("celebrates only after a real timer session satisfies the final step", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/onboarding/status") return { eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "IN_PROGRESS", currentStepId: "start", startedAt: "2026-09-25T00:00:00.000Z" }, hints: [] };
      if (path.endsWith("/advance") && JSON.parse(String(init?.body)).stepId === "start") return { flowId: "core-loop", flowVersion: 1, status: "COMPLETED", currentStepId: null };
      throw new Error(`unexpected request ${path}`);
    }) as unknown as Request;
    renderOnboarding(request, { tasks: [task], assignments: [task.id], currentSession: session, children: <button data-guide-anchor="task.start" data-guide-task-id={task.id}>开始</button> });
    expect(await screen.findByRole("heading", { name: "新手教学完成 ✓" })).toBeTruthy();
  });

  it("renders the newcomer checklist from persisted business truth on first load", async () => {
    const request = vi.fn(async () => ({ eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "COMPLETED", currentStepId: null }, hints: [], checklist: { published: true, accepted: true, started: true, completed: true, note: true } })) as unknown as Request;
    renderOnboarding(request, { children: <main><div data-guide-anchor="onboarding.checklist" /></main> });
    expect(await screen.findByRole("heading", { name: "把工作台用起来" })).toBeTruthy();
    expect(screen.getByText("完成第一个任务").closest("li")?.className).toContain("is-done");
  });

  it("selects the mobile Quick Action anchor without changing domain components", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    document.body.innerHTML = '<button data-guide-anchor="quick-action.task.publish.entry">快捷操作</button><button data-guide-anchor="quick-action.task.publish">发布悬赏</button>';
    expect(resolveGuideAnchor({ desktop: "task.publish", mobile: "quick-action.task.publish" })?.textContent).toBe("发布悬赏");
  });

  it("starts the tutorial and advances publish only from the real target", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/onboarding/status") return { eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "NOT_STARTED", currentStepId: "publish" }, hints: [] };
      if (path.endsWith("/start")) return { flowId: "core-loop", flowVersion: 1, status: "IN_PROGRESS", currentStepId: "publish", startedAt: "2026-09-25T00:00:00.000Z" };
      if (path.endsWith("/advance") && JSON.parse(String(init?.body)).stepId === "publish") return { flowId: "core-loop", flowVersion: 1, status: "IN_PROGRESS", currentStepId: "create", startedAt: "2026-09-25T00:00:00.000Z" };
      throw new Error(`unexpected request ${path}`);
    }) as unknown as Request;
    renderOnboarding(request);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/status"));
    fireEvent.click(await screen.findByRole("button", { name: "开始新手教学" }));
    expect(await screen.findByRole("dialog", { name: "发布一个小悬赏" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/flows/core-loop/advance", expect.objectContaining({ body: JSON.stringify({ stepId: "publish" }) })));
  });

  it("advances create only after a real task appears", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/api/onboarding/status") return { eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "IN_PROGRESS", currentStepId: "create", startedAt: "2026-09-25T00:00:00.000Z" }, hints: [] };
      if (path.endsWith("/advance") && JSON.parse(String(init?.body)).stepId === "create") return { flowId: "core-loop", flowVersion: 1, status: "IN_PROGRESS", currentStepId: "accept", startedAt: "2026-09-25T00:00:00.000Z" };
      throw new Error(`unexpected request ${path}`);
    }) as unknown as Request;
    const view = renderOnboarding(request, { children: <label data-guide-anchor="task.title"><input aria-label="任务标题" /></label> });
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/status"));
    expect(request).not.toHaveBeenCalledWith("/api/onboarding/flows/core-loop/advance", expect.anything());
    view.rerender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/today"]}><OnboardingFeature request={request} userId={user.id} tasks={[task]} assignments={[]} currentSession={null} onError={vi.fn()}><label data-guide-anchor="task.title"><input aria-label="任务标题" /></label></OnboardingFeature></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/flows/core-loop/advance", expect.objectContaining({ body: JSON.stringify({ stepId: "create" }) })));
  });

  it("keeps unrelated product controls usable when a guide target is missing", async () => {
    const action = vi.fn();
    const request = vi.fn(async () => ({ eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "IN_PROGRESS", currentStepId: "publish" }, hints: [] })) as unknown as Request;
    renderOnboarding(request, { children: <button type="button" onClick={action}>正常操作</button> });
    fireEvent.click(await screen.findByRole("button", { name: "正常操作" }));
    expect(action).toHaveBeenCalledOnce();
  });

  it("shows timer-end and completion hints only after the corresponding truth changes", async () => {
    const request = vi.fn(async (path: string) => path === "/api/onboarding/status" ? { eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "COMPLETED", currentStepId: null }, hints: [] } : {}) as unknown as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/today"]}><OnboardingFeature request={request} userId={user.id} tasks={[task]} assignments={[task.id]} currentSession={session} onError={vi.fn()}><div /></OnboardingFeature></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/status"));
    view.rerender(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/today"]}><OnboardingFeature request={request} userId={user.id} tasks={[task]} assignments={[task.id]} currentSession={null} onError={vi.fn()}><div /></OnboardingFeature></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("计时结束 ≠ 任务完成")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭提示" }));
    await waitFor(() => expect(screen.queryByText("计时结束 ≠ 任务完成")).toBeNull());
    const completed = { ...task, status: 2, completedAt: "2026-09-25T01:20:00.000Z" };
    view.rerender(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/today"]}><OnboardingFeature request={request} userId={user.id} tasks={[completed]} assignments={[task.id]} currentSession={null} onError={vi.fn()}><div /></OnboardingFeature></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("任务完成 ✓")).toBeTruthy();
  });

  it.each([
    ["/finance", "真实资金与 Workbench Coins"],
    ["/growth", "成长投入"],
    ["/inspirations", "整理灵感"]
  ])("shows the contextual hint for %s", async (initialEntry, title) => {
    const request = vi.fn(async (path: string) => path === "/api/onboarding/status" ? { eligible: true, flow: { flowId: "core-loop", flowVersion: 1, status: "COMPLETED", currentStepId: null }, hints: [] } : {}) as unknown as Request;
    renderOnboarding(request, { initialEntry, children: <main>{initialEntry}</main> });
    expect(await screen.findByText(title)).toBeTruthy();
  });
});
