// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { FinancePage } from ".";
import type { Request } from "../../app/api";

const base = { id: 1, name: "主账户", type: "BANK" as const, currency: "CNY" as const, includeInOverview: true, openingDate: "2026-09-01", archivedAt: null, version: 1, balanceCents: "10000" };
const category = { id: 2, kind: "EXPENSE" as const, name: "餐饮", sortOrder: 1, enabled: true, version: 1 };
function request(): Request { return vi.fn(async (path: string, init?: RequestInit) => { if (init?.method && init.method !== "GET") return {}; if (path.startsWith("/api/finance/overview")) return { currency: "CNY", month: "2026-09", recordTimezone: "Asia/Shanghai", totalAssetsCents: "10000", totalLiabilitiesCents: "0", netWorthCents: "10000", monthlyIncomeCents: "0", monthlyExpenseCents: "0", accountCount: 1, accounts: [base], recentTransactions: [] }; if (path.startsWith("/api/finance/accounts")) return [base]; if (path.startsWith("/api/finance/categories")) return [category]; if (path.startsWith("/api/finance/budgets")) return [{ id: 3, budgetMonth: "2026-09", categoryId: 2, categoryName: "餐饮", limitCents: "5000", spentCents: "1200", remainingCents: "3800", version: 1 }]; if (path.startsWith("/api/finance/recurring-templates")) return []; if (path.startsWith("/api/finance/recurring-occurrences")) return []; if (path.startsWith("/api/finance/reports")) return { month: "2026-09", monthly: { incomeCents: "0", expenseCents: "1200", netCashflowCents: "-1200" }, categories: [{ categoryId: 2, categoryName: "餐饮", netExpenseCents: "1200", netRefund: false }], accounts: [{ accountId: 1, accountName: "主账户", startingBalanceCents: "11200", inflowCents: "0", outflowCents: "1200", netChangeCents: "-1200", endingBalanceCents: "10000", reconciled: true }], reconciliation: true }; if (path.startsWith("/api/finance/transactions")) return { items: [], nextCursor: null }; throw new Error(path); }) as Request; }
function renderPage(entry: string) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[entry]}><FinancePage request={request()} userId={1} date="2026-09-21" onError={vi.fn()} /></MemoryRouter></QueryClientProvider>); }

describe("FIN-03 Finance surfaces", () => {
  it("renders the budget tab with category spend and remaining amount", async () => { renderPage("/finance?date=2026-09-21&tab=budgets"); expect(await screen.findByText("2026-09 预算")).toBeTruthy(); expect(await screen.findByText(/已用 ¥12.00/)).toBeTruthy(); expect(screen.getByText(/剩余 ¥38.00/)).toBeTruthy(); });
  it("keeps recurring actions explicit and pending occurrences non-posting", async () => { renderPage("/finance?date=2026-09-21&tab=recurring"); expect(await screen.findByText("周期收支")).toBeTruthy(); expect(screen.getByRole("button", { name: "准备本月发生项" })).toBeTruthy(); expect(screen.getByText(/不会自动影响余额/)).toBeTruthy(); expect(screen.queryByText("Explicit preparation and confirmation")).toBeNull(); });
  it("renders deterministic monthly report reconciliation", async () => { renderPage("/finance?date=2026-09-21&tab=reports"); expect(await screen.findByText("2026-09 报表")).toBeTruthy(); expect(screen.getByText("已核对")).toBeTruthy(); expect(screen.getByText("净现金流")).toBeTruthy(); expect(screen.queryByText("Deterministic read model")).toBeNull(); });
});
