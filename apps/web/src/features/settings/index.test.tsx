// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { SettingsFeature } from ".";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const snapshot = { profile: { id: 7, username: "owner", displayName: "Owner", timezone: "Asia/Shanghai" }, appearance: { theme: "light" as const, reducedMotion: false }, rewards: { show: true }, continuation: { mode: "manual" as const, automaticAvailable: false as const }, categories: [{ id: 3, name: "Coding", color: "#35C99A", dimensionKey: "career", targetMinutes: 6000, enabled: 1 }] };

describe("Settings", () => {
  it("explains timezone stability and disables categories without deleting history", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => path.startsWith("/api/task-categories") ? { id: 3 } : init?.method === "PATCH" ? snapshot : snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></QueryClientProvider>);
    expect(await screen.findByText("新的记录将使用此时区；已有历史日期不会重新归属。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "停用" })); await waitFor(() => expect(request).toHaveBeenCalledWith("/api/task-categories/3", expect.objectContaining({ method: "PUT" }))); expect(String((request as ReturnType<typeof vi.fn>).mock.calls.find(([path]) => path === "/api/task-categories/3")?.[1]?.body)).toContain('"enabled":false');
  });

  it("downloads an explicitly requested domain export and reports success", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/api/exports/") ? { fileName: "notes.md", contentType: "text/markdown", recordCount: 2, content: "# Export" } : snapshot) as Request;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() }); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></QueryClientProvider>);
    await screen.findByText("数据导出"); const writingSelect = screen.getByLabelText("个人文字导出格式"); fireEvent.change(writingSelect, { target: { value: "markdown" } }); const writingRow = writingSelect.closest(".export-row")!; fireEvent.click(withinRowButton(writingRow));
    await waitFor(() => expect(screen.getByText("2 条")).toBeTruthy()); expect(request).toHaveBeenCalledWith("/api/exports/writing?format=markdown&includeTrash=false");
  });

  it("reports an export failure without creating a download", async () => {
    const onError = vi.fn();
    const request = vi.fn(async (path: string) => { if (path.startsWith("/api/exports/")) throw new Error("export unavailable"); return snapshot; }) as Request;
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={onError} /></QueryClientProvider>);
    await screen.findByText("数据导出");
    const taskRow = screen.getByLabelText("任务导出格式").closest(".export-row")!;
    fireEvent.click(withinRowButton(taskRow));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("export unavailable", "导出失败"));
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

function withinRowButton(row: Element) { const button = row.querySelector("button"); if (!button) throw new Error("missing export button"); return button; }
