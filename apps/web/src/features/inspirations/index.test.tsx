// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { I18nProvider } from "../../app/i18n";
import { InspirationLibraryPage, InspirationWritingPanel, QuickNoteInspirationDialog } from ".";

afterEach(() => { cleanup(); localStorage.clear(); });

const tag = { id: 1, name: "Agent", normalizedName: "agent", usageCount: 1 };
const item = { id: 4, quickNoteId: 8, favorite: 0, pinned: 0, archivedAt: null, version: 1, createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z", note: { id: 8, title: "模型想法", content: "保留这条想法", noteDate: "2026-09-20", projectId: null, version: 1 }, tags: [tag] };
function wrapper(children: React.ReactNode) {
  return <I18nProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider></I18nProvider>;
}

describe("Writing inspiration library", () => {
  it("keeps user-authored tag names unchanged in English", async () => {
    localStorage.setItem("workbench:locale", "en");
    const userTag = { ...tag, name: "设置", normalizedName: "设置" };
    const request = vi.fn(async (path: string) => path.includes("inspiration-tags") ? { items: [userTag] } : { items: [{ ...item, tags: [userTag] }] }) as unknown as Request;
    render(wrapper(<InspirationLibraryPage request={request} userId={7} selectedDate="2026-09-20" onError={vi.fn()} />));
    expect(await screen.findByText("#设置")).toBeTruthy();
    expect(screen.queryByText("#Settings")).toBeNull();
  });

  it("lists, searches, and applies an AND tag filter", async () => {
    const requestMock = vi.fn(async (path: string) => path.includes("inspiration-tags") ? { items: [tag] } : { items: [item] });
    const request = requestMock as unknown as Request;
    render(wrapper(<InspirationLibraryPage request={request} userId={7} selectedDate="2026-09-20" onError={vi.fn()} />));
    expect(await screen.findByRole("heading", { name: "模型想法" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("搜索灵感"), { target: { value: "想法" } });
    fireEvent.change(screen.getByLabelText("灵感标签"), { target: { value: "Agent" } });
    fireEvent.click(await screen.findByRole("button", { name: "#Agent" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("tags=Agent")));
    expect(screen.getByText("查看原文")).toBeTruthy();
  });

  it("uses a filled heart for a favorited inspiration", async () => {
    const request = vi.fn(async (path: string) => path.includes("inspiration-tags") ? { items: [tag] } : { items: [{ ...item, favorite: 1 }] }) as unknown as Request;
    render(wrapper(<InspirationLibraryPage request={request} userId={7} selectedDate="2026-09-20" onError={vi.fn()} />));
    const favorite = await screen.findByRole("button", { name: "取消收藏" });
    expect(favorite.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
  });

  it("uses the archive command route without falling back to PUT", async () => {
    const request = vi.fn(async (path: string) => path.includes("inspiration-tags") ? { items: [tag] } : { items: [{ ...item, archivedAt: null }] }) as unknown as Request;
    render(wrapper(<InspirationLibraryPage request={request} userId={7} selectedDate="2026-09-20" onError={vi.fn()} />));
    const card = (await screen.findByRole("heading", { name: "模型想法" })).closest("article");
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "归档" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/writing/inspirations/4/archive", expect.objectContaining({ method: "POST" })));
  });

  it("creates a direct inspiration while keeping tag creation explicit", async () => {
    const requestMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes("inspiration-tags") && init?.method === "POST") return { ...tag, id: 2, name: "研究", normalizedName: "研究" };
      if (path.includes("inspiration-tags")) return { items: [] };
      if (path === "/api/writing/inspirations" && init?.method === "POST") return item;
      return { items: [] };
    });
    const request = requestMock as unknown as Request;
    render(wrapper(<InspirationLibraryPage request={request} userId={7} selectedDate="2026-09-20" projects={[{ id: 3, name: "项目", archivedAt: null }]} onError={vi.fn()} />));
    fireEvent.click(screen.getByRole("button", { name: /新建灵感/ }));
    fireEvent.change(screen.getByLabelText("灵感标题"), { target: { value: "新标题" } });
    fireEvent.change(screen.getByLabelText("灵感正文"), { target: { value: "新正文" } });
    const tagInput = screen.getAllByLabelText("灵感标签").at(-1)!;
    fireEvent.change(tagInput, { target: { value: "研究" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/writing/inspiration-tags", expect.objectContaining({ method: "POST" })));
    fireEvent.click(screen.getByRole("button", { name: "保存灵感" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/writing/inspirations", expect.objectContaining({ method: "POST" })));
    expect(JSON.parse((requestMock.mock.calls.find(([path, init]) => path === "/api/writing/inspirations" && (init as RequestInit)?.method === "POST")?.[1] as RequestInit).body as string)).toMatchObject({ content: "新正文", tagNames: ["研究"] });
  });

  it("accepts multiple explicitly prefixed tags in one entry", async () => {
    const requestMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.includes("inspiration-tags") && init?.method === "POST") {
        const name = JSON.parse(String(init.body)).name;
        return { id: name === "UI" ? 2 : 3, name, normalizedName: name.toLowerCase() };
      }
      if (path.includes("inspiration-tags")) return { items: [] };
      return { items: [] };
    });
    const request = requestMock as unknown as Request;
    render(wrapper(<InspirationLibraryPage request={request} userId={7} selectedDate="2026-09-20" onError={vi.fn()} />));
    fireEvent.click(screen.getByRole("button", { name: /新建灵感/ }));
    const input = screen.getAllByLabelText("灵感标签").at(-1)!;
    fireEvent.change(input, { target: { value: "#编程 #UI #像素风" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(requestMock.mock.calls.filter(([path, init]) => path.includes("inspiration-tags") && (init as RequestInit)?.method === "POST")).toHaveLength(3));
  });

  it("adds a QuickNote once and exposes the shared tag picker", async () => {
    const request = vi.fn(async (path: string) => path.includes("inspiration-tags") ? { items: [tag] } : { ...item, id: 9 }) as Request;
    const onDone = vi.fn();
    render(wrapper(<QuickNoteInspirationDialog request={request} userId={7} noteId={8} onClose={vi.fn()} onDone={onDone} />));
    fireEvent.click(screen.getByRole("button", { name: /确认加入/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(9));
    expect(request).toHaveBeenCalledWith("/api/quick-notes/8/inspiration", expect.objectContaining({ method: "POST" }));
  });

  it("inserts the selected QuickNote content into the Writing editor bridge", async () => {
    const request = vi.fn(async () => ({ items: [item] })) as Request;
    const onInsert = vi.fn();
    render(wrapper(<InspirationWritingPanel request={request} userId={7} onInsert={onInsert} />));
    fireEvent.click(screen.getByRole("button", { name: /灵感库/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "插入正文" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "插入正文" }));
    expect(onInsert).toHaveBeenCalledWith("保留这条想法");
  });
});
