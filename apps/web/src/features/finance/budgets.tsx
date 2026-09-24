import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { Request } from "../../app/api";
import { IconButton, Button } from "../../shared/ui";
import { decimalToCents, yuan, type FinanceBudget, type FinanceCategory } from "./model";
import { financeErrorMessage } from "./error";

export function Budgets({
  request,
  month,
  categories,
  budgets,
  onChanged,
  onError,
}: {
  request: Request;
  month: string;
  categories: FinanceCategory[];
  budgets: FinanceBudget[];
  onChanged: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request("/api/finance/budgets", {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          budgetMonth: month,
          categoryId: categoryId ? Number(categoryId) : null,
          limitCents: decimalToCents(limit),
        }),
      });
      setLimit("");
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), "预算没有保存");
    } finally {
      setPending(false);
    }
  }
  async function remove(item: FinanceBudget) {
    try {
      await request(`/api/finance/budgets/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          expectedVersion: item.version,
        }),
      });
      await onChanged();
    } catch (error) {
      onError(financeErrorMessage(error), "预算没有删除");
    }
  }
  return (
    <section className="finance-panel finance-budget-page">
      <header>
        <div>
          <p className="route-eyebrow">本月预算进度</p>
          <h2>{month} 预算</h2>
        </div>
      </header>
      <form className="finance-form-grid" onSubmit={save}>
        <label>
          范围
          <select
            className="field"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">全部支出</option>
            {categories
              .filter((item) => item.kind === "EXPENSE")
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          限额
          <input
            className="field"
            required
            inputMode="decimal"
            placeholder="例如 3000"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
        </label>
        <Button loading={pending} type="submit">
          保存预算
        </Button>
      </form>
      <div className="finance-budget-list">
        {budgets.map((item) => (
          <article key={item.id}>
            <div>
              <strong>{item.categoryName ?? "全部支出"}</strong>
              <small>
                限额 {yuan(item.limitCents)} · 已用 {yuan(item.spentCents)}
              </small>
            </div>
            <b className={BigInt(item.remainingCents) < 0n ? "is-debt" : ""}>
              {BigInt(item.remainingCents) < 0n
                ? `超支 ${yuan((-BigInt(item.remainingCents)).toString())}`
                : `剩余 ${yuan(item.remainingCents)}`}
            </b>
            <IconButton
              label={`删除${item.categoryName ?? "总预算"}`}
              onClick={() => void remove(item)}
            >
              <X size={15} />
            </IconButton>
          </article>
        ))}
      </div>
      {!budgets.length ? (
        <p className="finance-empty">还没有本月预算。</p>
      ) : null}
    </section>
  );
}
