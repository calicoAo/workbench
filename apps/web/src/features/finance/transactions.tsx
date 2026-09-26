import { useQuery } from "@tanstack/react-query";
import { ReceiptText, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Badge, Button, IconButton } from "../../shared/ui";
import { financeErrorMessage } from "./error";
import { transactionTypeLabel, yuan, type FinanceAccount, type FinanceCategory, type FinanceTransaction } from "./model";
import { TransactionActionDialog } from "./transaction-action-dialog";
import { TransactionList } from "./transaction-list";
import { tx } from "../../app/i18n";

export function Transactions({
  request,
  userId,
  date,
  accounts,
  categories,
  hidden,
  initialTransactionId,
  onChanged,
  onError,
}: {
  request: Request;
  userId: number;
  date: string;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  hidden: boolean;
  initialTransactionId: string | null;
  onChanged: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    accountId: "",
    categoryId: "",
    type: "",
    keyword: "",
  });
  const [selected, setSelected] = useState<FinanceTransaction | null>(null);
  const queryString = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  ).toString();
  const query = useQuery({
    queryKey: queryKeys.financeTransactions(userId, queryString),
    queryFn: () =>
      request<{ items: FinanceTransaction[]; nextCursor: number | null }>(
        `/api/finance/transactions?${queryString}`,
      ),
  });
  useEffect(() => {
    if (initialTransactionId && query.data?.items) {
      const match = query.data.items.find(
        (item) => String(item.id) === initialTransactionId,
      );
      if (match) setSelected(match);
    }
  }, [initialTransactionId, query.data?.items]);
  return (
    <section className="finance-panel finance-transactions">
      <header>
        <div>
          <p className="route-eyebrow">{tx("已入账流水")}</p>
          <h2>{tx("流水")}</h2>
        </div>
        <ReceiptText size={19} />
      </header>
      <div className="finance-filters">
        <input
          aria-label={tx("起始日期")}
          className="field"
          type="date"
          value={filters.from}
          onChange={(event) =>
            setFilters({ ...filters, from: event.target.value })
          }
        />
        <input
          aria-label={tx("结束日期")}
          className="field"
          type="date"
          value={filters.to}
          onChange={(event) =>
            setFilters({ ...filters, to: event.target.value })
          }
        />
        <select
          aria-label={tx("筛选账户")}
          className="field"
          value={filters.accountId}
          onChange={(event) =>
            setFilters({ ...filters, accountId: event.target.value })
          }
        >
          <option value="">{tx("全部账户")}</option>
          {accounts.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("筛选分类")}
          className="field"
          value={filters.categoryId}
          onChange={(event) =>
            setFilters({ ...filters, categoryId: event.target.value })
          }
        >
          <option value="">{tx("全部分类")}</option>
          {categories.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label={tx("筛选类型")}
          className="field"
          value={filters.type}
          onChange={(event) =>
            setFilters({ ...filters, type: event.target.value })
          }
        >
          <option value="">{tx("全部类型")}</option>
          {Object.entries(transactionTypeLabel).map(([value, label]) => (
            <option value={value} key={value}>
              {tx(label)}
            </option>
          ))}
        </select>
        <input
          aria-label={tx("流水备注关键词")}
          className="field"
          placeholder={tx("搜索备注")}
          value={filters.keyword}
          onChange={(event) =>
            setFilters({ ...filters, keyword: event.target.value })
          }
        />
      </div>
      {query.isPending ? (
        <p className="route-state">{tx("正在读取流水...")}</p>
      ) : (
        <TransactionList
          items={query.data?.items ?? []}
          hidden={hidden}
          onSelect={setSelected}
        />
      )}
      {selected ? (
        <TransactionDetail
          transaction={selected}
          date={date}
          request={request}
          accounts={accounts}
          categories={categories}
          hidden={hidden}
          onClose={() => setSelected(null)}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
    </section>
  );
}

function TransactionDetail({
  transaction,
  date,
  request,
  accounts,
  categories,
  hidden,
  onClose,
  onChanged,
  onError,
}: {
  transaction: FinanceTransaction;
  date: string;
  request: Request;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  hidden: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [action, setAction] = useState<"refund" | "correct" | null>(null);
  const [pending, setPending] = useState(false);
  const detail = useQuery({
    queryKey: ["finance-transaction", transaction.id],
    queryFn: () =>
      request<FinanceTransaction>(
        `/api/finance/transactions/${transaction.id}`,
      ),
  });
  const current = detail.data ?? transaction;
  async function voidTransaction() {
    setPending(true);
    try {
      await request(`/api/finance/transactions/${current.id}/void`, {
        method: "POST",
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          expectedVersion: current.version,
          occurredDate: date,
          occurredTime: "00:00",
        }),
      });
      await onChanged();
      onClose();
    } catch (error) {
      onError(financeErrorMessage(error), tx("流水没有作废"));
    } finally {
      setPending(false);
    }
  }
  const canModify = current.type === "EXPENSE" || current.type === "INCOME";
  const isPosted = (current.status ?? "POSTED") === "POSTED";
  const isCorrected =
    current.status === "REVERSED" || Boolean(current.correction?.current);
  const isVoided = current.status === "VOIDED";
  const displayAmount =
    current.type === "TRANSFER"
      ? (current.displayAmountCents ?? current.amountCents)
      : current.amountCents;
  const money = (value: string | null | undefined) =>
    yuan(value ?? "0", hidden);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="time-modal finance-transaction-detail">
        <header>
          <div>
            <p className="route-eyebrow">Transaction #{current.id}</p>
            <h2>
              {current.type === "TRANSFER"
                ? tx("转账")
                : tx(transactionTypeLabel[current.type])}
            </h2>
          </div>
          <IconButton label={tx("关闭")} onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        {detail.isPending ? (
          <p className="route-state">{tx("正在读取流水详情...")}</p>
        ) : (
          <>
            <strong className="finance-detail-amount">
              {money(displayAmount)}
            </strong>
            {current.transfer ? (
              <section className="finance-detail-summary">
                <strong>{tx("转账金额：")}{money(current.transfer.amountCents)}</strong>
                <span>
                  {tx("转出：")}{current.transfer.sourceAccountName ?? tx("未关联账户")}
                </span>
                <span>
                  {tx("转入：")}{current.transfer.targetAccountName ?? tx("未关联账户")}
                </span>
                {BigInt(current.transfer.feeAmountCents ?? "0") > 0n ? (
                  <span>{tx("手续费：")}{money(current.transfer.feeAmountCents)}</span>
                ) : null}
              </section>
            ) : null}
            {current.refund && !isCorrected && !isVoided ? (
              <section className="finance-detail-summary">
                <strong>
                  {current.type === "REFUND" ? tx("退款摘要") : tx("退款进度")}
                </strong>
                <span>{tx("原支出：")}{money(current.refund.originalAmountCents)}</span>
                <span>{tx("已退款：")}{money(current.refund.refundedAmountCents)}</span>
                <span>
                  {tx("剩余可退款：")}{money(current.refund.remainingRefundableCents)}
                </span>
                {current.refund.refunds.length ? (
                  <div className="finance-detail-history">
                    <b>{tx("退款记录")}</b>
                    {current.refund.refunds.map((item) => (
                      <span key={item.id}>
                        {item.businessDate} · {money(item.amountCents)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {current.refund.remainingRefundableCents === "0" ? (
                  <Badge tone="warning">{tx("已全部退款")}</Badge>
                ) : null}
              </section>
            ) : null}
            {isCorrected ? (
              <section className="finance-detail-summary">
                <strong>{tx("这笔原记录已更正")}</strong>
                <span>{tx("退款请对当前有效记录操作")}</span>
                {current.refund &&
                BigInt(current.refund.refundedAmountCents) > 0n ? (
                  <span>
                    {tx("历史已退款：")}{money(current.refund.refundedAmountCents)}
                  </span>
                ) : null}
                {current.correction?.original ? (
                  <span>
                    {tx("原记录：")}
                    {current.correction.original.accountName ?? tx("未关联账户")} ·{" "}
                    {current.correction.original.categoryName ?? tx("无分类")} ·{" "}
                    {money(current.correction.original.amountCents)}
                  </span>
                ) : null}
                {current.correction?.current ? (
                  <span>
                    {tx("当前有效记录：")}
                    {current.correction.current.accountName ?? tx("未关联账户")} ·{" "}
                    {current.correction.current.categoryName ?? tx("无分类")} ·{" "}
                    {money(current.correction.current.amountCents)}
                  </span>
                ) : null}
              </section>
            ) : null}
            {isVoided ? (
              <section className="finance-detail-summary">
                <strong>{tx("这笔记录已作废，不再影响余额和报表")}</strong>
                <span>{tx("不可再发起退款")}</span>
                {current.refund &&
                BigInt(current.refund.refundedAmountCents) > 0n ? (
                  <span>
                    {tx("历史已退款：")}{money(current.refund.refundedAmountCents)}
                  </span>
                ) : null}
              </section>
            ) : null}
            <dl>
              <div>
                <dt>{tx("账户")}</dt>
                <dd>
                  {current.type === "TRANSFER"
                    ? tx("{value0} → {value1}", { value0: current.sourceAccountName ?? tx("转出账户"), value1: current.targetAccountName ?? tx("转入账户") })
                    : (current.accountName ?? tx("未关联账户"))}
                </dd>
              </div>
              <div>
                <dt>{tx("分类")}</dt>
                <dd>{current.categoryName ?? tx("无")}</dd>
              </div>
              <div>
                <dt>{tx("业务日期")}</dt>
                <dd>{current.businessDate}</dd>
              </div>
              <div>
                <dt>{tx("记录时区")}</dt>
                <dd>{current.recordTimezone}</dd>
              </div>
              <div>
                <dt>{tx("状态")}</dt>
                <dd>
                  {current.status === "REVERSED"
                    ? tx("已更正")
                    : current.status === "VOIDED"
                      ? tx("已作废")
                      : (current.status ?? "POSTED")}
                </dd>
              </div>
              <div>
                <dt>{tx("备注")}</dt>
                <dd>{current.note || tx("无")}</dd>
              </div>
            </dl>
            {canModify && isPosted ? (
              <footer className="finance-detail-actions">
                <Button
                  onClick={() => setAction("refund")}
                  disabled={
                    current.type !== "EXPENSE" ||
                    current.refund?.canRefund === false
                  }
                >{tx("退款")}</Button>
                <Button onClick={() => setAction("correct")}>{tx("更正")}</Button>
                <Button
                  variant="danger"
                  loading={pending}
                  onClick={() => void voidTransaction()}
                >{tx("作废")}</Button>
              </footer>
            ) : null}
            <p>{tx("原始流水仍保留；退款、更正和作废通过追加记录更新有效结果。")}</p>
            {action ? (
              <TransactionActionDialog
                action={action}
                transaction={current}
                date={date}
                request={request}
                accounts={accounts}
                categories={categories}
                onClose={() => setAction(null)}
                onSaved={onChanged}
                onError={onError}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
