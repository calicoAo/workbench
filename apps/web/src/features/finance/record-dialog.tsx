import { type FormEvent, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { Request } from "../../app/api";
import { Button, IconButton } from "../../shared/ui";
import {
  accountTypeLabel,
  decimalToCents,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceCategoryKind,
} from "./model";
import { tx } from "../../app/i18n";

export function RecordDialog({
  kind,
  date,
  request,
  accounts,
  categories,
  onClose,
  onSaved,
  onError,
}: {
  kind: FinanceCategoryKind;
  date: string;
  request: Request;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const availableCategories = categories.filter(
    (item) => item.kind === kind && item.enabled,
  );
  const availableAccounts = accounts.filter((item) => !item.archivedAt);
  const [draft, setDraft] = useState({
    amount: "",
    categoryId: String(availableCategories[0]?.id ?? ""),
    accountId: String(availableAccounts[0]?.id ?? ""),
    occurredDate: date,
    occurredTime: nowTime(),
    note: "",
  });
  const [advanced, setAdvanced] = useState(false);
  const [pending, setPending] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setInlineError(null);
    try {
      const amountCents = decimalToCents(draft.amount);
      if (BigInt(amountCents) <= 0n) throw new Error(tx("金额必须大于 0"));
      await request(
        kind === "EXPENSE" ? "/api/finance/expenses" : "/api/finance/income",
        {
          method: "POST",
          body: JSON.stringify({
            operationId: crypto.randomUUID(),
            accountId: Number(draft.accountId),
            categoryId: Number(draft.categoryId),
            amountCents,
            occurredDate: draft.occurredDate,
            occurredTime: draft.occurredTime,
            note: draft.note.trim() || null,
          }),
        },
      );
      await onSaved();
      onClose();
    } catch (error) {
      const value = message(error);
      setInlineError(value);
      onError(value, kind === "EXPENSE" ? tx("支出没有保存") : tx("收入没有保存"));
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="time-modal finance-dialog finance-record-dialog"
        onSubmit={submit}
      >
        <header>
          <div>
            <p className="route-eyebrow">{tx("快速记账")}</p>
            <h2>{kind === "EXPENSE" ? tx("记一笔支出") : tx("记一笔收入")}</h2>
          </div>
          <IconButton label={tx("关闭")} type="button" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        <label className="finance-amount-field">
          <span>{tx("金额（元）")}</span>
          <div>
            <b>¥</b>
            <input
              autoFocus
              required
              inputMode="decimal"
              aria-label={tx("金额")}
              placeholder="0.00"
              value={draft.amount}
              onChange={(event) =>
                setDraft({ ...draft, amount: event.target.value })
              }
            />
          </div>
        </label>
        <div className="finance-record-primary">
          <label>{tx("分类")}<select
              required
              className="field"
              aria-label={tx("财务分类")}
              value={draft.categoryId}
              onChange={(event) =>
                setDraft({ ...draft, categoryId: event.target.value })
              }
            >
              <option value="" disabled>{tx("选择分类")}</option>
              {availableCategories.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>{tx("账户")}<select
              required
              className="field"
              aria-label={tx("财务账户")}
              value={draft.accountId}
              onChange={(event) =>
                setDraft({ ...draft, accountId: event.target.value })
              }
            >
              <option value="" disabled>{tx("选择账户")}</option>
              {availableAccounts.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · {tx(accountTypeLabel[item.type])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="finance-advanced-toggle"
          type="button"
          aria-expanded={advanced}
          onClick={() => setAdvanced((value) => !value)}
        >{tx("日期、时间与备注")}<ChevronDown size={15} />
        </button>
        {advanced ? (
          <div className="finance-advanced">
            <div className="finance-form-grid">
              <label>{tx("发生日期")}<input
                  required
                  className="field"
                  type="date"
                  value={draft.occurredDate}
                  onChange={(event) =>
                    setDraft({ ...draft, occurredDate: event.target.value })
                  }
                />
              </label>
              <label>{tx("发生时间")}<input
                  required
                  className="field"
                  type="time"
                  value={draft.occurredTime}
                  onChange={(event) =>
                    setDraft({ ...draft, occurredTime: event.target.value })
                  }
                />
              </label>
            </div>
            <label>{tx("备注")}<input
                className="field"
                maxLength={500}
                value={draft.note}
                onChange={(event) =>
                  setDraft({ ...draft, note: event.target.value })
                }
              />
            </label>
          </div>
        ) : null}
        {inlineError ? (
          <p className="notes-error" role="alert">
            {inlineError}
          </p>
        ) : null}
        {!availableAccounts.length || !availableCategories.length ? (
          <p className="notes-error">{tx("请先创建可用账户并启用对应分类。")}</p>
        ) : null}
        <footer>
          <Button type="button" onClick={onClose}>{tx("取消")}</Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!availableAccounts.length || !availableCategories.length}
            type="submit"
          >
            {tx("保存")}{kind === "EXPENSE" ? tx("支出") : tx("收入")}
          </Button>
        </footer>
      </form>
    </div>
  );
}

function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
