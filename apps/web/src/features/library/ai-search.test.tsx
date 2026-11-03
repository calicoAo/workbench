// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { MemoryRouter } from "react-router";
import { LibraryAiSearch } from "./ai-search";

beforeEach(() => localStorage.clear()); afterEach(cleanup);
const result = { operationId: "op", query: "The Hobbit", mediaType: "BOOK" as const, status: "SUCCEEDED", searchCalls: 1, fetchCalls: 1, result: { candidates: [{ title: "The Hobbit", originalTitle: null, creator: "J. R. R. Tolkien", releaseYear: 1937, description: "A fantasy novel.", sources: [{ url: "https://openlibrary.org/works/OL123W", title: "Open Library" }] }] } };
describe("Library AI search recovery", () => {
  it("shows cited candidates and selects a server candidate identity for direct preview", async () => {
    const onUse = vi.fn(), request = vi.fn(async (_path: string, init?: RequestInit) => ({...result,operationId:init?.body ? JSON.parse(String(init.body)).operationId : result.operationId})) as unknown as Request;
    render(<MemoryRouter><LibraryAiSearch request={request} userId={5} mediaType="BOOK" query="The Hobbit" onUse={onUse}/></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "AI 搜索" }));
    expect(await screen.findByText("A fantasy novel.")).toBeTruthy();
    fireEvent.click(screen.getByText("预览此作品资料"));
    expect(onUse).toHaveBeenCalledWith(expect.any(String),0);
    expect(localStorage.getItem("wb.library-ai-search.v1:5")).toContain("OL123W");
  });
  it("recovers a pending operation from its status endpoint after remount", async () => {
    localStorage.setItem("wb.library-ai-search.v1:5", JSON.stringify({ operationId: "op", query: "The Hobbit", mediaType: "BOOK", status: "PENDING" }));
    const request = vi.fn(async (_path: string, init?: RequestInit) => ({...result,operationId:init?.body ? JSON.parse(String(init.body)).operationId : result.operationId})) as unknown as Request;
    render(<MemoryRouter><LibraryAiSearch request={request} userId={5} mediaType="BOOK" onUse={vi.fn()}/></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("The Hobbit",{selector:"h4"})).toBeTruthy());
    expect((request as any).mock.calls[0][0]).toBe("/api/library/import/ai-search/op");
    expect(JSON.parse(localStorage.getItem("wb.library-ai-search.v1:5")!).status).toBe("SUCCEEDED");
  });
  it("does not replace another tab's pending identity with a new paid request", async () => {
    const request=vi.fn() as unknown as Request;
    render(<MemoryRouter><LibraryAiSearch request={request} userId={5} mediaType="BOOK" query="The Hobbit" onUse={vi.fn()}/></MemoryRouter>);
    localStorage.setItem("wb.library-ai-search.v1:5",JSON.stringify({operationId:"another-tab",status:"PENDING"}));
    fireEvent.click(screen.getByRole("button",{name:"AI 搜索"}));
    expect(await screen.findByRole("alert")).toBeTruthy();expect(request).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("wb.library-ai-search.v1:5")!).operationId).toBe("another-tab");
  });

});
