import { Badge } from "../../shared/ui";
import { yuan, type FinanceReport } from "./model";

export function Reports({ data, hidden }: { data?: FinanceReport; hidden: boolean }) {
  if (!data) return <p className="route-state">正在读取报表...</p>;
  return (
    <section className="finance-panel finance-report-page">
      <header>
        <div>
          <p className="route-eyebrow">月度收支</p>
          <h2>{data.month} 报表</h2>
        </div>
        <Badge tone={data.reconciliation ? "success" : "warning"}>
          {data.reconciliation ? "已核对" : "需核对"}
        </Badge>
      </header>
      <div className="finance-report-summary">
        <div>
          <small>收入</small>
          <strong>{yuan(data.monthly.incomeCents, hidden)}</strong>
        </div>
        <div>
          <small>支出</small>
          <strong>{yuan(data.monthly.expenseCents, hidden)}</strong>
        </div>
        <div>
          <small>净现金流</small>
          <strong>{yuan(data.monthly.netCashflowCents, hidden)}</strong>
        </div>
      </div>
      <h3 className="finance-subheading">分类支出</h3>
      {data.categories.map((item) => (
        <div
          className="finance-report-row"
          key={`${item.categoryId}-${item.categoryName}`}
        >
          <span>
            {item.categoryName}
            {item.netRefund ? <Badge tone="warning">净退款</Badge> : null}
          </span>
          <b>{yuan(item.netExpenseCents, hidden)}</b>
        </div>
      ))}
      <h3 className="finance-subheading">账户净变动</h3>
      {data.accounts.map((item) => (
        <div className="finance-report-row" key={item.accountId}>
          <span>
            {item.accountName}
            <small>
              期初 {yuan(item.startingBalanceCents, hidden)} · 期末{" "}
              {yuan(item.endingBalanceCents, hidden)}
            </small>
          </span>
          <b>{yuan(item.netChangeCents, hidden)}</b>
        </div>
      ))}
    </section>
  );
}
