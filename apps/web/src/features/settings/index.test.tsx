// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { Request } from "../../app/api";
import { I18nProvider } from "../../app/i18n";
import { SettingsFeature } from ".";

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.lang = "zh-CN"; vi.restoreAllMocks(); });
const snapshot = { profile: { id: 7, username: "owner", displayName: "Owner", timezone: "Asia/Shanghai" }, appearance: { theme: "light" as const, reducedMotion: false, fontScale: 100 as const, locale: "zh-CN" as const }, feedback: { showSuccess: true }, rewards: { show: true }, continuation: { mode: "manual" as const, automaticAvailable: false as const }, categories: [{ id: 3, name: "Coding", color: "#35C99A", dimensionKey: "career", targetMinutes: 6000, enabled: 1 }], writingSlots: [{ slotKey: "MORNING_WRITING" as const, enabled: false, sortOrder: 10 }, { slotKey: "JOURNAL" as const, enabled: false, sortOrder: 20 }, { slotKey: "STOCK_REVIEW" as const, enabled: false, sortOrder: 30 }] };

describe("Settings", () => {
  it("persists the global successful-operation feedback preference", async () => {
    const disabled = { ...snapshot, feedback: { showSuccess: false } };
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === "PATCH" ? disabled : snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    const toggle = await screen.findByRole<HTMLInputElement>("checkbox", { name: "成功操作后显示反馈" });
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ showSuccessFeedback: false }) })));
  });

  it("persists language and applies the returned locale immediately", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === "PATCH" ? { ...snapshot, appearance: { ...snapshot.appearance, locale: "en" as const } } : snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<I18nProvider><QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider></I18nProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "English" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/settings", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ locale: "en" }) })));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("persists the selected font scale", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return { ...snapshot, appearance: { ...snapshot.appearance, fontScale: 110 as const } };
      return snapshot;
    }) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "外观" }));
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

    fireEvent.click(await screen.findByRole("button", { name: "笔记本" }));
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
    fireEvent.click(screen.getByRole("button", { name: "冒险" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑分类 Coding" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "分类已启用" }));
    fireEvent.click(screen.getByRole("button", { name: "保存分类" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/task-categories/3", expect.objectContaining({ method: "PUT" })));
    expect(String((request as ReturnType<typeof vi.fn>).mock.calls.find(([path]) => path === "/api/task-categories/3")?.[1]?.body)).toContain('"enabled":false');
  });

  it("restarts only the onboarding core loop from Settings", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => path === "/api/onboarding/flows/core-loop/restart" && init?.method === "POST" ? { status: "IN_PROGRESS" } : snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "帮助" }));
    fireEvent.click(await screen.findByRole("button", { name: "重新开始新手教学" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/onboarding/flows/core-loop/restart", { method: "POST" }));
    expect(await screen.findByText("新手教学已重置，下次进入今日时会重新开始。")).toBeTruthy();
  });

  it("downloads an explicitly requested domain export and reports success", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/api/exports/") ? { fileName: "notes.md", contentType: "text/markdown", recordCount: 2, content: "# Export" } : snapshot) as Request;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() }); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/settings?topic=data"]}><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    await screen.findByText("工作台数据导出"); const writingSelect = screen.getByLabelText("个人文字导出格式"); fireEvent.change(writingSelect, { target: { value: "markdown" } }); const writingRow = writingSelect.closest(".export-row")!; fireEvent.click(withinRowButton(writingRow));
    await waitFor(() => expect(screen.getByText("2 条")).toBeTruthy()); expect(request).toHaveBeenCalledWith("/api/exports/writing?format=markdown&includeTrash=false");
  });

  it("reports an export failure without creating a download", async () => {
    const onError = vi.fn();
    const request = vi.fn(async (path: string) => { if (path.startsWith("/api/exports/")) throw new Error("export unavailable"); return snapshot; }) as Request;
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/settings?topic=data"]}><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={onError} /></MemoryRouter></QueryClientProvider>);
    await screen.findByText("工作台数据导出");
    const taskRow = screen.getByLabelText("任务导出格式").closest(".export-row")!;
    fireEvent.click(withinRowButton(taskRow));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("export unavailable", "导出失败"));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("offers and downloads the Habit history domain", async () => {
    const request = vi.fn(async (path: string) => path.startsWith("/api/exports/") ? { fileName: "habits.json", contentType: "application/json", recordCount: 5, content: "[]" } : snapshot) as Request;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:habits") }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() }); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/settings?topic=data"]}><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    const row = (await screen.findByLabelText("习惯导出格式")).closest(".export-row")!; fireEvent.click(withinRowButton(row));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/exports/habits?format=json&includeTrash=false"));
  });

  it("keeps global Data exports and tools without Finance maintenance ownership", async () => {
    const request = vi.fn(async () => snapshot) as Request;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/settings?topic=data"]}><SettingsFeature request={request} userId={7} logout={vi.fn()} onProfileChanged={vi.fn()} onError={vi.fn()} /></MemoryRouter></QueryClientProvider>);
    await screen.findByRole("heading", { name: "工作台数据导出" });
    expect(screen.getByRole("link", { name: /搜索/ }).getAttribute("href")).toBe("/search");
    expect(screen.getByRole("link", { name: /回收站/ }).getAttribute("href")).toBe("/settings/trash");
    expect(screen.getByRole("link", { name: "钱包数据维护" }).getAttribute("href")).toBe("/finance?tab=maintenance");
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector(".finance-data-maintenance")).toBeNull();
    expect((request as ReturnType<typeof vi.fn>).mock.calls.every(([path]) => !path.startsWith("/api/finance"))).toBe(true);
    expect(within(screen.getByRole("navigation", { name: "设置主题" })).queryByRole("button", { name: "钱包" })).toBeNull();
    const mobile = screen.getByRole("combobox", { name: "设置主题" });
    expect(within(mobile).queryByRole("option", { name: "钱包" })).toBeNull();
    fireEvent.change(mobile, { target: { value: "general" } });
    expect(await screen.findByText("新的记录将使用此时区；已有历史日期不会重新归属。")).toBeTruthy();
  });


});

function withinRowButton(row: Element) { const button = row.querySelector("button"); if (!button) throw new Error("missing export button"); return button; }
