// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { Request } from "../../app/api";
import { SettingsFeature } from ".";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const snapshot = { profile: { id: 7, username: "owner", displayName: "Owner", timezone: "Asia/Shanghai" }, appearance: { theme: "light" as const, reducedMotion: false, fontScale: 100 as const }, rewards: { show: true }, continuation: { mode: "manual" as const, automaticAvailable: false as const }, categories: [{ id: 3, name: "Coding", color: "#35C99A", dimensionKey: "career", targetMinutes: 6000, enabled: 1 }], writingSlots: [{ slotKey: "MORNING_WRITING" as const, enabled: false, sortOrder: 10 }, { slotKey: "JOURNAL" as const, enabled: false, sortOrder: 20 }, { slotKey: "STOCK_REVIEW" as const, enabled: false, sortOrder: 30 }] };

describe("Settings", () => {
  it("persists the selected font scale", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return { ...snapshot, appearance: { ...snapshot.appearance, fontScale: 110 as const } };
      return snapshot;
    }) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "110%" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method: "PATCH" })));
    const call = (request as ReturnType<typeof vi.fn>).mock.calls.find(([path, init]) => path === "/api/settings" && init?.method === "PATCH");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ fontScale: 110 });
  });

  it("presents every writing module as an independent explicit opt-in with ordering", async () => {
    const enabledJournal = { ...snapshot, writingSlots: snapshot.writingSlots.map((slot) => slot.slotKey === "JOURNAL" ? { ...slot, enabled: true } : slot) };
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === "PATCH" ? enabledJournal : snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByText("选择你想使用的书写模块。")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "晨写：关闭" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "日记：关闭" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "股市复盘：关闭" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "日记上移" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "日记下移" })).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "日记：关闭" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method: "PATCH" })));
    const call = (request as ReturnType<typeof vi.fn>).mock.calls.find(([path, init]) => path === "/api/settings" && init?.method === "PATCH");
    const body = JSON.parse(String(call?.[1]?.body)) as { writingSlots: Array<{ slotKey: string; enabled: boolean }> };
    expect(body.writingSlots.find((slot) => slot.slotKey === "JOURNAL")?.enabled).toBe(true);
    expect(body.writingSlots.filter((slot) => slot.enabled)).toHaveLength(1);
  });

  it("explains timezone stability and disables categories without deleting history", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => path.startsWith("/api/task-categories") ? { id: 3 } : init?.method === "PATCH" ? snapshot : snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("新的记录将使用此时区；已有历史日期不会重新归属。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "停用" })); await waitFor(() => expect(request).toHaveBeenCalledWith("/api/task-categories/3", expect.objectContaining({ method: "PUT" }))); expect(String((request as ReturnType<typeof vi.fn>).mock.calls.find(([path]) => path === "/api/task-categories/3")?.[1]?.body)).toContain('"enabled":false');
  });

  it("restarts only the onboarding core loop from Settings", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => path === "/api/onboarding/flows/core-loop/restart" && init?.method === "POST" ? { status: "IN_PROGRESS" } : snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "重新开始新手教学" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/flows/core-loop/restart", { method: "POST" }));
    expect(await screen.findByText("新手教学已重置，下次进入今日时会重新开始。")).toBeTruthy();
  });

  it("downloads an explicitly requested domain export and reports success", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/api/exports/") ? { fileName: "notes.md", contentType: "text/markdown", recordCount: 2, content: "# Export" } : snapshot) as Request;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() }); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    await screen.findByText("数据导出"); const writingSelect = screen.getByLabelText("个人文字导出格式"); fireEvent.change(writingSelect, { target: { value: "markdown" } }); const writingRow = writingSelect.closest(".export-row")!; fireEvent.click(withinRowButton(writingRow));
    await waitFor(() => expect(screen.getByText("2 条")).toBeTruthy()); expect(request).toHaveBeenCalledWith("/api/exports/writing?format=markdown&includeTrash=false");
  });

  it("reports an export failure without creating a download", async () => {
    const onError = vi.fn();
    const request = vi.fn(async (path: string) => { if (path.startsWith("/api/exports/")) throw new Error("export unavailable"); return snapshot; }) as Request;
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={onError} /></MemoryRouter></QueryClientProvider>);
    await screen.findByText("数据导出");
    const taskRow = screen.getByLabelText("任务导出格式").closest(".export-row")!;
    fireEvent.click(withinRowButton(taskRow));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("export unavailable", "导出失败"));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("offers and downloads the Habit history domain", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/api/exports/") ? { fileName: "habits.json", contentType: "application/json", recordCount: 5, content: "[]" } : snapshot) as Request;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:habits") }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() }); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    const row = (await screen.findByLabelText("习惯导出格式")).closest(".export-row")!; fireEvent.click(withinRowButton(row));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/exports/habits?format=json&includeTrash=false"));
  });

  it("presents imported integer cents and statuses as Finance product language", async () => {
    const preview = { id: 1, sourceName: "preview.csv", rows: [
      { id: 1, date: "2026-09-11", amountCents: "-1000", kind: "EXPENSE", status: "EXACT_DUPLICATE", source: { account: "银行卡", category: "餐饮" } },
      { id: 2, date: "2026-09-12", amountCents: "-2000", kind: "EXPENSE", status: "POSSIBLE_DUPLICATE", source: { account: "银行卡", category: "餐饮" } },
      { id: 3, date: "2026-09-13", amountCents: "-3000", kind: "EXPENSE", status: "READY", source: { account: "银行卡", category: "餐饮" } },
      { id: 4, date: null, amountCents: "-4000", kind: "EXPENSE", status: "INVALID", source: { account: "银行卡", category: "餐饮" } }
    ] };
    const request = vi.fn(async (path: string) => path === "/api/finance/imports/external/preview" ? preview : snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    const file = { name: "preview.csv", text: async () => "date,amount\n2026-09-11,10.00" } as File;
    fireEvent.change(await screen.findByLabelText("导入外部流水 CSV"), { target: { files: [file] } });
    expect(await screen.findByText(/2026-09-11 · -¥10\.00/)).toBeTruthy();
    for (const label of ["完全重复", "可能重复", "可导入", "需要修正"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("EXACT_DUPLICATE")).toBeNull();
    expect(screen.queryByText("READY")).toBeNull();
  });
});

function withinRowButton(row: Element) { const button = row.querySelector("button"); if (!button) throw new Error("missing export button"); return button; }
