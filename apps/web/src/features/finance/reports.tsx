import { Badge } from "../../shared/ui";
import { yuan, type FinanceReport } from "./model";
import { tx } from "../../app/i18n";

export function Reports({ data, hidden }: { data?: FinanceReport; hidden: boolean }) {
  if (!data) return <p className="route-state">{tx("正在读取报表...")}</p>;
  return (
    <section className="finance-panel finance-report-page">
      <header>
        <div>
          <p className="route-eyebrow">{tx("月度收支")}</p>
          <h2>{data.month} {tx("报表")}</h2>
        </div>
        <Badge tone={data.reconciliation ? "success" : "warning"}>
          {data.reconciliation ? tx("已核对") : tx("需核对")}
        </Badge>
      </header>
      <div className="finance-report-summary">
        <div>
          <small>{tx("收入")}</small>
          <strong>{yuan(data.monthly.incomeCents, hidden)}</strong>
        </div>
        <div>
          <small>{tx("支出")}</small>
          <strong>{yuan(data.monthly.expenseCents, hidden)}</strong>
        </div>
        <div>
          <small>{tx("净现金流")}</small>
          <strong>{yuan(data.monthly.netCashflowCents, hidden)}</strong>
        </div>
      </div>
      <h3 className="finance-subheading">{tx("分类支出")}</h3>
      {data.categories.map((item) => (
        <div
          className="finance-report-row"
          key={`${item.categoryId}-${item.categoryName}`}
        >
          <span>
            {item.categoryName}
            {item.netRefund ? <Badge tone="warning">{tx("净退款")}</Badge> : null}
          </span>
          <b>{yuan(item.netExpenseCents, hidden)}</b>
        </div>
      ))}
      <h3 className="finance-subheading">{tx("账户净变动")}</h3>
      {data.accounts.map((item) => (
        <div className="finance-report-row" key={item.accountId}>
          <span>
            {item.accountName}
            <small>
              {tx("期初")} {yuan(item.startingBalanceCents, hidden)} {tx("· 期末")}{" "}
              {yuan(item.endingBalanceCents, hidden)}
            </small>
          </span>
          <b>{yuan(item.netChangeCents, hidden)}</b>
        </div>
      ))}
    </section>
  );
}
