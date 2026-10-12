// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Request } from "../../app/api";
import { ApplicationFeedback } from "../../app/feedback";
import type { ProjectSummary } from "../projects";
import { CreateTaskWorkflow } from "./create-task";

afterEach(cleanup);
const category = { id: 7, name: "编程", dimensionKey: null, color: "#3B82F6", enabled: 1, targetMinutes: 6000, totalMinutes: 0 };
const project: ProjectSummary = { id: 12, name: "项目 A", description: "说明保留", status: 0, priority: 3, startDate: "2026-10-01", targetDate: "2026-12-31", notes: "隐藏笔记保留", version: 4, archivedAt: null, createdAt: "2026-10-01", updatedAt: "2026-10-01", taskCount: 2, completedTaskCount: 1, progressPercent: 50, actualSeconds: 120, nextTask: null };
const other = { ...project, id: 13, name: "项目 B" };
const created = { ...project, id: 21, name: "新项目", version: 1 };
const dimension = { id: 5, dimensionKey: "custom_bounty", name: "组合成长", color: "#8B5CF6", enabled: 1, sortOrder: 5, version: 1 };

function setup(options: { post?: () => Promise<unknown>; put?: () => Promise<unknown>; readFailure?: boolean; taskFailure?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  let rows = [project, other, { ...project, id: 14, name: "已完成项目", status: 3 }, { ...project, id: 15, name: "已归档项目", archivedAt: "2026-10-01" }];
  let categories = [category];
  let failRead = options.readFailure ?? false, conflictRefreshed = false, failTask = options.taskFailure ?? false;
  const request = vi.fn(async (path: string, init?: RequestInit): Promise<unknown> => {
    if (path === "/api/projects?view=active") return rows;
    if (path === "/api/projects" && init?.method === "POST") { const result = options.post ? await options.post() : { id: 21, version: 1, status: 0 }; rows = [...rows, created]; return result; }
    if (path.startsWith("/api/projects/") && init?.method === "PUT") { try { return options.put ? await options.put() : { id: Number(path.split("/").at(-1)), version: 5 }; } catch (error) { conflictRefreshed = true; throw error; } }
    if (path.startsWith("/api/projects/")) {
      if (failRead) throw new Error("读取失败");
      const id = Number(path.split("/").at(-1));
      return { project: { ...(rows.find((row) => row.id === id) ?? created), ...(conflictRefreshed ? { version: 5, notes: "服务器新笔记" } : {}) }, tasks: [], plannedSchedules: [], actualEntries: [] };
    }
    if (path === "/api/task-categories" && init?.method === "POST") { const saved = { ...category, ...JSON.parse(String(init.body)), id: 22 }; categories = [...categories, saved]; return saved; }
    if (path === "/api/task-categories") return categories;
    if (path === "/api/growth/dimensions") return { dimensions: [dimension], categories };
    if (path === "/api/tasks") { if (failTask) throw new Error("发布失败"); return { id: 99 }; }
    throw new Error(path);
  });
  client.setQueryData(["projects", 1, "active"], rows);
  client.setQueryData(["projects", 2, "active"], [{ ...project, name: "另一用户" }]);
  const changed = vi.fn();
  const tree = (userId = 1) => <QueryClientProvider client={client}><ApplicationFeedback>{(feedback) => <CreateTaskWorkflow key={userId} userId={userId} request={request as Request} selectedDate="2026-10-12" timezone="Asia/Shanghai" categories={[category]} projects={[project, other]} tasks={[]} dailyTaskIds={[]} onError={feedback.notice} onChanged={changed}>{(open) => <><button type="button" onClick={() => open()}>打开悬赏</button><button type="button" onClick={() => open({ projectId: 12 })}>所属悬赏</button></>}</CreateTaskWorkflow>}</ApplicationFeedback></QueryClientProvider>;
  const view = render(tree()); fireEvent.click(screen.getByText("打开悬赏"));
  return { request, client, view, tree, changed, posts: () => request.mock.calls.filter(([path, init]) => path === "/api/projects" && init?.method === "POST"), tasks: () => request.mock.calls.filter(([path]) => path === "/api/tasks"), fixRead: () => { failRead = false; }, fixTask: () => { failTask = false; }, changeEligibility: () => { rows = rows.map((row) => row.id === 12 ? { ...row, status: 3 } : row); client.setQueryData(["projects", 1, "active"], rows); } };
}
const field = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const parentDraft = { "任务标题": "完整悬赏", "任务详情": "完成标准", "事件类型": "7", "所属项目": "12", "优先级": "3", "难度": "4", "预计分钟": "45", "初始进度": "20", "截止日期": "2026-10-20", "截止时间": "19:30" };
function populate() { Object.entries(parentDraft).forEach(([label, value]) => field(label, value)); }
function assertDraft(skipProject = false, skipCategory = false) { Object.entries(parentDraft).filter(([label]) => (!skipProject || label !== "所属项目") && (!skipCategory || label !== "事件类型")).forEach(([label, value]) => expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(value)); }
function openManager() { fireEvent.click(screen.getByRole("button", { name: "新建 / 管理项目" })); }
async function dismiss(title: string) { const popup = await screen.findByRole("dialog", { name: title }); fireEvent.click(within(popup).getByRole("button", { name: "收下" })); }

describe("Bounty Project Quick Manager", () => {
  it.each([false, true])("creates mapped Category then canonical Project in the same intact draft (claim=%s)", async (claim) => {
    const run = setup(); populate();
    fireEvent.click(screen.getByRole("button", { name: "新建 / 管理分类" }));
    expect(document.querySelectorAll(".modal-backdrop")).toHaveLength(1);
    expect(document.querySelector(".task-create-modal")?.closest("[inert]")).toBeTruthy();
    field("新分类名称", "新组合分类");
    await screen.findByRole("option", { name: "组合成长" });
    field("新分类成长维度", dimension.dimensionKey);
    fireEvent.submit(document.querySelector(".category-editor-form")!);
    expect(run.tasks()).toHaveLength(0);
    await dismiss("分类已创建");
    assertDraft(true, true);
    expect((screen.getByLabelText("事件类型") as HTMLSelectElement).value).toBe("22");
    openManager();
    expect(document.querySelectorAll(".modal-backdrop")).toHaveLength(1);
    expect(document.querySelector(".task-create-modal")?.closest("[inert]")).toBeTruthy();
    expect(document.querySelector(".project-editor")?.closest(".task-create-modal")).toBeNull();
    field("项目名称", "新项目"); field("说明", "新说明");
    fireEvent.submit(document.querySelector(".project-editor")!);
    expect(run.tasks()).toHaveLength(0);
    await dismiss("项目已创建");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "新建 / 管理项目" })));
    assertDraft(true, true);
    expect((screen.getByLabelText("事件类型") as HTMLSelectElement).value).toBe("22");
    expect((screen.getByLabelText("所属项目") as HTMLSelectElement).value).toBe("21");
    fireEvent.click(screen.getByRole("button", { name: claim ? "发布并接取" : /^发布$/ }));
    await waitFor(() => expect(run.tasks()).toHaveLength(1));
    const payload = JSON.parse(String(run.tasks()[0][1]?.body));
    expect(payload).toMatchObject({ projectId: 21, categoryId: 22, title: "完整悬赏", description: "完成标准", priority: 3, difficulty: 4, estimatedMinutes: 45, progressPercent: 20, dueAt: "2026-10-20T19:30", recordTimezone: "Asia/Shanghai" });
    expect(payload.acceptDate).toBe(claim ? "2026-10-12" : undefined);
    const categoryPosts = run.request.mock.calls.filter(([path, init]) => path === "/api/task-categories" && init?.method === "POST");
    expect(categoryPosts).toHaveLength(1);
    expect(JSON.parse(String(categoryPosts[0][1]?.body))).toMatchObject({ name: "新组合分类", dimensionKey: dimension.dimensionKey });
    await waitFor(() => expect(run.client.getQueryData<{ categories: { id: number; dimensionKey: string | null }[] }>(["growth-config", 1])?.categories.find((row) => row.id === 22)?.dimensionKey).toBe(dimension.dimensionKey));
    expect(run.posts()).toHaveLength(1);
    expect(run.client.getQueryData<ProjectSummary[]>(["projects", 2, "active"])![0].name).toBe("另一用户");
  });

  it("preserves both drafts on POST failure and retries only deliberately", async () => {
    let attempt = 0;
    const run = setup({ post: async () => { if (++attempt === 1) throw new Error("写入失败"); return { id: 21, version: 1 }; } });
    populate(); openManager(); field("项目名称", "新项目"); field("项目笔记", "未保存笔记");
    fireEvent.click(screen.getByRole("button", { name: "保存" })); await dismiss("项目没有保存");
    expect((screen.getByLabelText("项目笔记") as HTMLTextAreaElement).value).toBe("未保存笔记");
    fireEvent.click(screen.getByRole("button", { name: "保存" })); await dismiss("项目已创建"); assertDraft(true); expect(run.posts()).toHaveLength(2);
  });

  it("retains POST identity on read failure without claiming selection or allowing another POST", async () => {
    const run = setup({ readFailure: true }); populate(); openManager(); field("项目名称", "新项目");
    fireEvent.click(screen.getByRole("button", { name: "保存" })); await dismiss("项目已保存");
    expect(screen.getByText("Project #21")).toBeTruthy(); expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("所属项目") as HTMLSelectElement).value).toBe("12");
    run.fixRead(); fireEvent.click(screen.getByRole("button", { name: "重试读取项目" })); await dismiss("项目已创建");
    assertDraft(true); expect((screen.getByLabelText("所属项目") as HTMLSelectElement).value).toBe("21"); expect(run.posts()).toHaveLength(1);
  });

  it("edits only changed metadata, keeps hidden fields, and never selects another edited Project", async () => {
    const run = setup(); populate(); openManager(); fireEvent.click(screen.getByRole("button", { name: "编辑项目 项目 B" }));
    expect((screen.getByLabelText("项目笔记") as HTMLTextAreaElement).value).toBe("隐藏笔记保留");
    field("项目名称", "改名 B"); fireEvent.click(screen.getByRole("button", { name: "保存" })); await dismiss("项目已更新");
    expect(JSON.parse(String(run.request.mock.calls.find(([, init]) => init?.method === "PUT")![1]?.body))).toEqual({ expectedVersion: 4, name: "改名 B" });
    assertDraft();
  });

  it("returns an unchanged edit to the parent without a mutation or stuck pending gate", async () => {
    const run = setup(); populate(); openManager(); fireEvent.click(screen.getByRole("button", { name: "编辑项目 项目 B" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "新建 / 管理项目" })));
    assertDraft(); expect(run.request.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    openManager(); field("项目名称", "新项目"); fireEvent.click(screen.getByRole("button", { name: "保存" })); await dismiss("项目已创建");
  });

  it("requires explicit conflict reconciliation, preserves draft and retries with latest expectedVersion", async () => {
    let attempt = 0;
    const run = setup({ put: async () => { if (++attempt === 1) throw new ApiError("conflict", 409, 409, null); return { id: 12, version: 6 }; } });
    populate(); openManager(); fireEvent.click(screen.getByRole("button", { name: "编辑项目 项目 A" })); field("项目名称", "我的修改");
    fireEvent.click(screen.getByRole("button", { name: "保存" })); await dismiss("项目没有保存");
    expect((screen.getByLabelText("项目名称") as HTMLInputElement).value).toBe("我的修改");
    expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(true);
    run.client.setQueryData(["projects", 1, "active"], [project]);
    fireEvent.click(screen.getByRole("button", { name: "读取最新项目版本" }));
    await screen.findByText("已载入最新版本，请核对草稿后再次保存。");
    expect((screen.getByLabelText("项目名称") as HTMLInputElement).value).toBe("我的修改");
    fireEvent.click(screen.getByRole("button", { name: "保存" })); await dismiss("项目已更新");
    expect(run.request.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init?.body)).expectedVersion)).toEqual([4, 5]);
  });

  it("excludes DONE/archived Projects and rejects an invalidated parent selection recoverably", async () => {
    const run = setup(); populate();
    expect(screen.queryByRole("option", { name: "已完成项目" })).toBeNull(); expect(screen.queryByRole("option", { name: "已归档项目" })).toBeNull();
    await act(async () => run.changeEligibility());
    expect(await screen.findByRole("option", { name: "所选项目不可用，请重新选择或刷新项目列表。" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^发布$/ })); await dismiss("需要看一下"); expect(run.tasks()).toHaveLength(0);
    field("所属项目", "13"); fireEvent.click(screen.getByRole("button", { name: /^发布$/ })); await waitFor(() => expect(run.tasks()).toHaveLength(1));
  });

  it("cancels only secondary draft, traps Tab and returns focus, then opens a fresh identity", async () => {
    const run = setup(); populate(); openManager(); field("项目名称", "丢弃草稿");
    const panel = screen.getByRole("dialog", { name: "管理项目" }); const buttons = within(panel).getAllByRole("button");
    buttons.at(-1)!.focus(); fireEvent.keyDown(document, { key: "Tab" }); expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(buttons.at(-1));
    fireEvent.keyDown(document, { key: "Escape" }); await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "新建 / 管理项目" }))); assertDraft();
    openManager(); expect((screen.getByLabelText("项目名称") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "编辑项目 项目 B" })); expect((screen.getByLabelText("项目名称") as HTMLInputElement).value).toBe("项目 B");
    fireEvent.click(screen.getByRole("button", { name: "取消" })); assertDraft(); expect(run.posts()).toHaveLength(0);
  });

  it("guards pending submissions/close and ignores an old authenticated user's late response", async () => {
    let resolve!: (result: unknown) => void;
    const run = setup({ post: () => new Promise((done) => { resolve = done; }) }); populate(); openManager(); field("项目名称", "旧用户项目");
    fireEvent.submit(document.querySelector(".project-editor")!); fireEvent.submit(document.querySelector(".project-editor")!); fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByLabelText("项目名称")).toBeTruthy(); expect(run.posts()).toHaveLength(1);
    run.view.rerender(run.tree(2)); await act(async () => resolve({ id: 21, version: 1 }));
    expect(run.client.getQueryData(["project", 2, 21])).toBeUndefined(); expect(screen.queryByText("项目已创建")).toBeNull(); expect(screen.queryByDisplayValue("旧用户项目")).toBeNull();
  });

  it("retains a saved Project and parent draft when Task publication fails, then retries only Task", async () => {
    const run = setup({ taskFailure: true }); populate(); openManager(); field("项目名称", "新项目"); fireEvent.click(screen.getByRole("button", { name: "保存" })); await dismiss("项目已创建");
    fireEvent.click(screen.getByRole("button", { name: /^发布$/ })); await dismiss("操作没有成功"); assertDraft(true);
    expect((screen.getByLabelText("所属项目") as HTMLSelectElement).value).toBe("21"); run.fixTask();
    fireEvent.click(screen.getByRole("button", { name: /^发布$/ })); await waitFor(() => expect(run.tasks()).toHaveLength(2)); expect(run.posts()).toHaveLength(1);
  });

  it("ignores a late detail read after the editor's owner unmounts", async () => {
    const run = setup(); const original = run.request.getMockImplementation()!;
    let resolve!: (detail: unknown) => void;
    run.request.mockImplementation((path, init) => path === "/api/projects/21" ? new Promise((done) => { resolve = done; }) : original(path, init));
    openManager(); field("项目名称", "新项目"); fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(resolve).toBeTruthy()); run.view.unmount();
    await act(async () => resolve({ project: created, tasks: [], plannedSchedules: [], actualEntries: [] }));
    expect(run.client.getQueryData(["project", 1, 21])).toBeUndefined();
  });

  it("can explicitly select an eligible existing Project without creating one", () => {
    const run = setup(); populate(); openManager();
    const row = screen.getByRole("button", { name: "编辑项目 项目 B" }).closest(".project-quick-row")!;
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "使用" }));
    assertDraft(true); expect((screen.getByLabelText("所属项目") as HTMLSelectElement).value).toBe("13"); expect(run.posts()).toHaveLength(0);
  });

  it("keeps Project-detail preselection and Category manager intact", async () => {
    setup(); fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(screen.getByText("所属悬赏"));
    expect((screen.getByLabelText("所属项目") as HTMLSelectElement).value).toBe("12");
    fireEvent.click(screen.getByRole("button", { name: "新建 / 管理分类" })); expect(screen.getByRole("dialog", { name: "管理分类" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" }); expect((screen.getByLabelText("所属项目") as HTMLSelectElement).value).toBe("12");
  });
});
