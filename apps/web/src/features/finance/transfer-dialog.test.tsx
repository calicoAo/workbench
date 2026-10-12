// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import type { FinanceAccount } from "./model";
import { TransferDialog, type TransferIntent } from "./transfer-dialog";

afterEach(cleanup);
const bank: FinanceAccount = { id: 10, name: "银行", type: "BANK", currency: "CNY", balanceCents: "500000", includeInOverview: true, archivedAt: null, version: 1, openingDate: "2026-09-01" };
const credit: FinanceAccount = { ...bank, id: 11, name: "借款", type: "CREDIT", balanceCents: "-320000" };
function form(intent: TransferIntent = "transfer", accounts = [bank, credit], hidden = false, request = vi.fn(async () => ({})) as Request) {
  const props = { date: "2026-09-21", request, accounts, categories: [], initialIntent: intent, initialAccountId: credit.id, hidden, onClose: vi.fn(), onSaved: vi.fn(async () => {}), onError: vi.fn() };
  return { ...render(<TransferDialog {...props} />), props, request };
}
function amount(value: string) { fireEvent.change(screen.getByLabelText("转账金额"), { target: { value } }); }
function account(label: string, id: number) { fireEvent.change(screen.getByLabelText(label), { target: { value: String(id) } }); }
function changeIntent(intent: TransferIntent) { fireEvent.change(screen.getByLabelText("操作意图"), { target: { value: intent } }); }

it.each([
  { intent: "borrow" as const, action: "确认借入", source: 11, target: 10, after: "借入后：欠款 ¥3,700.00" },
  { intent: "repay" as const, action: "确认还款", source: 10, target: 11, after: "还款后：欠款 ¥2,700.00" },
])("uses one transfer command with explicit $intent intent and correct defaults", async ({ intent, action, source, target, after }) => {
  const { request, props } = form(intent); amount("500");
  expect(screen.getByText(after)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("备注"), { target: { value: "资金移动" } });
  fireEvent.click(screen.getByRole("button", { name: action }));
  await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  const calls = vi.mocked(request).mock.calls;
  expect(calls).toHaveLength(1); expect(calls[0][0]).toBe("/api/finance/transfers");
  expect(JSON.parse(calls[0][1]!.body as string)).toEqual(expect.objectContaining({ sourceAccountId: source, targetAccountId: target, amountCents: "50000", note: "资金移动" }));
  expect(JSON.parse(calls[0][1]!.body as string)).not.toHaveProperty("intent");
});

it.each([
  { balanceCents: "-50000", value: "500", after: "还款后：已结清" },
  { balanceCents: "-50000", value: "600", after: "还款后：预存 ¥100.00" },
  { balanceCents: "0", value: "600", after: "还款后：预存 ¥600.00" },
  { balanceCents: "10000", value: "500", after: "还款后：预存 ¥600.00" },
])("preserves zero and prepaid balance semantics ($balanceCents + $value)", ({ balanceCents, value, after }) => {
  form("repay", [bank, { ...credit, balanceCents }]); amount(value); expect(screen.getByText(after)).toBeTruthy();
});

it.each([
  { source: credit, target: { ...credit, id: 12, name: "信用卡二" }, expected: "转账后：欠款 ¥3,100.00" },
  { source: { ...credit, balanceCents: "20000" }, target: bank, expected: "转账后：预存 ¥100.00" },
])("keeps generic credit transfers neutral", ({ source, target, expected }) => {
  form("transfer", [source, target]); amount("100");
  expect(screen.getByRole("heading", { name: "普通转账" })).toBeTruthy();
  expect(screen.getByText(expected)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "确认还款" })).toBeNull();
  expect(screen.queryByRole("button", { name: "确认借入" })).toBeNull();
});

it("does not silently replace invalid accounts when intent changes and allows correction", async () => {
  const { request } = form(); amount("50"); changeIntent("borrow");
  expect(screen.getByRole("alert").textContent).toContain("请选择符合当前操作的有效账户");
  expect((screen.getByLabelText("转出账户") as HTMLSelectElement).value).toBe("");
  expect((screen.getByRole("button", { name: "确认借入" }) as HTMLButtonElement).disabled).toBe(true);
  expect(request).not.toHaveBeenCalled(); account("转出账户", 11); account("转入账户", 10);
  fireEvent.click(screen.getByRole("button", { name: "确认借入" })); await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
});

