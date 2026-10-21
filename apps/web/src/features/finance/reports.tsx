import { Badge } from "../../shared/ui";
import { yuan, type FinanceReport } from "./model";
import { tx } from "../../app/i18n";

export function Reports({ data, hidden }: { data?: FinanceReport; hidden: boolean }) {
  if (!data) return <p className="route-state">{tx("正在读取报表...")}</p>;
  const largestMonthly = maxCents([data.monthly.incomeCents, data.monthly.expenseCents]);
  const flowChartLabel = `${tx("收入")} ${yuan(data.monthly.incomeCents, hidden)}; ${tx("支出")} ${yuan(data.monthly.expenseCents, hidden)}`;
  const categories = [...data.categories].sort((a, b) => absCents(b.netExpenseCents) > absCents(a.netExpenseCents) ? 1 : absCents(b.netExpenseCents) < absCents(a.netExpenseCents) ? -1 : 0).slice(0, 8);
  const largestCategory = maxCents(categories.map((item) => item.netExpenseCents));
  return <section className="finance-panel finance-report-page">
    <header><div><p className="route-eyebrow">{tx("月度收支")}</p><h2>{data.month} {tx("报表")}</h2></div><Badge tone={data.reconciliation ? "success" : "warning"}>{data.reconciliation ? tx("已核对") : tx("需核对")}</Badge></header>
    <div className="finance-report-summary"><div><small>{tx("收入")}</small><strong>{yuan(data.monthly.incomeCents, hidden)}</strong></div><div><small>{tx("支出")}</small><strong>{yuan(data.monthly.expenseCents, hidden)}</strong></div><div><small>{tx("净现金流")}</small><strong>{yuan(data.monthly.netCashflowCents, hidden)}</strong></div></div>
    <div className="finance-chart-grid">
      <section className="finance-chart" aria-labelledby="finance-flow-chart-title">
        <h3 id="finance-flow-chart-title">{tx("月度收支对比")}</h3>
        <div className="finance-chart-bars" role="img" aria-label={flowChartLabel}>
          <ChartBar label={tx("收入")} value={data.monthly.incomeCents} max={largestMonthly} tone="income" hidden={hidden} />
          <ChartBar label={tx("支出")} value={data.monthly.expenseCents} max={largestMonthly} tone="expense" hidden={hidden} />
        </div>
        <div className="finance-chart-legend"><span><i className="chart-income" />{tx("收入")}</span><span><i className="chart-expense" />{tx("支出")}</span></div>
      </section>
      <section className="finance-chart" aria-labelledby="finance-category-chart-title">
        <h3 id="finance-category-chart-title">{tx("分类支出占比")}</h3>
        {categories.length ? <div className="finance-chart-bars" role="img" aria-label={tx("分类支出占比")}>{categories.map((item) => <ChartBar key={item.categoryId ?? item.categoryName} label={item.categoryName} value={item.netExpenseCents} max={largestCategory} tone={item.netRefund ? "neutral" : "expense"} hidden={hidden} />)}</div> : <p className="finance-empty">{tx("暂无分类支出数据。")}</p>}
      </section>
    </div>
    <h3 className="finance-subheading">{tx("分类支出")}</h3>
    {data.categories.map((item) => <div className="finance-report-row" key={`${item.categoryId}-${item.categoryName}`}><span>{item.categoryName}{item.netRefund ? <Badge tone="warning">{tx("净退款")}</Badge> : null}</span><b>{yuan(item.netExpenseCents, hidden)}</b></div>)}
    <h3 className="finance-subheading">{tx("账户净变动")}</h3>
    {data.accounts.map((item) => <div className="finance-report-row" key={item.accountId}><span>{item.accountName}<small>{tx("期初")} {yuan(item.startingBalanceCents, hidden)} {tx("· 期末")} {yuan(item.endingBalanceCents, hidden)}</small></span><b>{yuan(item.netChangeCents, hidden)}</b></div>)}
  </section>;
}

function ChartBar({ label, value, max, tone, hidden }: { label: string; value: string; max: bigint; tone: "income" | "expense" | "neutral"; hidden: boolean }) {
  const raw = BigInt(value);
  const width = max === 0n ? 0 : Number((absCents(value) * 10_000n) / max) / 100;
  return <div className="finance-chart-bar"><div><span>{label}</span><b>{yuan(value, hidden)}</b></div><div className="finance-chart-track"><i className={`chart-${tone}`} style={{ width: `${width}%` }} /></div>{raw < 0n ? <small>{tx("净退款")}</small> : null}</div>;
}

function absCents(value: string) { const cents = BigInt(value); return cents < 0n ? -cents : cents; }
function maxCents(values: string[]) { return values.reduce((max, value) => absCents(value) > max ? absCents(value) : max, 0n); }
