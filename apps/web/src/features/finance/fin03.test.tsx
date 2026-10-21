// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancePage } from ".";
import type { Request } from "../../app/api";
import { Recurring } from "./recurring";

afterEach(cleanup);

const base = { id: 1, name: "主账户", type: "BANK" as const, currency: "CNY" as const, includeInOverview: true, openingDate: "2026-09-01", archivedAt: null, version: 1, balanceCents: "10000" };
const category = { id: 2, kind: "EXPENSE" as const, name: "餐饮", sortOrder: 1, enabled: true, version: 1 };
function request(): Request { return vi.fn(async (path: string, init?: RequestInit) => { if (init?.method && init.method !== "GET") return {}; if (path.startsWith("/api/finance/overview")) return { currency: "CNY", month: "2026-09", recordTimezone: "Asia/Shanghai", totalAssetsCents: "10000", totalLiabilitiesCents: "0", netWorthCents: "10000", monthlyIncomeCents: "0", monthlyExpenseCents: "0", accountCount: 1, accounts: [base], recentTransactions: [] }; if (path.startsWith("/api/finance/accounts")) return [base]; if (path.startsWith("/api/finance/categories")) return [category]; if (path.startsWith("/api/finance/budgets")) return [{ id: 3, budgetMonth: "2026-09", categoryId: 2, categoryName: "餐饮", limitCents: "5000", spentCents: "1200", remainingCents: "3800", version: 1 }]; if (path.startsWith("/api/finance/recurring-templates")) return []; if (path.startsWith("/api/finance/recurring-occurrences")) return []; if (path.startsWith("/api/finance/reports")) return { month: "2026-09", monthly: { incomeCents: "0", expenseCents: "1200", netCashflowCents: "-1200" }, categories: [{ categoryId: 2, categoryName: "餐饮", netExpenseCents: "1200", netRefund: false }], accounts: [{ accountId: 1, accountName: "主账户", startingBalanceCents: "11200", inflowCents: "0", outflowCents: "1200", netChangeCents: "-1200", endingBalanceCents: "10000", reconciled: true }], reconciliation: true }; if (path.startsWith("/api/finance/transactions")) return { items: [], nextCursor: null }; throw new Error(path); }) as Request; }
function renderPage(entry: string) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[entry]}><FinancePage request={request()} userId={1} date="2026-09-21" timezone="Asia/Shanghai" onError={vi.fn()} /></MemoryRouter></QueryClientProvider>); }

describe("FIN-03 Finance surfaces", () => {
  it("renders the budget tab with category spend and remaining amount", async () => { renderPage("/finance?date=2026-09-21&tab=budgets"); expect(await screen.findByText("2026-09 预算")).toBeTruthy(); expect(await screen.findByText(/已用 ¥12.00/)).toBeTruthy(); expect(screen.getByText(/剩余 ¥38.00/)).toBeTruthy(); });
  it("keeps recurring actions explicit and pending occurrences non-posting", async () => { renderPage("/finance?date=2026-09-21&tab=recurring"); expect(await screen.findByText("周期收支")).toBeTruthy(); expect(screen.getByRole("button", { name: "准备本月发生项" })).toBeTruthy(); expect(screen.getByText(/不会自动影响余额/)).toBeTruthy(); expect(screen.queryByText("Explicit preparation and confirmation")).toBeNull(); });
  it("creates a recurring template with a local occurrence time", async () => {
    const request = vi.fn(async () => ({ id: 3, version: 1 })) as Request;
    render(<Recurring request={request} date="2026-10-21" accounts={[base]} categories={[category]} templates={[]} occurrences={[]} onChanged={vi.fn(async () => undefined)} onError={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "网费" } });
    fireEvent.change(screen.getByLabelText("金额"), { target: { value: "99" } });
    fireEvent.change(screen.getByLabelText("账户"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("分类"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("发生时间提醒"), { target: { value: "09:45" } });
    fireEvent.click(screen.getByRole("button", { name: "创建模板" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/recurring-templates", expect.objectContaining({ method: "POST", body: expect.stringContaining('"scheduledTime":"09:45"') })));
  });
  it("edits a template time and can disable the recurring reminder", async () => {
    const template = { id: 9, type: "EXPENSE" as const, name: "网费", amountCents: "9900", accountId: 1, accountName: "主账户", categoryId: 2, categoryName: "餐饮", frequency: "MONTHLY" as const, scheduleValue: 21, scheduledTime: "09:00", startDate: "2026-09-01", endDate: null, enabled: true, version: 1 };
    const request = vi.fn(async () => ({ id: 9, version: 2 })) as Request;
    render(<Recurring request={request} date="2026-10-21" accounts={[base]} categories={[category]} templates={[template]} occurrences={[]} onChanged={vi.fn(async () => undefined)} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑模板" }));
    fireEvent.change(screen.getByLabelText("发生时间提醒"), { target: { value: "20:15" } });
    fireEvent.click(screen.getByRole("button", { name: "保存模板" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/recurring-templates/9", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"scheduledTime":"20:15"') })));
    fireEvent.click(screen.getByRole("button", { name: "停用模板" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/finance/recurring-templates/9", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"enabled":false') })));
  });
  it("shows and refreshes growth after a recurring occurrence is confirmed", async () => {
    const occurrence = { id: 8, templateId: 9, scheduledDate: "2026-10-21", scheduledTime: "09:00", recordTimezone: "Asia/Shanghai", status: "PENDING" as const, amountCentsSnapshot: "9900", accountIdSnapshot: 1, categoryIdSnapshot: 2, postedTransactionId: null, version: 1, templateName: "网费", type: "EXPENSE" as const, accountName: "主账户", categoryName: "餐饮" };
    const request = vi.fn(async () => ({ reward: { xp: 5, coins: 2, reason: "财务记录" } })) as Request; const onReward = vi.fn(); const onGrowthChanged = vi.fn(async () => undefined);
    render(<Recurring request={request} date="2026-10-21" accounts={[base]} categories={[category]} templates={[]} occurrences={[occurrence]} onChanged={vi.fn(async () => undefined)} onReward={onReward} onGrowthChanged={onGrowthChanged} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "确认入账" }));
    await waitFor(() => expect(onReward).toHaveBeenCalledWith("财务记录", { xp: 5, coins: 2, reason: "财务记录" }));
    expect(onGrowthChanged).toHaveBeenCalledTimes(1);
  });
  it("renders deterministic monthly reconciliation with accessible cashflow and category charts", async () => { renderPage("/finance?date=2026-09-21&tab=reports"); expect(await screen.findByText("2026-09 报表")).toBeTruthy(); expect(screen.getByText("已核对")).toBeTruthy(); expect(screen.getByText("净现金流")).toBeTruthy(); expect(screen.getByRole("heading", { name: "月度收支对比" })).toBeTruthy(); expect(screen.getByRole("heading", { name: "分类支出占比" })).toBeTruthy(); expect(screen.getAllByRole("img")).toHaveLength(2); expect(screen.queryByText("Deterministic read model")).toBeNull(); });
});
