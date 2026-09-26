import { type FormEvent, useState } from "react";
import { X } from "lucide-react";
import type { Request } from "../../app/api";
import { Button, IconButton } from "../../shared/ui";
import { accountTypeLabel, decimalToCents, type FinanceAccount, type FinanceCategory } from "./model";
import { tx } from "../../app/i18n";

export function TransferDialog({ date, request, accounts, categories, onClose, onSaved, onError }: { date: string; request: Request; accounts: FinanceAccount[]; categories: FinanceCategory[]; onClose: () => void; onSaved: () => Promise<void>; onError: (message: string, title?: string) => void }) {
  const availableAccounts = accounts.filter((item) => !item.archivedAt);
  const feeCategories = categories.filter((item) => item.kind === "EXPENSE" && item.enabled);
  const [draft, setDraft] = useState({ sourceAccountId: String(availableAccounts[0]?.id ?? ""), targetAccountId: String(availableAccounts[1]?.id ?? availableAccounts[0]?.id ?? ""), amount: "", feeAmount: "", feeCategoryId: String(feeCategories[0]?.id ?? ""), occurredDate: date, occurredTime: nowTime(), note: "" });
  const [pending, setPending] = useState(false); const [inlineError, setInlineError] = useState<string | null>(null);
  const targetAccount = availableAccounts.find((item) => String(item.id) === draft.targetAccountId);
  let previewAmount = 0n; try { previewAmount = draft.amount.trim() ? BigInt(decimalToCents(draft.amount)) : 0n; } catch { previewAmount = 0n; }
  let feePreview = 0n; try { feePreview = draft.feeAmount.trim() ? BigInt(decimalToCents(draft.feeAmount)) : 0n; } catch { feePreview = 0n; }
  const hasPositiveFee = feePreview > 0n;
  const isRepayment = targetAccount?.type === "CREDIT" && previewAmount > 0n;
  const repaymentAfter = targetAccount?.type === "CREDIT" ? BigInt(targetAccount.balanceCents) + previewAmount : null;
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setInlineError(null);
    try {
      const amountCents = decimalToCents(draft.amount); if (BigInt(amountCents) <= 0n) throw new Error(tx("金额必须大于 0"));
      const feeAmountCents = draft.feeAmount.trim() ? decimalToCents(draft.feeAmount) : undefined;
      if (draft.sourceAccountId === draft.targetAccountId) throw new Error(tx("转出和转入账户必须不同"));
      await request("/api/finance/transfers", { method: "POST", body: JSON.stringify({ operationId: crypto.randomUUID(), sourceAccountId: Number(draft.sourceAccountId), targetAccountId: Number(draft.targetAccountId), amountCents, ...(feeAmountCents ? { feeAmountCents, feeCategoryId: Number(draft.feeCategoryId) } : {}), occurredDate: draft.occurredDate, occurredTime: draft.occurredTime, note: draft.note.trim() || null }) });
      await onSaved(); onClose();
    } catch (error) { const value = message(error); setInlineError(value); onError(value, tx("转账没有保存")); }
    finally { setPending(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="time-modal finance-dialog finance-record-dialog" onSubmit={submit}>
    <header><div><p className="route-eyebrow">{isRepayment ? tx("信用账户还款") : tx("账户之间的原子转移")}</p><h2>{isRepayment ? tx("信用账户还款") : tx("转账")}</h2></div><IconButton label={tx("关闭")} type="button" onClick={onClose}><X size={17} /></IconButton></header>
    <div className="finance-form-grid"><label>{tx("转出账户")}<select required className="field" value={draft.sourceAccountId} onChange={(event) => setDraft({ ...draft, sourceAccountId: event.target.value })}>{availableAccounts.map((item) => <option value={item.id} key={item.id}>{item.name} · {tx(accountTypeLabel[item.type])}</option>)}</select></label><label>{tx("转入账户")}<select required className="field" value={draft.targetAccountId} onChange={(event) => setDraft({ ...draft, targetAccountId: event.target.value })}>{availableAccounts.map((item) => <option value={item.id} key={item.id}>{item.name} · {tx(accountTypeLabel[item.type])}</option>)}</select></label></div>
    <label className="finance-amount-field"><span>{tx("转账金额（元）")}</span><div><b>¥</b><input autoFocus required inputMode="decimal" aria-label={tx("转账金额")} placeholder="0.00" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></div></label>
    <div className="finance-form-grid"><label>{tx("手续费（元，可选）")}<input className="field" inputMode="decimal" aria-label={tx("手续费")} placeholder="0.00" value={draft.feeAmount} onChange={(event) => setDraft({ ...draft, feeAmount: event.target.value })} /></label><label>{tx("手续费分类")}<select className="field" aria-label={tx("手续费分类")} disabled={!hasPositiveFee} value={draft.feeCategoryId} onChange={(event) => setDraft({ ...draft, feeCategoryId: event.target.value })}>{feeCategories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
    <div className="finance-form-grid"><label>{tx("发生日期")}<input required className="field" type="date" value={draft.occurredDate} onChange={(event) => setDraft({ ...draft, occurredDate: event.target.value })} /></label><label>{tx("发生时间")}<input required className="field" type="time" value={draft.occurredTime} onChange={(event) => setDraft({ ...draft, occurredTime: event.target.value })} /></label></div><label>{tx("备注")}<input className="field" maxLength={500} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
    {isRepayment ? <section className="finance-repayment-preview" aria-label={tx("还款预览")}><span>{tx("当前欠款：")}{yuanDebt(targetAccount?.balanceCents ?? "0")}</span><span>{tx("本次还款：")}{yuanDebt(previewAmount.toString())}</span><strong>{repaymentLabel(repaymentAfter ?? 0n)}：{yuanDebt(repaymentAfter?.toString() ?? "0")}</strong></section> : null}
    {inlineError ? <p className="notes-error" role="alert">{inlineError}</p> : null}<footer><Button type="button" onClick={onClose}>{tx("取消")}</Button><Button variant="primary" loading={pending} disabled={availableAccounts.length < 2} type="submit">{isRepayment ? tx("确认还款") : tx("保存转账")}</Button></footer>
  </form></div>;
}

function nowTime() { const now = new Date(); return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`; }
function message(error: unknown) { return error instanceof Error ? error.message : tx("操作失败"); }
function yuanDebt(cents: string) { const value = BigInt(cents); return `¥${(value < 0n ? -value : value) / 100n}.${((value < 0n ? -value : value) % 100n).toString().padStart(2, "0")}`; }
function repaymentLabel(projectedBalance: bigint) { return projectedBalance > 0n ? "还款后余额" : "还款后欠款"; }
