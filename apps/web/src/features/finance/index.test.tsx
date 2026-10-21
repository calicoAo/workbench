// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { FinancePage } from ".";
import type { FinanceAccount, FinanceCategory, FinanceOverview, FinanceTransaction } from "./model";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } }); }
const bank: FinanceAccount = { id: 10, name: "工资卡", type: "BANK", currency: "CNY", includeInOverview: true, openingDate: "2026-09-01", archivedAt: null, version: 1, balanceCents: "100000" };
const credit: FinanceAccount = { ...bank, id: 11, name: "信用卡", type: "CREDIT", balanceCents: "-10000" };
const categories: FinanceCategory[] = [{ id: 20, kind: "EXPENSE", name: "餐饮", sortOrder: 10, enabled: true, version: 1 }, { id: 21, kind: "INCOME", name: "工资", sortOrder: 10, enabled: true, version: 1 }];
const transaction: FinanceTransaction = { id: 30, type: "EXPENSE", occurredAt: "2026-09-21T11:00:00.000Z", recordTimezone: "Asia/Shanghai", businessDate: "2026-09-21", categoryId: 20, categoryName: "餐饮", note: "晚餐", version: 1, accountId: 10, accountName: "工资卡", accountType: "BANK", amountCents: "-3000" };
const transfer: FinanceTransaction = { id: 31, type: "TRANSFER", occurredAt: "2026-09-21T11:00:00.000Z", recordTimezone: "Asia/Shanghai", businessDate: "2026-09-21", categoryId: null, categoryName: null, note: "转入储蓄", version: 1, accountId: null, accountName: null, accountType: null, amountCents: "0", displayAmountCents: "20000", sourceAccountId: 10, sourceAccountName: "工资卡", targetAccountId: 12, targetAccountName: "储蓄卡", transfer: { amountCents: "20000", sourceAccountName: "工资卡", targetAccountName: "储蓄卡", feeAmountCents: "0" } };
function overview(overrides: Partial<FinanceOverview> = {}): FinanceOverview { return { currency: "CNY", month: "2026-09", recordTimezone: "Asia/Shanghai", totalAssetsCents: "100000", totalLiabilitiesCents: "0", netWorthCents: "100000", monthlyIncomeCents: "0", monthlyExpenseCents: "0", accountCount: 1, accounts: [bank], recentTransactions: [], ...overrides }; }
function requestFor(options: { accounts?: FinanceAccount[]; categories?: FinanceCategory[]; overview?: FinanceOverview | (() => FinanceOverview); transactions?: FinanceTransaction[]; mutate?: (path: string, init?: RequestInit) => unknown | Promise<unknown> } = {}) {
  return vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") return options.mutate?.(path, init) ?? { id: 99, version: 1 };
    if (path.startsWith("/api/finance/overview")) return typeof options.overview === "function" ? options.overview() : options.overview ?? overview();
    if (path.startsWith("/api/finance/accounts")) return options.accounts ?? [bank];
    if (path.startsWith("/api/finance/categories")) return options.categories ?? categories;
    if (/^\/api\/finance\/transactions\/\d+$/.test(path)) return options.transactions?.[0] ?? transaction;
    if (path.startsWith("/api/finance/transactions")) return { items: options.transactions ?? [transaction], nextCursor: null };
    throw new Error(`unexpected ${path}`);
  }) as Request;
}
function renderPage(request: Request, entry = "/finance?date=2026-09-21", initialAction?: "income" | "expense" | "transfer", onError = vi.fn()) { return render(<QueryClientProvider client={client()}><MemoryRouter initialEntries={[entry]}><FinancePage request={request} userId={7} date="2026-09-21" timezone="Asia/Shanghai" initialAction={initialAction} onError={onError} /></MemoryRouter></QueryClientProvider>); }

