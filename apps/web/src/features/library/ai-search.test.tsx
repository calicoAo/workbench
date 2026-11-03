// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { LibraryAiSearch } from "./ai-search";

beforeEach(() => localStorage.clear()); afterEach(cleanup);
const result = { operationId: "op", query: "The Hobbit", mediaType: "BOOK" as const, status: "SUCCEEDED", searchCalls: 1, fetchCalls: 1, result: { candidates: [{ title: "The Hobbit", originalTitle: null, creator: "J. R. R. Tolkien", releaseYear: 1937, description: "A fantasy novel.", sources: [{ url: "https://openlibrary.org/works/OL123W", title: "Open Library" }] }] } };
describe("Library AI search recovery", () => {
  it("shows cited candidates and sends a selected title to the trusted-source workflow", async () => {
    const onUse = vi.fn(), request = vi.fn(async () => result) as unknown as Request;
    render(<LibraryAiSearch request={request} userId={5} mediaType="BOOK" onUse={onUse}/>);
    fireEvent.change(screen.getByPlaceholderText("输入书名、电影或剧集名称"), { target: { value: "The Hobbit" } });
    fireEvent.click(screen.getByRole("button", { name: "AI 搜索" }));
    expect(await screen.findByText("A fantasy novel.")).toBeTruthy();
    fireEvent.click(screen.getByText("用此名称查可信资料"));
    expect(onUse).toHaveBeenCalledWith("The Hobbit");
    expect(localStorage.getItem("wb.library-ai-search.v1:5")).toContain("OL123W");
  });
  it("recovers a pending operation from its status endpoint after remount", async () => {
    localStorage.setItem("wb.library-ai-search.v1:5", JSON.stringify({ operationId: "op", query: "The Hobbit", mediaType: "BOOK", status: "PENDING" }));
    const request = vi.fn(async () => result) as unknown as Request;
    render(<LibraryAiSearch request={request} userId={5} mediaType="BOOK" onUse={vi.fn()}/>);
    await waitFor(() => expect(screen.getByText("The Hobbit")).toBeTruthy());
    expect((request as any).mock.calls[0][0]).toBe("/api/library/import/ai-search/op");
    expect(JSON.parse(localStorage.getItem("wb.library-ai-search.v1:5")!).status).toBe("SUCCEEDED");
  });
});
