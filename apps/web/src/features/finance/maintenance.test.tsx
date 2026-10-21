// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { FinancePage } from ".";

const preview = { id: 1, sourceName: "preview.csv", rows: [
  { id: 1, date: "2026-09-11", amountCents: "-1000", kind: "EXPENSE", status: "EXACT_DUPLICATE", source: { account: "银行卡", category: "餐饮" } },
  { id: 2, date: "2026-09-12", amountCents: "-2000", kind: "EXPENSE", status: "POSSIBLE_DUPLICATE", source: { account: "银行卡", category: "餐饮" } },
  { id: 3, date: "2026-09-13", amountCents: "-3000", kind: "EXPENSE", status: "READY", source: { account: "银行卡", category: "餐饮" } },
  { id: 4, date: null, amountCents: "-4000", kind: "EXPENSE", status: "INVALID", source: { account: "银行卡", category: "餐饮" } },
] };
const csv = { name: "preview.csv", text: async () => "date,amount,account,category\n2026-09-11,10.00,银行卡,餐饮" } as File;
const backup = { schemaVersion: 1, finance: { marker: "private owner payload" } };
const json = { name: "backup.json", text: async () => JSON.stringify(backup) } as File;
function requestFor(mutate: (path: string, init?: RequestInit) => unknown | Promise<unknown> = () => ({})) {
  return vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") return mutate(path, init);
    if (path.startsWith("/api/finance/overview")) return { currency: "CNY", month: "2026-09", totalAssetsCents: "0", totalLiabilitiesCents: "0", netWorthCents: "0", monthlyIncomeCents: "0", monthlyExpenseCents: "0", accountCount: 0, accounts: [], recentTransactions: [] };
    if (path.includes("accounts") || path.includes("categories")) return [];
    throw new Error(`unexpected ${path}`);
  }) as Request;
}
function History() { const nav = useNavigate(); const loc = useLocation(); return <><output>{loc.pathname + loc.search}</output><button onClick={() => nav(-1)}>back-test</button><button onClick={() => nav(1)}>forward-test</button></>; }
function setup(request: Request, userId = 7, onReward = vi.fn(), onGrowthChanged = vi.fn(async () => undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const error = vi.fn();
  const node = (id: number) => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/finance?tab=maintenance&date=2026-09-21"]}><History /><FinancePage request={request} userId={id} date="2026-09-21" timezone="Asia/Tokyo" onError={error} onReward={onReward} onGrowthChanged={onGrowthChanged} /></MemoryRouter></QueryClientProvider>;
  return { ...render(node(userId)), client, error, node, onReward, onGrowthChanged };
}
function selectCsv() { fireEvent.change(screen.getByLabelText("导入外部流水 CSV"), { target: { files: [csv] } }); }
function selectBackup() { fireEvent.change(screen.getByLabelText("恢复 Finance JSON"), { target: { files: [json] } }); }
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("Wallet-owned maintenance", () => {
  it("opens an empty uninitialized ledger without writes or sensitive operations and keeps URL history", async () => {
    const request = requestFor(); setup(request);
    expect(await screen.findByLabelText("导入外部流水 CSV")).toBeTruthy();
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/categories"));
    expect(screen.queryByRole("button", { name: "初始化财务分类" })).toBeNull();
    expect((request as ReturnType<typeof vi.fn>).mock.calls.every(([, init]) => !init?.method)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "账户" }));
    expect(screen.getByText("/finance?tab=accounts&date=2026-09-21")).toBeTruthy();
    fireEvent.click(screen.getByText("back-test"));
    expect(await screen.findByLabelText("恢复 Finance JSON")).toBeTruthy();
    fireEvent.click(screen.getByText("forward-test"));
    await waitFor(() => expect(screen.queryByLabelText("恢复 Finance JSON")).toBeNull());
  });
  it("stages with the user's timezone and presents integer cents/statuses without posting", async () => {
    const request = requestFor(() => preview); setup(request); selectCsv();
    expect(await screen.findByText(/2026-09-11 · -¥10\.00/)).toBeTruthy();
    for (const label of ["完全重复", "可能重复", "可导入", "需要修正"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText("EXACT_DUPLICATE")).toBeNull();
    expect(request).toHaveBeenCalledWith("/api/finance/imports/external/preview", expect.objectContaining({ body: expect.stringContaining('"timezone":"Asia/Tokyo"') }));
    expect((request as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("requires export confirmation, preserves failure retry and downloads only on success", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const create = vi.fn(() => "blob:backup"); Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    let fail = true;
    const request = requestFor(() => { if (fail) throw new Error("transient"); return { fileName: "backup.json", contentType: "application/json", content: "{}" }; });
    const { error } = setup(request);
    fireEvent.click(screen.getByText("导出财务备份 JSON")); expect(create).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); fireEvent.click(screen.getByText("导出财务备份 JSON"));
    await waitFor(() => expect(error).toHaveBeenCalledWith("transient", "财务导出失败")); expect(create).not.toHaveBeenCalled();
    fail = false; fireEvent.click(screen.getByText("导出财务备份 JSON"));
    expect(await screen.findByText("财务数据已生成并下载")).toBeTruthy(); expect(create).toHaveBeenCalledTimes(1);
  });
  it.each(["import", "restore"])("refreshes every existing Finance query family after successful %s", async (kind) => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onReward = vi.fn(); const onGrowthChanged = vi.fn(async () => undefined);
    const request = requestFor((path) => path.endsWith("/preview") ? path.includes("restore") ? { valid: true, schemaVersion: 1, counts: {} } : preview : { summary: { imported: 1 }, ...(kind === "import" ? { reward: { xp: 5, coins: 2, reason: "财务记录" } } : {}) });
    const { client } = setup(request, 7, onReward, onGrowthChanged); const invalidate = vi.spyOn(client, "invalidateQueries");
    client.setQueryData(["finance-recurring-templates", 7], []);
    client.setQueryData(["finance-recurring-occurrences", 7, "2026-09"], []);
    if (kind === "import") { selectCsv(); fireEvent.click(await screen.findByText("确认导入可用行")); }
    else { selectBackup(); fireEvent.click(await screen.findByText("确认恢复")); }
    for (const name of ["overview", "accounts", "categories", "transactions", "budgets", "recurring-templates", "recurring-occurrences", "reports"]) await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: [`finance-${name}`, 7] }));
    expect(client.getQueryState(["finance-recurring-templates", 7])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["finance-recurring-occurrences", 7, "2026-09"])?.isInvalidated).toBe(true);
    if (kind === "import") { expect(request).toHaveBeenCalledWith("/api/finance/imports/1/confirm", expect.objectContaining({ body: expect.stringContaining('"allowPossibleDuplicates":true') })); expect(onReward).toHaveBeenCalledWith("财务记录", { xp: 5, coins: 2, reason: "财务记录" }); expect(onGrowthChanged).toHaveBeenCalledTimes(1); }
    else expect(request).toHaveBeenCalledWith("/api/finance/maintenance/restore/confirm", expect.objectContaining({ body: expect.stringContaining(JSON.stringify(backup)) }));
  });
  it("retains import preview on failure and allows explicit retry", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true); let fail = true;
    const request = requestFor((path) => { if (path.endsWith("/preview")) return preview; if (fail) throw new Error("try again"); return { summary: { imported: 1 } }; });
    const { error } = setup(request); selectCsv(); fireEvent.click(await screen.findByText("确认导入可用行"));
    await waitFor(() => expect(error).toHaveBeenCalledWith("try again", "流水导入失败")); expect(screen.getByText("preview.csv", { exact: false })).toBeTruthy();
    fail = false; fireEvent.click(screen.getByText("确认导入可用行")); expect(await screen.findByText(/结果：成功/)).toBeTruthy();
  });
  it("clears file inputs, restore payload and previews on user switch", async () => {
    const request = requestFor((path) => path.includes("restore") ? { valid: true, counts: {}, schemaVersion: 1 } : preview);
    const { rerender, node } = setup(request); selectCsv(); await screen.findByText("确认导入可用行"); selectBackup(); await screen.findByText("确认恢复");
    rerender(node(8)); expect(screen.queryByText("确认恢复")).toBeNull(); expect(screen.queryByText("确认导入可用行")).toBeNull();
    expect((screen.getByLabelText("恢复 Finance JSON") as HTMLInputElement).files).toHaveLength(0);
    expect((screen.getByLabelText("导入外部流水 CSV") as HTMLInputElement).files).toHaveLength(0);
  });
  it("ignores late file reads and previous-user request failures after switching users", async () => {
    let reject!: (reason: Error) => void;
    const request = requestFor(() => new Promise((_, no) => { reject = no; }));
    const { rerender, node, error } = setup(request); selectCsv(); await waitFor(() => expect(reject).toBeTruthy()); rerender(node(8)); reject(new Error("old-user secret"));
    await new Promise((resolve) => setTimeout(resolve, 0)); expect(error).not.toHaveBeenCalled(); expect(screen.queryByText("确认导入可用行")).toBeNull();
  });
  it("drops an in-flight file read on user change before issuing any preview request", async () => {
    let resolve!: (text: string) => void;
    const request = requestFor(); const { rerender, node } = setup(request);
    fireEvent.change(screen.getByLabelText("导入外部流水 CSV"), { target: { files: [{ name: "private.csv", text: () => new Promise<string>((yes) => { resolve = yes; }) }] } });
    rerender(node(8)); resolve("date,amount\n2026-09-11,10.00");
    await new Promise((yes) => setTimeout(yes, 0));
    expect((request as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("keeps valid restore preview on a confirmation failure, supports retry and clears it for a new invalid file", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true); let fail = true;
    const request = requestFor((path) => { if (path.endsWith("/preview")) return { valid: true, counts: {}, schemaVersion: 1 }; if (fail) throw new Error("restore conflict"); return {}; });
    const { error } = setup(request); selectBackup(); fireEvent.click(await screen.findByText("确认恢复"));
    await waitFor(() => expect(error).toHaveBeenCalledWith("restore conflict", "备份恢复失败"));
    fail = false; fireEvent.click(screen.getByText("确认恢复")); await screen.findByText("恢复完成");
    fireEvent.change(screen.getByLabelText("恢复 Finance JSON"), { target: { files: [{ name: "invalid.json", text: async () => "invalid json" }] } });
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.any(String), "备份预览失败"));
    expect(screen.queryByText("确认恢复")).toBeNull(); expect(screen.queryByText("恢复完成")).toBeNull();
  });
  it("rejects non-empty restore preview and keeps reconciliation explicitly read-only", async () => {
    const request = requestFor((path) => path.includes("restore") ? { valid: false, errors: ["完整恢复需要空账本/新环境"] } : { status: "ALL_CLEAR" }); setup(request);
    selectBackup(); await screen.findByText("完整恢复需要空账本/新环境"); expect(screen.queryByText("确认恢复")).toBeNull();
    fireEvent.click(screen.getByText("账本核对")); expect(await screen.findByText("账本核对：全部正常")).toBeTruthy();
    expect((request as ReturnType<typeof vi.fn>).mock.calls.some(([path]) => path.endsWith("restore/confirm"))).toBe(false);
  });
});
