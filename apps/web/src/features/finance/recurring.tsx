import { type FormEvent, useState } from "react";
import type { Request } from "../../app/api";
import { Button } from "../../shared/ui";
import { decimalToCents, yuan, type FinanceAccount, type FinanceCategory, type FinanceRecurringOccurrence, type FinanceRecurringTemplate } from "./model";
import { financeErrorMessage } from "./error";
import { tx } from "../../app/i18n";

export function Recurring({
  request,
  date,
  accounts,
  categories,
  templates,
  occurrences,
  onChanged,
  onError,
}: {
  request: Request;
  date: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  templates: FinanceRecurringTemplate[];
  occurrences: FinanceRecurringOccurrence[];
  onChanged: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    type: "EXPENSE" as "INCOME" | "EXPENSE",
    amount: "",
    accountId: "",
    categoryId: "",
    frequency: "MONTHLY" as "MONTHLY" | "WEEKLY",
    scheduleValue: "1",
  });
  const [pending, setPending] = useState(false);
  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request("/api/finance/recurring-templates", {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          type: draft.type,
          name: draft.name,
          amountCents: decimalToCents(draft.amount),
          accountId: Number(draft.accountId),
          categoryId: Number(draft.categoryId),
          frequency: draft.frequency,
          scheduleValue: Number(draft.scheduleValue),
          startDate: date,
        }),
      });
      setDraft({ ...draft, name: "", amount: "" });
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), tx("周期模板没有创建"));
    } finally {
      setPending(false);
    }
  }
  async function prepare() {
    try {
      await request("/api/finance/recurring-occurrences/prepare", {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          from: `${date.slice(0, 7)}-01`,
          to: date,
        }),
      });
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), tx("周期发生项没有准备"));
    }
  }
  async function act(
    item: FinanceRecurringOccurrence,
    action: "confirm" | "skip",
  ) {
    try {
      await request(`/api/finance/recurring-occurrences/${item.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          expectedVersion: item.version,
        }),
      });
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), tx("周期发生项操作失败"));
    }
  }
  return (
    <section className="finance-panel finance-recurring-page">
      <header>
        <div>
          <p className="route-eyebrow">{tx("周期计划")}</p>
          <h2>{tx("周期收支")}</h2>
          <p className="finance-recurring-note">{tx("确认入账后会影响真实余额；跳过不会入账。")}</p>
        </div>
        <Button aria-label={tx("准备本月发生项")} onClick={() => void prepare()}>
          <span className="finance-prepare-label-full">{tx("准备本月发生项")}</span>
          <span className="finance-prepare-label-mobile">{tx("准备本月")}</span>
        </Button>
      </header>
      <form className="finance-form-grid" onSubmit={create}>
        <input
          className="field"
          required
          placeholder={tx("模板名称")}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <input
          className="field"
          required
          inputMode="decimal"
          placeholder={tx("金额")}
          value={draft.amount}
          onChange={(event) =>
            setDraft({ ...draft, amount: event.target.value })
          }
        />
        <select
          className="field"
          value={draft.type}
          onChange={(event) =>
            setDraft({
              ...draft,
              type: event.target.value as "INCOME" | "EXPENSE",
            })
          }
        >
          <option value="EXPENSE">{tx("支出")}</option>
          <option value="INCOME">{tx("收入")}</option>
        </select>
        <select
          className="field"
          required
          value={draft.accountId}
          onChange={(event) =>
            setDraft({ ...draft, accountId: event.target.value })
          }
        >
          <option value="">{tx("账户")}</option>
          {accounts
            .filter((item) => !item.archivedAt)
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <select
          className="field"
          required
          value={draft.categoryId}
          onChange={(event) =>
            setDraft({ ...draft, categoryId: event.target.value })
          }
        >
          <option value="">{tx("分类")}</option>
          {categories
            .filter((item) => item.kind === draft.type)
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <select
          className="field"
          value={draft.frequency}
          onChange={(event) =>
            setDraft({
              ...draft,
              frequency: event.target.value as "MONTHLY" | "WEEKLY",
            })
          }
        >
          <option value="MONTHLY">{tx("每月")}</option>
          <option value="WEEKLY">{tx("每周")}</option>
        </select>
        <Button loading={pending} type="submit">{tx("创建模板")}</Button>
      </form>
      <h3 className="finance-subheading">{tx("待确认发生项")}</h3>
      <div className="finance-occurrence-list">
        {occurrences
          .filter((item) => item.status === "PENDING")
          .map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.templateName}</strong>
                <small>
                  {tx("预计入账 · 未入账 ·")} {item.scheduledDate} · {item.categoryName}{" "}
                  · {yuan(item.amountCentsSnapshot)}
                </small>
              </div>
              <div>
                <Button onClick={() => void act(item, "confirm")}>{tx("确认入账")}</Button>
                <Button onClick={() => void act(item, "skip")}>{tx("跳过")}</Button>
              </div>
            </article>
          ))}
      </div>
      {occurrences.filter((item) => item.status === "PENDING").length === 0 ? (
        <p className="finance-empty">{tx("没有待确认发生项。准备后才会出现，不会自动影响余额。")}</p>
      ) : null}
      <h3 className="finance-subheading">{tx("模板")}</h3>
      {templates.map((item) => (
        <div className="finance-recurring-template" key={item.id}>
          <span>
            <strong>{item.name}</strong>
            <small>
              {item.type === "INCOME" ? tx("收入") : tx("支出")} ·{" "}
              {item.frequency === "MONTHLY" ? tx("每月") : tx("每周")} ·{" "}
              {item.accountName}
            </small>
          </span>
          <b>{yuan(item.amountCents)}</b>
        </div>
      ))}
    </section>
  );
}
