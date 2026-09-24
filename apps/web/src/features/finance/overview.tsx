import { ArrowDownCircle, ArrowUpCircle, Landmark, ReceiptText } from "lucide-react";
import { accountTypeLabel, yuan, type FinanceOverview } from "./model";
import { TransactionList } from "./transaction-list";

export function Overview({
  data,
  hidden,
  onAccount,
}: {
  data: FinanceOverview;
  hidden: boolean;
  onAccount: () => void;
}) {
  return (
    <div className="finance-overview">
      <section className="finance-worth">
        <div>
          <p>净值</p>
          <strong>{yuan(data.netWorthCents, hidden)}</strong>
          <small>{data.accountCount} 个使用中的账户</small>
        </div>
        <span>
          <b>总资产</b>
          <strong>{yuan(data.totalAssetsCents, hidden)}</strong>
        </span>
        <span>
          <b>负债</b>
          <strong>{yuan(data.totalLiabilitiesCents, hidden)}</strong>
        </span>
      </section>
      {data.budgetSummary || data.pendingRecurringSummary ? (
        <section className="finance-panel finance-overview-signals">
          <div>
            <span>本月预算</span>
            <b>
              {data.budgetSummary
                ? `${yuan(data.budgetSummary.spentCents, hidden)} / ${yuan(data.budgetSummary.limitCents, hidden)}`
                : "未设置"}
            </b>
          </div>
          <div>
            <span>待确认周期项</span>
            <b>{data.pendingRecurringSummary?.count ?? 0}</b>
          </div>
        </section>
      ) : null}
      <div className="finance-overview-grid">
        <main>
          <section className="finance-month-flow">
            <div>
              <ArrowUpCircle size={19} />
              <span>
                <small>{data.month} 收入</small>
                <strong>{yuan(data.monthlyIncomeCents, hidden)}</strong>
              </span>
            </div>
            <div>
              <ArrowDownCircle size={19} />
              <span>
                <small>{data.month} 支出</small>
                <strong>{yuan(data.monthlyExpenseCents, hidden)}</strong>
              </span>
            </div>
          </section>
          <section className="finance-panel">
            <header>
              <div>
                <p className="route-eyebrow">最近入账</p>
                <h2>最近流水</h2>
              </div>
              <ReceiptText size={19} />
            </header>
            <TransactionList items={data.recentTransactions} hidden={hidden} />
          </section>
        </main>
        <aside className="finance-panel">
          <header>
            <div>
              <p className="route-eyebrow">账户概览</p>
              <h2>账户余额</h2>
            </div>
            <button onClick={onAccount}>管理</button>
          </header>
          <div className="finance-account-summary">
            {data.accounts
              .filter((item) => !item.archivedAt)
              .map((item) => (
                <div key={item.id}>
                  <span>
                    <i>{accountTypeLabel[item.type]}</i>
                    <strong>{item.name}</strong>
                  </span>
                  <b
                    className={
                      item.type === "CREDIT" && BigInt(item.balanceCents) < 0n
                        ? "is-debt"
                        : ""
                    }
                  >
                    {item.type === "CREDIT" && BigInt(item.balanceCents) < 0n
                      ? `欠款 ${yuan((-BigInt(item.balanceCents)).toString(), hidden)}`
                      : yuan(item.balanceCents, hidden)}
                  </b>
                </div>
              ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
