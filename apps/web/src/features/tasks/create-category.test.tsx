// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Request } from "../../app/api";
import { CategoryOptions } from "./task-ui";
import { ApplicationFeedback } from "../../app/feedback";
import { CreateTaskWorkflow } from "./create-task";
import type { Category } from "../categories";

afterEach(cleanup);
const existing: Category = { id: 7, name: "编程", dimensionKey: "career", color: "#3B82F6", enabled: 1, targetMinutes: 12345, totalMinutes: 120 };
const config = { dimensions: [
  { id: 1, dimensionKey: "career", name: "工作与事业", color: "#3B82F6", enabled: 1, sortOrder: 1, version: 1 },
  { id: 2, dimensionKey: "custom_123", name: "陶艺", color: "#EC4899", enabled: 1, sortOrder: 2, version: 1 },
  { id: 3, dimensionKey: "disabled", name: "停用维度", color: "#64748B", enabled: 0, sortOrder: 3, version: 1 }
], categories: [existing] };

function setup(overrides: { save?: (payload: Record<string, unknown>) => Promise<unknown>; readFails?: boolean } = {}) {
  let categories = [existing];
  let fails = overrides.readFails ?? false;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const user of [1, 2]) client.setQueryData(["growth-config", user], config);
  client.setQueryData(["today", 1, "2026-10-11"], { date: "2026-10-11", categories });
  client.setQueryData(["settings", 1], { profile: { id: 1 }, categories });
  client.setQueryData(["settings", 2], { categories: [{ ...existing, name: "另一用户" }] });
  const requestMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/api/growth/dimensions") return { ...config, categories };
    if (path === "/api/task-categories" && !init?.method) { if (fails) throw new Error("读取失败"); return categories; }
    if (path === "/api/task-categories" && init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      const saved = overrides.save ? await overrides.save(payload) : { ...payload, id: 21, enabled: 1, targetMinutes: 6000 };
      categories = [...categories, saved as Category]; return saved;
    }
    if (path === "/api/task-categories/7" && init?.method === "PUT") {
      const values = JSON.parse(String(init.body)); categories = categories.map((item) => item.id === 7 ? { ...item, ...values } : item); return { id: 7 };
    }
    if (path === "/api/tasks") return { id: 99 };
    throw new Error(path);
  });
  const changed = vi.fn();
  const tree = (userId = 1) => <QueryClientProvider client={client}><ApplicationFeedback>{(feedback) => <CreateTaskWorkflow key={userId} userId={userId} request={requestMock as Request} selectedDate="2026-10-11" timezone="Asia/Shanghai" categories={[existing]} projects={[{ id: 12, name: "长期项目", status: 0, archivedAt: null }]} tasks={[]} dailyTaskIds={[]} onError={feedback.notice} onChanged={changed}>{(open) => <button type="button" onClick={() => open()}>打开悬赏</button>}</CreateTaskWorkflow>}</ApplicationFeedback></QueryClientProvider>;
  const view = render(tree());
  fireEvent.click(screen.getByText("打开悬赏"));
  return { client, requestMock, changed, view, tree, fixRead: () => { fails = false; }, posts: () => requestMock.mock.calls.filter(([, init]) => init?.method === "POST"), tasks: () => requestMock.mock.calls.filter(([path]) => path === "/api/tasks") };
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
function populate() {
  for (const [label, value] of Object.entries({ "任务标题": "保留悬赏", "任务详情": "具体完成标准", "优先级": "3", "难度": "4", "预计分钟": "45", "初始进度": "20", "截止日期": "2026-10-20", "截止时间": "19:30", "所属项目": "12" })) change(label, value);
}
function assertDraft() {
  for (const [label, value] of Object.entries({ "任务标题": "保留悬赏", "任务详情": "具体完成标准", "优先级": "3", "难度": "4", "预计分钟": "45", "初始进度": "20", "截止日期": "2026-10-20", "截止时间": "19:30", "所属项目": "12" })) expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(value);
}
function openManager() { fireEvent.click(screen.getByRole("button", { name: "新建 / 管理分类" })); }
async function dismissNotice(title = "分类已创建") {
  const dialog = await screen.findByRole("dialog", { name: title });
  fireEvent.click(within(dialog).getByRole("button", { name: "收下" }));
  if (title === "分类已创建" || title === "分类已更新") await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "新建 / 管理分类" })));
}

