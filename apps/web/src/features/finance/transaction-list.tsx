import { ArrowDownCircle, ArrowUpCircle, Landmark } from "lucide-react";
import { Badge } from "../../shared/ui";
import { transactionTypeLabel, yuan, type FinanceTransaction } from "./model";

export function TransactionList({
  items,
  hidden,
  onSelect,
}: {
  items: FinanceTransaction[];
  hidden: boolean;
  onSelect?: (item: FinanceTransaction) => void;
}) {
  if (!items.length)
    return <p className="finance-empty">还没有符合条件的流水。</p>;
  return (
    <div className="finance-transaction-list">
      {items.map((item) => {
        const amount = item.displayAmountCents ?? item.amountCents;
        const signed =
          item.type === "TRANSFER" ? BigInt(amount) : BigInt(item.amountCents);
        const route =
          item.type === "TRANSFER"
            ? `${item.sourceAccountName ?? "转出账户"} → ${item.targetAccountName ?? "转入账户"}`
            : (item.accountName ?? "未关联账户");
        const tone =
          item.type === "TRANSFER"
            ? "is-neutral"
            : signed < 0n
              ? "is-expense"
              : "is-income";
        return (
          <button type="button" key={item.id} onClick={() => onSelect?.(item)}>
            <span
              className={`finance-transaction-icon is-${item.type.toLowerCase()}`}
            >
              {item.type === "INCOME" ? (
                <ArrowUpCircle size={18} />
              ) : item.type === "EXPENSE" ? (
                <ArrowDownCircle size={18} />
              ) : (
                <Landmark size={18} />
              )}
            </span>
            <span>
              <strong>
                {item.type === "TRANSFER"
                  ? "转账"
                  : item.type === "REFUND"
                    ? `退款 · ${item.categoryName ?? "无分类"}`
                    : (item.categoryName ?? transactionTypeLabel[item.type])}
                {item.type === "CORRECTION" ? (
                  <Badge tone="warning">已更正</Badge>
                ) : null}
              </strong>
              <small>
                {item.businessDate} · {route}
                {item.note ? ` · ${item.note}` : ""}
              </small>
            </span>
            <b className={tone}>
              {item.type === "TRANSFER"
                ? yuan(amount, hidden)
                : yuan(item.amountCents, hidden)}
            </b>
          </button>
        );
      })}
    </div>
  );
}
