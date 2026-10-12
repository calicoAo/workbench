import { type FormEvent, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Request } from "../../app/api";
import { Button, IconButton } from "../../shared/ui";
import { accountBalanceLabel, accountTypeLabel, decimalToCents, type FinanceAccount, type FinanceCategory } from "./model";
import { financeErrorMessage } from "./error";
import { tx } from "../../app/i18n";

export type TransferIntent = "transfer" | "borrow" | "repay";

export function TransferDialog({ date, request, accounts, categories, initialIntent = "transfer", initialAccountId, hidden = false, onClose, onSaved, onError }: { date: string; request: Request; accounts: FinanceAccount[]; categories: FinanceCategory[]; initialIntent?: TransferIntent; initialAccountId?: number; hidden?: boolean; onClose: () => void; onSaved: () => Promise<void>; onError: (message: string, title?: string) => void }) {
  const availableAccounts = accounts.filter((item) => !item.archivedAt);
  const feeCategories = categories.filter((item) => item.kind === "EXPENSE" && item.enabled);
  const [intent, setIntent] = useState(initialIntent);
  const sources = availableAccounts.filter((item) => eligible(item, intent, "source"));
  const targets = availableAccounts.filter((item) => eligible(item, intent, "target"));
  const [draft, setDraft] = useState(() => {
    const source = initialIntent === "borrow" && initialAccountId !== undefined ? sources.find((item) => item.id === initialAccountId) : sources[0];
    const target = initialIntent === "repay" && initialAccountId !== undefined ? targets.find((item) => item.id === initialAccountId) : targets.find((item) => item.id !== source?.id);
    return { sourceAccountId: String(source?.id ?? ""), targetAccountId: String(target?.id ?? ""), amount: "", feeAmount: "", feeCategoryId: String(feeCategories[0]?.id ?? ""), occurredDate: date, occurredTime: nowTime(), note: "" };
  });
  const [pending, setPending] = useState(false); const [inlineError, setInlineError] = useState<string | null>(null);
  const receipt = useRef<{ payload: string; operationId: string } | null>(null);
  const source = sources.find((item) => String(item.id) === draft.sourceAccountId);
  const target = targets.find((item) => String(item.id) === draft.targetAccountId);
  const selectionError = !source || !target ? tx("请选择符合当前操作的有效账户") : source.id === target.id ? tx("转出和转入账户必须不同") : null;
  const amount = previewCents(draft.amount); const fee = draft.feeAmount.trim() ? previewCents(draft.feeAmount) : 0n;
  const canPreview = !selectionError && amount !== null && amount > 0n && fee !== null && fee >= 0n;
  const title = intent === "borrow" ? tx("借入") : intent === "repay" ? tx("还款") : tx("普通转账");
  const afterLabel = intent === "borrow" ? "借入后：{value0}" : intent === "repay" ? "还款后：{value0}" : "转账后：{value0}";
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending) return; setPending(true); setInlineError(null);
    try {
      if (selectionError) throw new Error(selectionError);
      if (source?.currency !== "CNY" || target?.currency !== "CNY") throw new Error(tx("转账仅支持 CNY 账户"));
      const amountCents = decimalToCents(draft.amount); if (BigInt(amountCents) <= 0n) throw new Error(tx("金额必须大于 0"));
      const feeAmountCents = draft.feeAmount.trim() ? decimalToCents(draft.feeAmount) : undefined;
      if (feeAmountCents !== undefined && BigInt(feeAmountCents) <= 0n) throw new Error(tx("手续费必须大于 0"));
      const command = { sourceAccountId: Number(draft.sourceAccountId), targetAccountId: Number(draft.targetAccountId), amountCents, ...(feeAmountCents ? { feeAmountCents, feeCategoryId: Number(draft.feeCategoryId) } : {}), occurredDate: draft.occurredDate, occurredTime: draft.occurredTime, note: draft.note.trim() || null };
      const payload = JSON.stringify(command);
      // Retrying an unchanged command reuses its receipt, including an uncertain network response.
      if (receipt.current?.payload !== payload) receipt.current = { payload, operationId: crypto.randomUUID() };
      await request("/api/finance/transfers", { method: "POST", body: JSON.stringify({ operationId: receipt.current.operationId, ...command }) });
      await onSaved(); onClose();
    } catch (error) { const value = financeErrorMessage(error); setInlineError(value); onError(value, tx("转账没有保存")); }
    finally { setPending(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="time-modal finance-dialog finance-record-dialog finance-transfer-dialog" onSubmit={submit}>
    <header><div><p className="route-eyebrow">{tx("账户之间的原子转移")}</p><h2>{title}</h2></div><IconButton label={tx("关闭")} type="button" onClick={onClose}><X size={17} /></IconButton></header>
    <label>{tx("操作意图")}<select className="field" value={intent} onChange={(event) => { setIntent(event.target.value as TransferIntent); setInlineError(null); }}><option value="transfer">{tx("普通转账")}</option><option value="borrow">{tx("借入")}</option><option value="repay">{tx("还款")}</option></select></label>
    <p className="settings-note">{intent === "borrow" ? tx("从负债账户转入资产账户；预存会先减少，再形成欠款。") : intent === "repay" ? tx("从资产账户转入负债账户；超过欠款的金额成为预存。") : tx("选择转出和转入账户；信用账户之间或预存提取也使用普通转账。")}</p>
    <p className="settings-note">{tx("本金转账不计入月收入或支出，手续费单独计入支出。")}</p>
    <div className="finance-form-grid"><label>{tx("转出账户")}<select required className="field" value={source ? draft.sourceAccountId : ""} onChange={(event) => setDraft({ ...draft, sourceAccountId: event.target.value })}><option value="" disabled>{tx("请选择账户")}</option>{sources.map((item) => <option value={item.id} key={item.id}>{item.name} · {tx(accountTypeLabel[item.type])}</option>)}</select></label><label>{tx("转入账户")}<select required className="field" value={target ? draft.targetAccountId : ""} onChange={(event) => setDraft({ ...draft, targetAccountId: event.target.value })}><option value="" disabled>{tx("请选择账户")}</option>{targets.map((item) => <option value={item.id} key={item.id}>{item.name} · {tx(accountTypeLabel[item.type])}</option>)}</select></label></div>
    {selectionError ? <p className="notes-error" role="alert">{selectionError}</p> : null}
    <label className="finance-amount-field"><span>{tx("转账金额（元）")}</span><div><b>¥</b><input autoFocus required inputMode="decimal" aria-label={tx("转账金额")} placeholder="0.00" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></div></label>
    <div className="finance-form-grid"><label>{tx("手续费（元，可选）")}<input className="field" inputMode="decimal" aria-label={tx("手续费")} placeholder="0.00" value={draft.feeAmount} onChange={(event) => setDraft({ ...draft, feeAmount: event.target.value })} /></label><label>{tx("手续费分类")}<select className="field" aria-label={tx("手续费分类")} disabled={fee === null || fee <= 0n} value={draft.feeCategoryId} onChange={(event) => setDraft({ ...draft, feeCategoryId: event.target.value })}>{feeCategories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
    <div className="finance-form-grid"><label>{tx("发生日期")}<input required className="field" type="date" value={draft.occurredDate} onChange={(event) => setDraft({ ...draft, occurredDate: event.target.value })} /></label><label>{tx("发生时间")}<input required className="field" type="time" value={draft.occurredTime} onChange={(event) => setDraft({ ...draft, occurredTime: event.target.value })} /></label></div><label>{tx("备注")}<input className="field" maxLength={500} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
    {source && target && !selectionError ? <section className="finance-repayment-preview" aria-label={tx("余额预览")}>
      {[{ account: source, delta: -(amount ?? 0n) - (fee ?? 0n) }, { account: target, delta: amount ?? 0n }].map(({ account, delta }) => <div key={account.id}><b>{account.name}</b><p>{tx("当前：{value0}", { value0: accountBalanceLabel(account, hidden) })}</p>{canPreview ? <strong>{tx(afterLabel, { value0: accountBalanceLabel({ ...account, balanceCents: (BigInt(account.balanceCents) + delta).toString() }, hidden) })}</strong> : null}</div>)}
      <small>{tx("预览仅供确认，保存后以账本返回的余额为准。")}</small>
    </section> : null}
    {inlineError ? <p className="notes-error" role="alert">{inlineError}</p> : null}<footer><Button type="button" onClick={onClose}>{tx("取消")}</Button><Button variant="primary" loading={pending} disabled={!!selectionError} type="submit">{intent === "borrow" ? tx("确认借入") : intent === "repay" ? tx("确认还款") : tx("保存转账")}</Button></footer>
  </form></div>;
}

function eligible(account: FinanceAccount, intent: TransferIntent, side: "source" | "target") {
  if (intent === "transfer") return true;
  const creditSide = intent === "borrow" ? "source" : "target";
  return side === creditSide ? account.type === "CREDIT" : account.type !== "CREDIT";
}
function previewCents(value: string) { try { return value.trim() ? BigInt(decimalToCents(value)) : null; } catch { return null; } }
function nowTime() { const now = new Date(); return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`; }
