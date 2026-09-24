// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickNoteCaptureButton, QuickNoteDetailPage, QuickNotesPage } from ".";
import type { Request } from "../../app/api";
import type { QuickNote } from "./model";

afterEach(() => { cleanup(); localStorage.clear(); });

function wrapper(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>);
}

describe("Quick Notes draft ownership", () => {
  it("keeps the same operationId and content after a failed create", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => { throw new Error("离线"); });
    wrapper(<QuickNoteCaptureButton request={requestMock as Request} userId={7} selectedDate="2026-09-20" />);
    fireEvent.click(screen.getByRole("button", { name: "记一条" }));
    fireEvent.change(screen.getByLabelText("随手记正文"), { target: { value: "失败后仍要保留" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("草稿已保留"));
    expect(screen.getByLabelText<HTMLTextAreaElement>("随手记正文").value).toBe("失败后仍要保留");
    const firstBody = JSON.parse(String(requestMock.mock.calls[0][1]?.body));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    const secondBody = JSON.parse(String(requestMock.mock.calls[1][1]?.body));
    expect(secondBody.operationId).toBe(firstBody.operationId);
  });

  it("isolates capture drafts by user identity", () => {
    localStorage.setItem("personal-workbench:quick-note-draft:7", JSON.stringify({ operationId: "70000000-0000-4000-8000-000000000001", noteDate: "2026-09-20", title: "", content: "User A private draft", tag: "" }));
    wrapper(<QuickNoteCaptureButton request={vi.fn()} userId={8} selectedDate="2026-09-20" />);
    fireEvent.click(screen.getByRole("button", { name: "记一条" }));
    expect(screen.getByLabelText<HTMLTextAreaElement>("随手记正文").value).toBe("");
  });

  it("retains an edit draft when expectedVersion conflicts", async () => {
    const note = { id: 4, userId: 7, noteDate: "2026-09-20", recordTimezone: "Asia/Shanghai", title: null, content: "Server body", tag: null, archivedAt: null, deletedAt: null, version: 2, createdAt: "2026-09-20T08:00:00Z", updatedAt: "2026-09-20T08:00:00Z" };
    const requestMock = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init?.method) return note;
      throw new Error("quick note version conflict");
    });
    wrapper(<QuickNoteDetailPage request={requestMock as Request} userId={7} noteId={4} selectedDate="2026-09-20" />);
    await screen.findByDisplayValue("Server body");
    fireEvent.change(screen.getByLabelText("随手记正文"), { target: { value: "My unsaved edit" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("当前草稿仍保留"));
    expect(screen.getByLabelText<HTMLTextAreaElement>("随手记正文").value).toBe("My unsaved edit");
  });

  it("requires an explicit action summary when the source exceeds 2000 characters", async () => {
    const note = { id: 5, userId: 7, noteDate: "2026-09-20", recordTimezone: "Asia/Shanghai", title: "Long note", content: "x".repeat(2100), tag: null, archivedAt: null, deletedAt: null, version: 1, createdAt: "2026-09-20T08:00:00Z", updatedAt: "2026-09-20T08:00:00Z", linkedTask: null };
    const requestMock = vi.fn(async (_path: string, init?: RequestInit) => init?.method ? { id: 9 } : note);
    wrapper(<QuickNoteDetailPage request={requestMock as Request} userId={7} noteId={5} selectedDate="2026-09-20" recordTimezone="Asia/Shanghai" categories={[]} />);
    await screen.findByDisplayValue("Long note"); fireEvent.click(screen.getByRole("button", { name: "转为悬赏" }));
    expect(screen.getByText(/原文 2,100 字/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "发布悬赏" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("任务行动摘要"), { target: { value: "A confirmed summary" } });
    fireEvent.click(screen.getByRole("button", { name: "发布悬赏" }));
    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(requestMock.mock.calls[1][1]?.body)).description).toBe("A confirmed summary");
  });

  it("shows the immutable linked Task state instead of another convert action", async () => {
    const note = { id: 6, userId: 7, noteDate: "2026-09-20", recordTimezone: "Asia/Shanghai", title: "Linked", content: "original", tag: "private", archivedAt: null, deletedAt: null, version: 1, createdAt: "2026-09-20T08:00:00Z", updatedAt: "2026-09-20T08:00:00Z", linkedTask: { id: 12, title: "Confirmed", status: 2, deletedAt: null } };
    wrapper(<QuickNoteDetailPage request={vi.fn(async () => note) as Request} userId={7} noteId={6} selectedDate="2026-09-20" />);
    expect(await screen.findByText("已转为悬赏")).toBeTruthy(); expect(screen.getByText("Confirmed · 已完成")).toBeTruthy(); expect(screen.queryByRole("button", { name: "转为悬赏" })).toBeNull();
  });

  it("cancels a Journal quote without staging a draft or writing the server", async () => {
    const note = { id: 7, userId: 7, noteDate: "2026-09-20", recordTimezone: "Asia/Shanghai", title: "Quote", content: "private text", tag: null, archivedAt: null, deletedAt: null, version: 1, createdAt: "2026-09-20T08:00:00Z", updatedAt: "2026-09-20T08:00:00Z", linkedTask: null };
    const requestMock = vi.fn(async () => note);
    const onQuote = vi.fn(() => ({ status: "inserted" as const }));
    wrapper(<QuickNoteDetailPage request={requestMock as Request} userId={7} noteId={7} selectedDate="2026-09-20" onQuoteToJournal={onQuote} />);
    await screen.findByDisplayValue("private text");
    fireEvent.click(screen.getByRole("button", { name: "引用到日记" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onQuote).not.toHaveBeenCalled();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("keeps mobile note filters compact until the filter control is opened", async () => {
    wrapper(<QuickNotesPage request={vi.fn(async () => ({ items: [], nextCursor: null })) as Request} userId={7} selectedDate="2026-09-20" />);
    await screen.findByText("还没有随手记"); expect(screen.queryByLabelText("起始记录日期")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "筛选" })); expect(screen.getByLabelText("起始记录日期")).toBeTruthy(); expect(screen.getByText("开始日期")).toBeTruthy(); expect(screen.getByText("结束日期")).toBeTruthy();
  });

  it("associates and unlinks one Project without creating another workflow", async () => {
    const base = { id: 8, userId: 7, noteDate: "2026-09-21", recordTimezone: "Asia/Shanghai", title: "素材", content: "项目素材", tag: null, projectId: null, archivedAt: null, deletedAt: null, version: 1, createdAt: "2026-09-21T08:00:00Z", updatedAt: "2026-09-21T08:00:00Z", linkedTask: null, linkedProject: null };
    let current: QuickNote = base;
    const requestMock = vi.fn(async (_path: string, init?: RequestInit) => {
      if (!init?.method) return current;
      const body = JSON.parse(String(init.body));
      current = { ...current, version: current.version + 1, projectId: body.projectId, linkedProject: body.projectId ? { id: 9, name: "导游考试", status: 1, archivedAt: null } : null };
      return current;
    });
    wrapper(<QuickNoteDetailPage request={requestMock as Request} userId={7} noteId={8} selectedDate="2026-09-21" projects={[{ id: 9, name: "导游考试", archivedAt: null }]} />);
    const selector = await screen.findByLabelText<HTMLSelectElement>("关联项目");
    fireEvent.change(selector, { target: { value: "9" } }); fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(JSON.parse(String(requestMock.mock.calls.find(([, init]) => init?.method === "PUT")?.[1]?.body)).projectId).toBe(9));
    fireEvent.change(screen.getByLabelText("关联项目"), { target: { value: "" } }); fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(requestMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2));
    expect(JSON.parse(String(requestMock.mock.calls.filter(([, init]) => init?.method === "PUT")[1][1]?.body)).projectId).toBeNull();
  });

  it("keeps a historical archived Project visible in the selector", async () => {
    const note = { id: 9, userId: 7, noteDate: "2026-09-21", recordTimezone: "Asia/Shanghai", title: "历史素材", content: "仍保留关联", tag: null, projectId: 12, archivedAt: null, deletedAt: null, version: 2, createdAt: "2026-09-21T08:00:00Z", updatedAt: "2026-09-21T08:00:00Z", linkedTask: null, linkedProject: { id: 12, name: "旧项目", status: 2, archivedAt: "2026-09-21T09:00:00Z" } };
    wrapper(<QuickNoteDetailPage request={vi.fn(async () => note) as Request} userId={7} noteId={9} selectedDate="2026-09-21" projects={[]} />);
    const selector = await screen.findByLabelText<HTMLSelectElement>("关联项目");
    expect(selector.value).toBe("12");
    expect(screen.getByRole("option", { name: "旧项目（已归档）" })).toBeTruthy();
  });
});
