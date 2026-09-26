import { ArrowDownCircle, ArrowUpCircle, Landmark } from "lucide-react";
import { Badge } from "../../shared/ui";
import { transactionTypeLabel, yuan, type FinanceTransaction } from "./model";
import { tx } from "../../app/i18n";

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
    return <p className="finance-empty">{tx("还没有符合条件的流水。")}</p>;
  return (
    <div className="finance-transaction-list">
      {items.map((item) => {
        const amount = item.displayAmountCents ?? item.amountCents;
        const signed =
          item.type === "TRANSFER" ? BigInt(amount) : BigInt(item.amountCents);
        const route =
          item.type === "TRANSFER"
            ? tx("{value0} → {value1}", { value0: item.sourceAccountName ?? tx("转出账户"), value1: item.targetAccountName ?? tx("转入账户") })
            : (item.accountName ?? tx("未关联账户"));
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
                  ? tx("转账")
                  : item.type === "REFUND"
                    ? tx("退款 · {value0}", { value0: item.categoryName ?? tx("无分类") })
                    : item.categoryName ?? tx(transactionTypeLabel[item.type])}
                {item.type === "CORRECTION" ? (
                  <Badge tone="warning">{tx("已更正")}</Badge>
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