describe("FIN-01 Finance", () => {
  it.each([
    { type: "CREDIT" as const, group: "负债账户", balanceCents: "12500" },
    { type: "BANK" as const, group: "资产账户", balanceCents: "-1000" },
  ])("moves $type into Archived and restores its group without changing inclusion/balance", async ({ type, group, balanceCents }) => {
    const accounts = [{ ...bank, type, balanceCents, includeInOverview: false }];
    const request = requestFor({ accounts, mutate: (path) => {
      accounts[0] = { ...accounts[0], archivedAt: path.endsWith("/archive") ? "2026-09-21T12:00:00Z" : null, version: accounts[0].version + 1 };
      return { id: bank.id, version: accounts[0].version };
    } });
    renderPage(request); fireEvent.click(await screen.findByRole("button", { name: "账户" }));
    expect(within(await screen.findByRole("region", { name: group })).getByText(bank.name)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "编辑 工资卡" }));
    fireEvent.click(screen.getByRole("button", { name: "归档账户" }));
    await waitFor(() => expect(screen.queryByLabelText("账户名称")).toBeNull());
    expect(within(screen.getByRole("region", { name: group })).queryByText(bank.name)).toBeNull();
    fireEvent.click(screen.getByLabelText("显示已归档"));
    expect(within(screen.getByRole("region", { name: "已归档账户" })).getByText(bank.name)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "编辑 工资卡" }));
    expect((screen.getByLabelText("计入总览净值") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "恢复账户" }));
    await waitFor(() => expect(screen.queryByLabelText("账户名称")).toBeNull());
    expect(within(screen.getByRole("region", { name: group })).getByText(bank.name)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "已归档账户" })).queryByText(bank.name)).toBeNull();
    expect(accounts[0]).toMatchObject({ type, balanceCents, includeInOverview: false, archivedAt: null });
    expect(request).toHaveBeenCalledWith("/api/finance/accounts/10/unarchive", expect.objectContaining({ method: "POST", body: expect.stringContaining('"expectedVersion":2') }));
  });

  it("renders the reachable overview with API-owned totals", async () => {
    renderPage(requestFor()); expect(await screen.findByRole("heading", { name: "财务" })).toBeTruthy(); expect((await screen.findAllByText("¥1,000.00")).length).toBeGreaterThan(0); expect(screen.getByText("余额来自已入账分录，和工作台金币完全分开。")).toBeTruthy();
  });

  it("initializes Finance explicitly without hiding empty state behind GET writes", async () => {
    const request = requestFor({ categories: [] }); renderPage(request); fireEvent.click(await screen.findByRole("button", { name: "初始化财务分类" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/initialize", expect.objectContaining({ method: "POST" })));
  });

  it("creates an income or expense category and displays it after the canonical list refresh", async () => {
    let current = [...categories];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path === "/api/finance/categories") {
        const body = JSON.parse(String(init.body)) as { kind: FinanceCategory["kind"]; name: string; sortOrder: number };
        current = [...current, { id: 42, ...body, enabled: true, version: 1 }];
        return { id: 42, version: 1 };
      }
      if (path.startsWith("/api/finance/overview")) return overview();
      if (path.startsWith("/api/finance/accounts")) return [bank];
      if (path.startsWith("/api/finance/categories")) return current;
      if (path.startsWith("/api/finance/transactions")) return { items: [], nextCursor: null };
      throw new Error(`unexpected ${path}`);
    }) as Request;
    renderPage(request, "/finance?date=2026-09-21&tab=accounts");
    await screen.findByRole("heading", { name: "收支分类" });
    fireEvent.change(screen.getByLabelText("新财务分类"), { target: { value: "宠物医疗" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(await screen.findByText("宠物医疗")).toBeTruthy();
    expect(request).toHaveBeenCalledWith("/api/finance/categories", expect.objectContaining({ method: "POST", body: expect.stringContaining('"kind":"EXPENSE"') }));
  });

  it("keeps account title and close in its header and makes the inclusion label clickable", async () => {
    const request = requestFor(); renderPage(request, "/finance?date=2026-09-21&tab=accounts");
    fireEvent.click(await screen.findByRole("button", { name: "创建账户" }));
    const dialog = screen.getByRole("dialog", { name: "创建账户" });
    const header = dialog.querySelector(":scope > header")!;
    expect(within(header as HTMLElement).getByRole("heading", { name: "创建账户" })).toBeTruthy();
    const close = within(header as HTMLElement).getByRole("button", { name: "关闭" });
    const box = within(dialog).getByRole<HTMLInputElement>("checkbox", { name: "计入总览净值" });
    expect(box.checked).toBe(true);
    fireEvent.click(within(dialog).getByText("计入总览净值"));
    expect(box.checked).toBe(false);
    fireEvent.click(close);
    expect(screen.queryByRole("dialog", { name: "创建账户" })).toBeNull();
    expect(request).not.toHaveBeenCalledWith("/api/finance/accounts", expect.objectContaining({ method: "POST" }));
  });

  it("creates an account and converts opening Yuan to integer cents", async () => {
    const request = requestFor(); renderPage(request); fireEvent.click(await screen.findByRole("button", { name: "账户" })); fireEvent.click(screen.getByRole("button", { name: /创建账户/ }));
    fireEvent.change(screen.getByLabelText("账户名称"), { target: { value: "现金钱包" } }); fireEvent.change(screen.getByLabelText("期初余额"), { target: { value: "88.36" } }); fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/accounts", expect.objectContaining({ body: expect.stringContaining('"openingBalanceCents":"8836"') })));
  });

  it("shows the opening balance only as the derived account balance", async () => {
    renderPage(requestFor()); fireEvent.click(await screen.findByRole("button", { name: "账户" })); expect(await screen.findByText("¥1,000.00")).toBeTruthy(); expect(screen.getByText(/期初 2026-09-01/)).toBeTruthy();
  });

  it("archives and restores through the account editor and refreshes API-owned totals while keeping the balance and monthly expense", async () => {
    const accounts = [{ ...bank, balanceCents: "70000" }];
    const request = requestFor({
      accounts,
      overview: () => overview({
        accounts: [...accounts], accountCount: accounts[0].archivedAt ? 0 : 1,
        totalAssetsCents: accounts[0].archivedAt ? "0" : "70000",
        netWorthCents: accounts[0].archivedAt ? "0" : "70000", monthlyExpenseCents: "30000"
      }),
      mutate: (path) => {
        accounts[0] = { ...accounts[0], archivedAt: path.endsWith("/archive") ? "2026-09-21T12:00:00.000Z" : null, version: accounts[0].version + 1 };
        return { id: bank.id, version: accounts[0].version };
      }
    });
    const { container } = renderPage(request);
    await screen.findByText("仅统计未归档且计入总览的账户。");
    expect(within(container.querySelector(".finance-worth")!).getAllByText("¥700.00")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "账户" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑 工资卡" }));
    expect(screen.getByText("归档后，该账户余额不再计入当前概览统计，但历史记录仍会保留。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "归档账户" }));
    await waitFor(() => expect(screen.queryByLabelText("账户名称")).toBeNull());
    expect(request).toHaveBeenCalledWith("/api/finance/accounts/10/archive", expect.objectContaining({ method: "POST", body: expect.stringContaining('"expectedVersion":1') }));
    fireEvent.click(screen.getByRole("button", { name: "概览" }));
    expect(within(container.querySelector(".finance-worth")!).getAllByText("¥0.00")).toHaveLength(3);
    expect(screen.getByText("¥300.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "账户" }));
    fireEvent.click(screen.getByLabelText("显示已归档"));
    expect(await screen.findByText("¥700.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "编辑 工资卡" }));
    expect((screen.getByLabelText("计入总览净值") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "恢复账户" }));
    await waitFor(() => expect(screen.queryByLabelText("账户名称")).toBeNull());
    expect(request).toHaveBeenCalledWith("/api/finance/accounts/10/unarchive", expect.objectContaining({ method: "POST", body: expect.stringContaining('"expectedVersion":2') }));
    fireEvent.click(screen.getByRole("button", { name: "概览" }));
    expect(within(container.querySelector(".finance-worth")!).getAllByText("¥700.00")).toHaveLength(2);
    expect(screen.getByText("¥300.00")).toBeTruthy();
  });

  it.each(["income", "expense"] as const)("excludes archived accounts from new %s selection while retaining active excluded accounts", async (action) => {
    renderPage(requestFor({ accounts: [{ ...bank, includeInOverview: false }, { ...credit, archivedAt: "2026-09-21T12:00:00.000Z" }] }), undefined, action);
    const selector = await screen.findByLabelText("财务账户");
    expect(within(selector).getByRole("option", { name: /工资卡/ })).toBeTruthy();
    expect(within(selector).queryByRole("option", { name: /信用卡/ })).toBeNull();
  });

  it("excludes archived accounts from both transfer selectors", async () => {
    renderPage(requestFor({ accounts: [bank, { ...bank, id: 12, name: "储蓄卡", includeInOverview: false }, { ...credit, archivedAt: "2026-09-21T12:00:00.000Z" }] }), undefined, "transfer");
    for (const label of ["转出账户", "转入账户"]) {
      const selector = await screen.findByLabelText(label);
      expect(within(selector).getAllByRole("option").filter((option) => !(option as HTMLOptionElement).disabled)).toHaveLength(2);
      expect(within(selector).queryByRole("option", { name: /信用卡/ })).toBeNull();
    }
  });

  it("adds an expense and refreshes account and monthly summaries", async () => {
    let posted = false; const request = requestFor({ overview: () => overview(posted ? { monthlyExpenseCents: "3000", totalAssetsCents: "97000", netWorthCents: "97000" } : {}), mutate: (path) => { if (path === "/api/finance/expenses") posted = true; return { transactionId: 31 }; } });
    renderPage(request); fireEvent.click(await screen.findByRole("button", { name: "记支出" })); fireEvent.change(screen.getByLabelText("金额"), { target: { value: "30.00" } }); fireEvent.click(screen.getByRole("button", { name: "保存支出" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/expenses", expect.objectContaining({ body: expect.stringContaining('"amountCents":"3000"') }))); await screen.findByText("¥30.00");
  });

  it("adds income through the matching Finance command", async () => {
    const request = requestFor(); renderPage(request); fireEvent.click(await screen.findByRole("button", { name: "记收入" })); fireEvent.change(screen.getByLabelText("金额"), { target: { value: "500" } }); fireEvent.click(screen.getByRole("button", { name: "保存收入" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/income", expect.objectContaining({ body: expect.stringContaining('"amountCents":"50000"') })));
  });

  it.each([{ action: "借入", confirm: "确认借入", source: 11, target: 10 }, { action: "还款", confirm: "确认还款", source: 10, target: 11 }])("opens $action from its liability account and refreshes canonical queries after saving", async ({ action, confirm, source, target }) => {
    const accounts = [bank, credit];
    const request = requestFor({ accounts, mutate: () => { accounts[1] = { ...credit, balanceCents: "0" }; return { transactionId: 42 }; } });
    renderPage(request, "/finance?date=2026-09-21&tab=accounts");
    fireEvent.click(await screen.findByRole("button", { name: action }));
    expect((screen.getByLabelText("转出账户") as HTMLSelectElement).value).toBe(String(source));
    expect((screen.getByLabelText("转入账户") as HTMLSelectElement).value).toBe(String(target));
    fireEvent.change(screen.getByLabelText("转账金额"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: confirm }));
    await waitFor(() => expect(screen.queryByLabelText("转账金额")).toBeNull());
    expect(await screen.findByText("已结清")).toBeTruthy();
    expect(vi.mocked(request).mock.calls.filter(([path]) => path === "/api/finance/accounts?view=all").length).toBeGreaterThan(1);
    expect(vi.mocked(request).mock.calls.filter(([path]) => path.startsWith("/api/finance/overview")).length).toBeGreaterThan(1);
  });

  it("posts a transfer without routing through income or expense", async () => {
    const request = requestFor({ accounts: [bank, { ...bank, id: 12, name: "储蓄卡" }] }); renderPage(request, "/finance?date=2026-09-21", "transfer"); fireEvent.change(await screen.findByLabelText("转账金额"), { target: { value: "12.00" } }); fireEvent.click(screen.getByRole("button", { name: "保存转账" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/transfers", expect.objectContaining({ method: "POST", body: expect.stringContaining('"amountCents":"1200"') })));
  });

  it("renders a transfer principal and source-to-target relation instead of zero flow", async () => {
    const request = requestFor({ transactions: [transfer] }); renderPage(request, "/finance?date=2026-09-21&tab=transactions"); const row = await screen.findByRole("button", { name: /转账.*工资卡.*储蓄卡/ }); expect(row.textContent).toContain("¥200.00"); fireEvent.click(row); expect(await screen.findByText("转出：工资卡")).toBeTruthy(); expect(screen.getByText("转入：储蓄卡")).toBeTruthy();
  });

  it.each([
    { source: "信用卡", target: "另一信用卡", note: "余额转移" },
    { source: "预存信用卡", target: "工资卡", note: "预存提取" },
  ])("retains neutral transfer history and execution context for $source → $target", async ({ source, target, note }) => {
    const item = { ...transfer, sourceAccountName: source, targetAccountName: target, note, transfer: { ...transfer.transfer!, sourceAccountName: source, targetAccountName: target } };
    renderPage(requestFor({ accounts: [bank, credit], transactions: [item] }), "/finance?date=2026-09-21&tab=transactions");
    const row = await screen.findByRole("button", { name: new RegExp(`转账.*${source}.*${target}`) });
    expect(row.textContent).toContain(note); expect(row.textContent).not.toContain("还款"); expect(row.textContent).not.toContain("借入");
    fireEvent.click(row); expect(await screen.findByText(`转出：${source}`)).toBeTruthy(); expect(screen.getByText(`转入：${target}`)).toBeTruthy();
  });

  it("shows refund summary and disables refund after full refund", async () => {
    const refundSource: FinanceTransaction = { ...transaction, refund: { originalAmountCents: "10000", refundedAmountCents: "10000", remainingRefundableCents: "0", canRefund: false, refunds: [{ id: 41, amountCents: "10000", businessDate: "2026-09-21", occurredAt: "2026-09-21T03:00:00.000Z", accountName: "工资卡", note: null }] } }; const request = requestFor({ transactions: [refundSource] }); renderPage(request, "/finance?date=2026-09-21&tab=transactions"); fireEvent.click(await screen.findByRole("button", { name: /餐饮.*晚餐/ })); expect(await screen.findByText("原支出：¥100.00")).toBeTruthy(); expect(screen.getByText("已退款：¥100.00")).toBeTruthy(); expect(screen.getByText("剩余可退款：¥0.00")).toBeTruthy(); expect((screen.getByRole("button", { name: "退款" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("previews credit repayment before and after using the same transfer form", async () => {
    const request = requestFor({ accounts: [bank, credit] }); renderPage(request, "/finance?date=2026-09-21", "transfer"); fireEvent.change(await screen.findByLabelText("操作意图"), { target: { value: "repay" } }); fireEvent.change(screen.getByLabelText("转入账户"), { target: { value: "11" } }); fireEvent.change(screen.getByLabelText("转账金额"), { target: { value: "80.00" } }); expect(await screen.findByText("当前：欠款 ¥100.00")).toBeTruthy(); expect(screen.getByText("还款后：欠款 ¥20.00")).toBeTruthy(); expect(screen.getByRole("button", { name: "确认还款" })).toBeTruthy();
  });

  it.each([
    { balanceCents: "-10000", amount: "80.00", expected: "还款后：欠款 ¥20.00" },
    { balanceCents: "-10000", amount: "100.00", expected: "还款后：已结清" },
    { balanceCents: "0", amount: "80.00", expected: "还款后：预存 ¥80.00" },
    { balanceCents: "-10000", amount: "120.00", expected: "还款后：预存 ¥20.00" }
  ])("uses the projected signed CREDIT balance for repayment label ($balanceCents + $amount)", async ({ balanceCents, amount, expected }) => {
    const target = { ...credit, balanceCents }; const request = requestFor({ accounts: [bank, target] }); renderPage(request, "/finance?date=2026-09-21", "transfer"); fireEvent.change(await screen.findByLabelText("操作意图"), { target: { value: "repay" } }); fireEvent.change(screen.getByLabelText("转入账户"), { target: { value: "11" } }); fireEvent.change(screen.getByLabelText("转账金额"), { target: { value: amount } }); expect(await screen.findByText(expected)).toBeTruthy();
  });

  it("labels a negative CREDIT balance as debt", async () => {
    renderPage(requestFor({ accounts: [credit], overview: overview({ totalAssetsCents: "0", totalLiabilitiesCents: "10000", netWorthCents: "-10000", accounts: [credit] }) })); expect(await screen.findByText("欠款 ¥100.00")).toBeTruthy(); expect(screen.getAllByText("¥100.00").length).toBeGreaterThan(0);
  });

  it("preserves a failed expense draft for correction and retry", async () => {
    const onError = vi.fn(); const request = requestFor({ mutate: (path) => { if (path === "/api/finance/expenses") throw new Error("network unavailable"); return {}; } }); renderPage(request, undefined, "expense", onError);
    const input = await screen.findByLabelText("金额"); fireEvent.change(input, { target: { value: "12.34" } }); fireEvent.click(screen.getByRole("button", { name: "保存支出" }));
    expect((await screen.findByRole("alert")).textContent).toContain("network unavailable"); expect((screen.getByLabelText("金额") as HTMLInputElement).value).toBe("12.34"); expect(onError).toHaveBeenCalled();
  });

  it("keeps the account editor open after a 409 instead of overwriting", async () => {
    const request = requestFor({ mutate: (path) => { if (path === "/api/finance/accounts/10") throw new Error("finance account version conflict"); return {}; } }); renderPage(request); fireEvent.click(await screen.findByRole("button", { name: "账户" })); fireEvent.click(await screen.findByRole("button", { name: "编辑 工资卡" }));
    const name = screen.getByLabelText("账户名称"); fireEvent.change(name, { target: { value: "新版工资卡" } }); fireEvent.click(screen.getByRole("button", { name: "保存" })); await waitFor(() => expect((screen.getByLabelText("账户名称") as HTMLInputElement).value).toBe("新版工资卡"));
  });

  it("filters transactions and opens immutable posted detail", async () => {
    const request = requestFor({ transactions: [transaction] }); renderPage(request, "/finance?date=2026-09-21&tab=transactions"); await screen.findByRole("button", { name: /餐饮.*晚餐/ }); fireEvent.change(screen.getByLabelText("流水备注关键词"), { target: { value: "晚餐" } });
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("keyword=%E6%99%9A%E9%A4%90"))); fireEvent.click(await screen.findByRole("button", { name: /餐饮.*晚餐/ })); expect(await screen.findByText(/原始流水仍保留/)).toBeTruthy();
  });

  it("keeps Finance categories independent and exposes disable controls", async () => {
    renderPage(requestFor()); fireEvent.click(await screen.findByRole("button", { name: "账户" })); expect(await screen.findByText("收支分类")).toBeTruthy(); expect(screen.getByLabelText("新财务分类")).toBeTruthy(); expect(screen.getAllByRole("button", { name: "停用" }).length).toBe(2);
  });

  it("wires Finance into the existing route and unified mobile Quick Action", () => {
    const shell = readFileSync(resolve(process.cwd(), "src/app/shell/index.tsx"), "utf8"); const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(shell).toContain('<Route path="/finance"'); expect(shell).toContain("记一笔支出"); expect(shell).toContain("记一笔收入"); expect(shell.match(/className="quick-action"/g)).toHaveLength(1);
    expect(css).toContain(".finance-dialog"); expect(css).toContain("max-height: calc(100dvh - 16px - var(--safe-bottom))"); expect(css).toContain("grid-template-columns: minmax(0,1fr)");
    expect(css).toContain(".finance-head-actions > .ui-button { display: none; }"); expect(css).toContain("--mobile-floating-action-size: 48px"); expect(css).toContain("var(--mobile-floating-action-gap)");
    expect(css).toContain(".finance-occurrence-list article > div:last-child .ui-button { width: 100%; white-space: nowrap; }"); expect(css).toContain(".finance-prepare-label-mobile { display: inline; white-space: nowrap; }");
  });
});
