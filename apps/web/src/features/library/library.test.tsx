// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { ApplicationFeedback } from "../../app/feedback";
import { LibraryDetailPage, LibraryPage } from ".";
import type { LibraryItem } from "./item";
const initial: LibraryItem = { id: 42, type: "MOVIE", title: "帕丁顿熊", originalTitle: "Paddington", creator: "保罗·金", coverRef: null, status: "WANT", rating: null, startedOn: null, finishedOn: null, externalRef: null, shortNote: "自己的观影记录", description: "一只熊在伦敦的故事。", releaseYear: 2014, version: 1 };
const source = { id: 1, provider: "TMDB", entityType: "MOVIE", stableSourceId: "116149", canonicalUrl: "https://www.themoviedb.org/movie/116149", attribution: "TMDB", language: "zh-CN", importedAt: "2026-11-02" };
function setup({ entry = "/library/42", item = initial, fail = false } = {}) {
  let current = { ...item }, sources = [source];
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/quick-notes")) return { items: [] };
    if (path === "/api/library/items/42/sources/1") { sources = []; return {}; }
    if (init?.method === "PUT") {
      if (fail) throw Error("保存失败测试");
      const { expectedVersion, ...values } = JSON.parse(String(init.body));
      expect(expectedVersion).toBe(current.version);
      current = { ...current, ...values, version: current.version + 1 }; return current;
    }
    if (path.startsWith("/api/library/items?")) return { items: [current] };
    if (path === "/api/library/items/42") return { item: current, relations: [], sources };
    throw Error(path);
  }) as unknown as Request;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><ApplicationFeedback>{feedback => <LibraryDetailPage request={request} userId={7} itemId={42} businessToday="2026-11-03" onConfirm={feedback.confirm} onError={feedback.notice}/>}</ApplicationFeedback></MemoryRouter></QueryClientProvider>);
  return { request, current: () => current };
}
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("Library detail and editing", () => {
  it("reads by default, edits a single year/description, saves and returns to detail", async () => {
    const { current } = setup();
    await screen.findByText("一只熊在伦敦的故事。");
    expect(screen.queryByRole("textbox", { name: "作品名称" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "编辑作品" }));
    const editor = await screen.findByRole("form", { name: "编辑作品" });
    expect(editor.querySelectorAll('[name="releaseYear"]')).toHaveLength(1);
    expect(editor.querySelectorAll('[name="description"]')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("作品简介"), { target: { value: "编辑后的简介" } });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));
    await screen.findByText("编辑后的简介");
    expect(screen.queryByRole("form", { name: "编辑作品" })).toBeNull();
    expect(current().releaseYear).toBe(2014);
    expect(current().shortNote).toBe(initial.shortNote);
  });
  it("quick edits status/rating, defaults business date once and preserves that date", async () => {
    const { current } = setup(); await screen.findByText("一只熊在伦敦的故事。");
    fireEvent.change(screen.getByLabelText("作品状态"), { target: { value: "FINISHED" } });
    await screen.findByText("2026-11-03");
    fireEvent.change(screen.getByLabelText("评分"), { target: { value: "4" } });
    await waitFor(() => expect(current().rating).toBe(4));
    await waitFor(() => expect((screen.getByLabelText("评分") as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("作品状态"), { target: { value: "IN_PROGRESS" } });
    await waitFor(() => expect(current().status).toBe("IN_PROGRESS"));
    expect(current().finishedOn).toBe("2026-11-03");
  });
  it("preserves an existing completion date", async () => {
    const { current } = setup({ item: { ...initial, finishedOn: "2026-10-01" } });
    await screen.findByText("2026-10-01");
    fireEvent.change(screen.getByLabelText("作品状态"), { target: { value: "FINISHED" } });
    await waitFor(() => expect(current().status).toBe("FINISHED"));
    expect(current().finishedOn).toBe("2026-10-01");
  });
  it("defaults completion in the editor and returns to detail from a direct edit URL", async () => {
    const { current } = setup({ entry: "/library/42?edit=1" });
    await screen.findByRole("form", { name: "编辑作品" });
    fireEvent.change(screen.getByLabelText("作品状态"), { target: { value: "FINISHED" } });
    expect((screen.getByLabelText("完成日期") as HTMLInputElement).value).toBe("2026-11-03");
    fireEvent.change(screen.getByLabelText("完成日期"), { target: { value: "2026-10-30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));
    await screen.findByText("2026-10-30");
    expect(screen.queryByRole("form", { name: "编辑作品" })).toBeNull();
    expect(current().finishedOn).toBe("2026-10-30");
  });
  it("keeps a failed edit draft and opens the shared notice dialog", async () => {
    setup({ entry: "/library/42?edit=1", fail: true });
    const title = await screen.findByLabelText("作品名称");
    fireEvent.change(title, { target: { value: "尚未保存的修改" } });
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect((title as HTMLInputElement).value).toBe("尚未保存的修改");
  });
  it("confirms unlink and draft discard through ApplicationFeedback, never browser dialogs", async () => {
    const confirm = vi.spyOn(window, "confirm").mockImplementation(() => { throw Error("native dialog"); });
    const { request } = setup(); await screen.findByText("一只熊在伦敦的故事。");
    fireEvent.click(screen.getByRole("button", { name: "解除来源关联" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "取消" }));
    expect((request as any).mock.calls.some(([path]: string[]) => path.includes("/sources/"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "解除来源关联" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "解除关联" }));
    await screen.findByRole("button", { name: "关联来源资料" });
    fireEvent.click(screen.getByRole("button", { name: "关联来源资料" }));
    fireEvent.change(screen.getByLabelText("搜索词或来源网址"), { target: { value: "保留的草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "丢弃草稿 / 重新开始" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "取消" }));
    expect((screen.getByLabelText("搜索词或来源网址") as HTMLInputElement).value).toBe("保留的草稿");
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("Library display cards", () => {
  it("shows the recorded finished date and distinguishes a missing historical date", async () => {
    const items = [
      { ...initial, id: 1, title: "有完成日期", status: "FINISHED", finishedOn: "2026-10-25" },
      { ...initial, id: 2, title: "历史完成日期缺失", status: "FINISHED" },
      { ...initial, id: 3, title: "还想看" },
    ];
    const request = vi.fn(async () => ({ items })) as unknown as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><LibraryPage request={request} userId={7} businessToday="2026-11-03" onConfirm={vi.fn()} onError={vi.fn()}/></MemoryRouter></QueryClientProvider>);
    const finished = await screen.findByRole("link", { name: /有完成日期/ });
    expect(finished.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-25");
    expect(within(finished).getByText("2026-10-25")).toBeTruthy();
    expect(within(screen.getByRole("link", { name: /历史完成日期缺失/ })).getByText("完成日期未填写")).toBeTruthy();
    expect(screen.getByRole("link", { name: /还想看/ }).querySelector("time")).toBeNull();
  });
});