describe("Bounty Category Quick Manager", () => {
  it.each([false, true])("creates custom-mapped Category, retains full draft, and publishes correct identity (claim=%s)", async (claim) => {
    const run = setup(); populate(); openManager();
    expect(document.querySelectorAll(".modal-backdrop")).toHaveLength(1);
    expect(document.querySelector(".task-create-modal")?.closest("[inert]")).toBeTruthy();
    expect(document.querySelector(".category-editor-form")?.closest(".task-create-modal")).toBeNull();
    expect(screen.getByRole("option", { name: "工作与事业" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "停用维度" })).toBeNull();
    change("新分类名称", "陶艺练习"); change("新分类成长维度", "custom_123"); change("分类 Hex 颜色", "#aabbcc");
    fireEvent.submit(document.querySelector(".category-editor-form")!);
    expect(run.tasks()).toHaveLength(0);
    await dismissNotice(); assertDraft();
    expect((screen.getByLabelText("事件类型") as HTMLSelectElement).value).toBe("21");
    expect(screen.getByRole("option", { name: /陶艺练习/ })).toBeTruthy();
    expect(JSON.parse(String(run.posts()[0][1]?.body))).toEqual({ name: "陶艺练习", color: "#AABBCC", dimensionKey: "custom_123" });
    expect(run.changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: claim ? "发布并接取" : /^发布$/ }));
    await waitFor(() => expect(run.tasks()).toHaveLength(1));
    expect(JSON.parse(String(run.tasks()[0][1]?.body))).toMatchObject({ categoryId: 21, projectId: 12, title: "保留悬赏", description: "具体完成标准", priority: 3, difficulty: 4, estimatedMinutes: 45, progressPercent: 20, ...(claim ? { acceptDate: "2026-10-11" } : {}) });
  });

  it("allows null mapping and fresh reopen after creation/cancel without stale identity", async () => {
    const run = setup(); populate(); openManager(); change("新分类名称", "不映射分类");
    fireEvent.click(screen.getByRole("button", { name: "保存分类" })); await dismissNotice();
    expect(JSON.parse(String(run.posts()[0][1]?.body)).dimensionKey).toBeNull();
    openManager(); expect((screen.getByLabelText("新分类名称") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "编辑分类 编程" })); change("分类名称", "丢弃的编辑");
    fireEvent.click(within(screen.getByRole("dialog", { name: "管理分类" })).getByRole("button", { name: "取消" })); assertDraft();
    openManager(); expect(screen.getByLabelText("新分类名称")).toBeTruthy();
  });

  it("preserves Category/Bounty drafts on failure and allows retry, without duplicate pending save", async () => {
    let resolve!: (value: unknown) => void;
    let attempt = 0;
    const run = setup({ save: async (payload) => { if (++attempt === 1) throw new Error("保存失败"); return new Promise((done) => { resolve = done; }).then(() => ({ ...payload, id: 21, enabled: 1, targetMinutes: 6000 })); } });
    populate(); openManager(); change("新分类名称", "保留分类");
    fireEvent.click(screen.getByRole("button", { name: "保存分类" }));
    await dismissNotice("分类没有创建");
    expect((screen.getByLabelText("新分类名称") as HTMLInputElement).value).toBe("保留分类"); assertDraft();
    fireEvent.click(screen.getByRole("button", { name: "保存分类" }));
    fireEvent.submit(document.querySelector(".category-editor-form")!);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByLabelText("新分类名称")).toBeTruthy(); expect(run.posts()).toHaveLength(2);
    await act(async () => resolve(undefined)); await dismissNotice(); assertDraft();
  });

  it("keeps confirmed identity and exposes read retry after POST success / refresh failure", async () => {
    const run = setup({ readFails: true }); populate(); openManager(); change("新分类名称", "实际已保存");
    fireEvent.click(screen.getByRole("button", { name: "保存分类" })); await dismissNotice();
    await screen.findByRole("button", { name: "刷新分类列表" });
    expect((screen.getByLabelText("事件类型") as HTMLSelectElement).value).toBe("21"); assertDraft();
    run.fixRead(); fireEvent.click(screen.getByRole("button", { name: "刷新分类列表" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "刷新分类列表" })).toBeNull());
    expect(run.posts()).toHaveLength(1);
  });

  it("edits metadata without changing hidden targets and updates only current-user snapshots", async () => {
    const run = setup(); change("事件类型", "7"); openManager();
    fireEvent.click(screen.getByRole("button", { name: "编辑分类 编程" })); change("分类名称", "工程");
    fireEvent.click(screen.getByRole("button", { name: "保存分类" })); await dismissNotice("分类已更新");
    const call = run.requestMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ name: "工程", color: "#3B82F6", dimensionKey: "career" });
    expect(run.client.getQueryData<{ categories: Category[] }>(["settings", 1])!.categories[0]).toMatchObject({ name: "工程", targetMinutes: 12345 });
    expect(run.client.getQueryData<{ categories: Category[] }>(["settings", 2])!.categories[0].name).toBe("另一用户");
    expect(run.client.getQueryData<{ categories: Category[] }>(["today", 1, "2026-10-11"])!.categories[0]).toMatchObject({ name: "工程", totalMinutes: 120 });
  });

  it("blocks invalid HEX, marks selected swatches, and preserves unknown mappings in options", () => {
    setup(); openManager(); change("新分类名称", "颜色分类"); change("分类 Hex 颜色", "broken");
    expect(screen.getByLabelText("分类 Hex 颜色").getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "保存分类" }) as HTMLButtonElement).disabled).toBe(true);
    const swatch = screen.getByRole("button", { name: "使用颜色 #8B5CF6" }); swatch.focus(); fireEvent.click(swatch);
    expect(swatch.getAttribute("aria-pressed")).toBe("true"); expect(swatch.getAttribute("type")).toBe("button");
    expect(document.activeElement).toBe(swatch); expect(screen.queryByText("请输入有效的 #RRGGBB 颜色")).toBeNull();
  });

  it("Escape closes only secondary panel; returns focus; traps Tab and preserves main reopen semantics", async () => {
    setup(); populate(); openManager();
    const panel = screen.getByRole("dialog", { name: "管理分类" });
    const last = within(panel).getAllByRole("button").at(-1)!;
    last.focus(); fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(within(panel).getAllByRole("button")[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "新建 / 管理分类" })));
    assertDraft(); expect(screen.queryByLabelText("新分类名称")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(screen.getByText("打开悬赏"));
    expect((screen.getByLabelText("任务标题") as HTMLInputElement).value).toBe("保留悬赏");
    expect((screen.getByLabelText("所属项目") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByLabelText("新分类名称")).toBeNull();
  });

  it("ignores late responses after authenticated user switch", async () => {
    let resolve!: (value: unknown) => void;
    const run = setup({ save: () => new Promise((done) => { resolve = done; }) });
    openManager(); change("新分类名称", "旧用户分类"); fireEvent.click(screen.getByRole("button", { name: "保存分类" }));
    run.view.rerender(run.tree(2));
    await act(async () => resolve({ id: 88, name: "旧用户分类", color: "#3B82F6", dimensionKey: null, enabled: 1, targetMinutes: 6000 }));
    expect(run.client.getQueryData<Category[]>(["task-categories", 2])?.some((row) => row.id === 88)).not.toBe(true);
    expect(screen.queryByText("分类已创建")).toBeNull();
    expect(run.client.getQueryData<Category[]>(["task-categories", 1])!.some((row) => row.id === 88)).toBe(false);
  });
  it("retains unknown string-key Categories in options without relabeling as null", () => {
    render(<select aria-label="Unknown mapping"><CategoryOptions categories={[{ ...existing, dimensionKey: "unknown_server_key" }]} /></select>);
    expect(screen.getByRole("option", { name: "编程" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "暂不映射" })).toBeNull();
  });

  it("selects an existing Category without creating another entity", () => {
    const run = setup(); populate(); openManager(); fireEvent.click(screen.getByRole("button", { name: "使用" }));
    expect((screen.getByLabelText("事件类型") as HTMLSelectElement).value).toBe("7"); assertDraft(); expect(run.posts()).toHaveLength(0);
  });

  it("reports unknown network outcome without assuming creation failed, and offers explicit read", async () => {
    const run = setup({ save: async () => { throw new ApiError("connection lost", 0, 0, null); } });
    populate(); openManager(); change("新分类名称", "未知结果"); fireEvent.click(screen.getByRole("button", { name: "保存分类" }));
    await dismissNotice("分类没有创建");
    expect(screen.getByText("保存结果尚未确认，请先刷新分类列表核实，再决定是否重试。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "刷新分类列表" }));
    await waitFor(() => expect(run.requestMock.mock.calls.some(([path, init]) => path === "/api/task-categories" && !init?.method)).toBe(true));
    expect(run.posts()).toHaveLength(1); assertDraft();
  });

});
