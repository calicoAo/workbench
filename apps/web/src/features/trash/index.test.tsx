// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { TrashPage } from ".";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const item = { type: "quick_note" as const, id: 4, title: "旅行路线", excerpt: "准备导游考试的路线素材", noteDate: "2026-09-21", tag: "素材", projectId: 9, version: 2, deletedAt: "2026-09-21T08:00:00Z", restoreDeepLink: "/notes/4?date=2026-09-21" };
function mount(request: Request) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><MemoryRouter><TrashPage request={request} userId={7} /></MemoryRouter></QueryClientProvider>); }

describe("Trash", () => {
  it("renders only supported type filters and readable deleted summaries", async () => {
    const request = vi.fn(async () => ({ items: [item], nextCursor: null, supportedTypes: ["quick_note"] })) as Request;
    mount(request);
    expect(await screen.findByText("旅行路线")).toBeTruthy();
    expect(screen.getByText("准备导游考试的路线素材")).toBeTruthy();
    expect(screen.getByRole("button", { name: "随手记" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "任务" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "随手记" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("type=quick_note")));
  });

  it("shows the empty state without permanent-delete actions", async () => {
    mount(vi.fn(async () => ({ items: [], nextCursor: null, supportedTypes: ["quick_note"] })) as Request);
    expect(await screen.findByText("回收站是空的")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /永久/ })).toBeNull();
  });

  it("restores through Trash and refreshes the list", async () => {
    let restored = false;
    const request = vi.fn(async (_path: string, init?: RequestInit) => { if (init?.method === "POST") { restored = true; return { id: 4, version: 3 }; } return { items: restored ? [] : [item], nextCursor: null, supportedTypes: ["quick_note"] }; }) as Request;
    mount(request);
    fireEvent.click(await screen.findByRole("button", { name: "恢复" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/trash/quick_note/4/restore", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.getByText("回收站是空的")).toBeTruthy());
  });

  it("keeps one operationId across a failed restore retry", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => { if (init?.method === "POST") throw new Error("暂时不可用"); return { items: [item], nextCursor: null, supportedTypes: ["quick_note"] }; });
    mount(request as Request);
    fireEvent.click(await screen.findByRole("button", { name: "恢复" }));
    expect((await screen.findByRole("alert")).textContent).toContain("暂时不可用");
    fireEvent.click(screen.getByRole("button", { name: "恢复" }));
    await waitFor(() => expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2));
    const posts = request.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(posts[0][1]?.body)).operationId).toBe(JSON.parse(String(posts[1][1]?.body)).operationId);
  });
});
