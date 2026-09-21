// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { SearchFeature } from ".";

afterEach(cleanup);

describe("Global Search", () => {
  it("renders domain summaries, deep links, and compact advanced filters", async () => {
    const request = vi.fn(async () => ({ items: [{ type: "quick_note", id: 8, title: "Needle note", snippet: "matching text", date: "2026-09-20", deepLink: "/notes/8?date=2026-09-20" }], nextCursor: null, archivedPolicy: "deleted excluded" })) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/search?q=needle"]}><SearchFeature request={request} userId={7} /></MemoryRouter></QueryClientProvider>);
    const link = await screen.findByRole("link", { name: /Needle note/ }); expect(link.getAttribute("href")).toBe("/notes/8?date=2026-09-20");
    expect(screen.queryByLabelText("搜索开始日期")).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "筛选" })); expect(screen.getByLabelText("搜索开始日期")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "任务" })); await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("type=task")));
  });
});