it("keeps an archived or missing selection invalid on refetch; active excluded accounts remain valid", () => {
  const { rerender, props } = form("repay", [{ ...bank, includeInOverview: false }, credit]);
  expect((screen.getByLabelText("转出账户") as HTMLSelectElement).value).toBe("10");
  rerender(<TransferDialog {...props} accounts={[bank, { ...credit, archivedAt: "2026-09-21T12:00:00Z" }]} />);
  expect(within(screen.getByLabelText("转入账户")).queryByRole("option", { name: /借款/ })).toBeNull();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect((screen.getByRole("button", { name: "确认还款" }) as HTMLButtonElement).disabled).toBe(true);
});

it("filters each intent by type, allows another liability and includes all active asset types", () => {
  const another = { ...credit, id: 12, name: "另一笔借款" };
  form("borrow", [bank, credit, another, { ...bank, id: 13, type: "CASH", name: "现金" }, { ...bank, id: 14, type: "PAYMENT", name: "支付账户" }]);
  expect(within(screen.getByLabelText("转出账户")).queryByRole("option", { name: /银行/ })).toBeNull();
  account("转出账户", 12); expect((screen.getByLabelText("转出账户") as HTMLSelectElement).value).toBe("12");
  expect(within(screen.getByLabelText("转入账户")).getAllByRole("option").filter((node) => !(node as HTMLOptionElement).disabled)).toHaveLength(3);
});

it.each(["borrow", "repay"] as const)("does not replace a missing initial %s liability with a different one", (intent) => {
  form(intent, [bank, { ...credit, id: 12, name: "另一笔借款" }]);
  expect((screen.getByLabelText(intent === "borrow" ? "转出账户" : "转入账户") as HTMLSelectElement).value).toBe("");
  expect(screen.getByRole("alert")).toBeTruthy();
  account(intent === "borrow" ? "转出账户" : "转入账户", 12);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("retains failed draft and retries the same command receipt; a correction starts a new command", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("连接失败")).mockRejectedValueOnce(new Error("仍不可用")).mockResolvedValueOnce({ id: 3 }) as Request;
  const { props } = form("repay", [bank, credit], false, request); amount("12.34");
  fireEvent.change(screen.getByLabelText("备注"), { target: { value: "保留草稿" } });
  fireEvent.click(screen.getByRole("button", { name: "确认还款" })); await screen.findByText("连接失败");
  expect(props.onClose).not.toHaveBeenCalled(); expect(props.onSaved).not.toHaveBeenCalled();
  expect((screen.getByLabelText("转账金额") as HTMLInputElement).value).toBe("12.34");
  expect((screen.getByLabelText("备注") as HTMLInputElement).value).toBe("保留草稿");
  fireEvent.click(screen.getByRole("button", { name: "确认还款" })); await screen.findByText("仍不可用");
  amount("20"); fireEvent.click(screen.getByRole("button", { name: "确认还款" })); await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
  const commands = vi.mocked(request).mock.calls.map((call) => JSON.parse(call[1]!.body as string));
  expect(commands[0].operationId).toBe(commands[1].operationId); expect(commands[2].operationId).not.toBe(commands[1].operationId);
});

it("uses exact integer cents and includes a source fee without exposing amounts in privacy mode", () => {
  const { rerender, props } = form("borrow", [bank, { ...credit, balanceCents: "-900719925474099300" }]);
  amount("0.01"); fireEvent.change(screen.getByLabelText("手续费"), { target: { value: "0.02" } });
  expect(screen.getByText("借入后：欠款 ¥9,007,199,254,740,993.03")).toBeTruthy();
  rerender(<TransferDialog {...props} hidden />);
  const preview = screen.getByRole("region", { name: "余额预览" });
  expect(preview.textContent).toContain("欠款 ¥••••"); expect(preview.textContent).not.toContain("993");
  expect(screen.getByLabelText("转账金额")).toBeTruthy();
});
