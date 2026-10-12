// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { AccountDialog } from "./account-dialog";
import { Accounts } from "./accounts";
import { Overview } from "./overview";
import type { FinanceAccount, FinanceAccountType } from "./model";

afterEach(cleanup);
const account: FinanceAccount = { id: 1, name: "个人借款", type: "CREDIT", currency: "CNY", balanceCents: "-320000", openingDate: "2026-10-01", archivedAt: null, includeInOverview: true, version: 3 };
function list(accounts: FinanceAccount[], hidden = false) {
  return render(<Accounts accounts={accounts} categories={[]} hidden={hidden} request={vi.fn() as Request} onCreate={vi.fn()} onEdit={vi.fn()} onChanged={vi.fn()} onError={vi.fn()} />);
}
function editor(existing: FinanceAccount | null = null) {
  const request = vi.fn(async () => ({ id: 1, version: 4 })) as Request;
  const onError = vi.fn();
  render(<AccountDialog account={existing} date="2026-10-01" hidden={false} request={request} onSaved={vi.fn()} onClose={vi.fn()} onError={onError} />);
  return { request, onError };
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function save(request: Request) {
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  return JSON.parse(vi.mocked(request).mock.calls[0][1]!.body as string);
}

describe("LIABILITY-ACCOUNT-SURFACE", () => {
  it("groups active accounts by type independently of sign/inclusion, and archives only in Archived", () => {
    list([
      ...(["CASH", "BANK", "PAYMENT"] as const).map((type, index) => ({ ...account, id: index + 2, name: type, type, includeInOverview: false, balanceCents: "-100" })),
      account,
      { ...account, id: 5, name: "已还清信用卡", balanceCents: "0", includeInOverview: false },
      { ...account, id: 6, name: "溢缴信用卡", balanceCents: "20000" },
      { ...account, id: 7, name: "归档借款", archivedAt: "2026-10-01T12:00:00Z" },
      { ...account, id: 8, name: "归档银行卡", type: "BANK", archivedAt: "2026-10-01T12:00:00Z" },
    ]);
    const assets = within(screen.getByRole("region", { name: "资产账户" }));
    const liabilities = within(screen.getByRole("region", { name: "负债账户" }));
    for (const type of ["CASH", "BANK", "PAYMENT"]) expect(assets.getByText(type)).toBeTruthy();
    expect(assets.getAllByText("不计入总览")).toHaveLength(3);
    for (const name of ["个人借款", "已还清信用卡", "溢缴信用卡"]) expect(liabilities.getByText(name)).toBeTruthy();
    expect(liabilities.getByText("不计入总览")).toBeTruthy();
    expect(screen.queryByText("归档借款")).toBeNull();
    fireEvent.click(screen.getByLabelText("显示已归档"));
    const archived = within(screen.getByRole("region", { name: "已归档账户" }));
    for (const name of ["归档借款", "归档银行卡"]) {
      expect(archived.getByText(name)).toBeTruthy();
      expect(assets.queryByText(name)).toBeNull();
      expect(liabilities.queryByText(name)).toBeNull();
    }
    expect(liabilities.getByText("信用卡、借款等统一作为负债账户管理。")).toBeTruthy();
  });

  it.each([
    ["3200", "-320000"], ["3200.01", "-320001"], ["0", "0"],
    ["90071992547409.91", "-9007199254740991"],
  ])("converts CREDIT owed yuan %s once to signed cents %s", async (input, expected) => {
    const { request } = editor();
    change("账户名称", "信用卡"); change("账户类型", "CREDIT"); change("当前欠款", input);
    expect(screen.getByText("输入当前欠款金额即可，无需填写负数。")).toBeTruthy();
    expect(screen.queryByLabelText("期初余额")).toBeNull();
    const body = await save(request);
    expect(body).toMatchObject({ type: "CREDIT", openingBalanceCents: expected, includeInOverview: true });
    expect(request).toHaveBeenCalledWith("/api/finance/accounts", expect.objectContaining({ method: "POST" }));
  });

  it.each(["CASH", "BANK", "PAYMENT"] as const)("preserves signed %s opening semantics", async (type) => {
    const { request } = editor();
    change("账户名称", type); change("账户类型", type); change("期初余额", "-88.36");
    expect((await save(request)).openingBalanceCents).toBe("-8836");
  });

  it.each(["CASH", "BANK", "PAYMENT"] as const)("preserves positive %s opening semantics", async (type) => {
    const { request } = editor();
    change("账户名称", type); change("账户类型", type); change("期初余额", "88.36");
    expect((await save(request)).openingBalanceCents).toBe("8836");
  });

  it("resets only the amount draft when switching asset/liability types and uses the final type's conversion", async () => {
    const { request } = editor();
    change("账户名称", "类型切换"); change("期初余额", "100.50"); change("账户类型", "CREDIT");
    expect((screen.getByLabelText("当前欠款") as HTMLInputElement).value).toBe("0.00");
    change("当前欠款", "3200"); change("账户类型", "PAYMENT");
    expect((screen.getByLabelText("期初余额") as HTMLInputElement).value).toBe("0.00");
    expect(screen.queryByText("输入当前欠款金额即可，无需填写负数。")).toBeNull();
    expect((screen.getByLabelText("账户名称") as HTMLInputElement).value).toBe("类型切换");
    change("期初余额", "12.34");
    expect(await save(request)).toMatchObject({ type: "PAYMENT", openingBalanceCents: "1234" });
  });

  it.each(["-3200", "1.001"])("rejects invalid owed input %s and permits correction", async (input) => {
    const { request, onError } = editor();
    change("账户名称", "信用卡"); change("账户类型", "CREDIT"); change("当前欠款", input);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(request).not.toHaveBeenCalled();
    change("当前欠款", "12.34");
    expect((await save(request)).openingBalanceCents).toBe("-1234");
  });

  it.each([
    ["-320000", "欠款 ¥3,200.00"], ["0", "已结清"], ["12500", "预存 ¥125.00"],
  ])("presents CREDIT %s consistently on account list, editor and Overview", (balanceCents, expected) => {
    const item = { ...account, balanceCents };
    const view = list([item]); expect(screen.getByText(expected)).toBeTruthy(); view.unmount();
    const detail = render(<AccountDialog account={item} date="2026-10-01" hidden={false} request={vi.fn() as Request} onSaved={vi.fn()} onClose={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText(expected)).toBeTruthy(); detail.unmount();
    const overview = render(<Overview data={{ currency: "CNY", month: "2026-10", recordTimezone: "Asia/Shanghai", totalAssetsCents: "77777", totalLiabilitiesCents: "88888", netWorthCents: "-11111", monthlyIncomeCents: "0", monthlyExpenseCents: "0", accountCount: 1, accounts: [item], recentTransactions: [] }} hidden={false} onAccount={vi.fn()} />);
    expect(screen.getByText(expected)).toBeTruthy();
    const totals = within(overview.container.querySelector(".finance-worth")!);
    expect(totals.getByText("¥777.77")).toBeTruthy(); expect(totals.getByText("¥888.88")).toBeTruthy();
  });

  it.each([
    ["CREDIT", "-320000"], ["CREDIT", "0"], ["CREDIT", "12500"], ["BANK", "-1000"],
  ] as const)("edits %s %s metadata without sending any balance/type/opening change", async (type: FinanceAccountType, balanceCents) => {
    const original = { ...account, type, balanceCents };
    const { request } = editor(original);
    expect((screen.getByLabelText("账户类型") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByLabelText("当前欠款")).toBeNull(); expect(screen.queryByLabelText("期初余额")).toBeNull();
    change("账户名称", "更名"); fireEvent.click(screen.getByLabelText("计入总览净值"));
    expect(await save(request)).toEqual({ expectedVersion: 3, name: "更名", includeInOverview: false });
    expect(request).toHaveBeenCalledWith("/api/finance/accounts/1", expect.objectContaining({ method: "PUT" }));
    expect(original.balanceCents).toBe(balanceCents);
  });

  it("preserves privacy masking for owed and prepaid amounts", () => {
    list([account, { ...account, id: 2, balanceCents: "12500" }], true);
    expect(screen.getByText("欠款 ¥••••")).toBeTruthy(); expect(screen.getByText("预存 ¥••••")).toBeTruthy();
    expect(screen.queryByText(/3,200|125\.00/)).toBeNull();
  });
});
