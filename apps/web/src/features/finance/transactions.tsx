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
          <p className="route-eyebrow">已入账流水</p>
          <h2>流水</h2>
        </div>
        <ReceiptText size={19} />
      </header>
      <div className="finance-filters">
        <input
          aria-label="起始日期"
          className="field"
          type="date"
          value={filters.from}
          onChange={(event) =>
            setFilters({ ...filters, from: event.target.value })
          }
        />
        <input
          aria-label="结束日期"
          className="field"
          type="date"
          value={filters.to}
          onChange={(event) =>
            setFilters({ ...filters, to: event.target.value })
          }
        />
        <select
          aria-label="筛选账户"
          className="field"
          value={filters.accountId}
          onChange={(event) =>
            setFilters({ ...filters, accountId: event.target.value })
          }
        >
          <option value="">全部账户</option>
          {accounts.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="筛选分类"
          className="field"
          value={filters.categoryId}
          onChange={(event) =>
            setFilters({ ...filters, categoryId: event.target.value })
          }
        >
          <option value="">全部分类</option>
          {categories.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="筛选类型"
          className="field"
          value={filters.type}
          onChange={(event) =>
            setFilters({ ...filters, type: event.target.value })
          }
        >
          <option value="">全部类型</option>
          {Object.entries(transactionTypeLabel).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          aria-label="流水备注关键词"
          className="field"
          placeholder="搜索备注"
          value={filters.keyword}
          onChange={(event) =>
            setFilters({ ...filters, keyword: event.target.value })
          }
        />
      </div>
      {query.isPending ? (
        <p className="route-state">正在读取流水...</p>
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
      onError(financeErrorMessage(error), "流水没有作废");
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
                ? "转账"
                : transactionTypeLabel[current.type]}
            </h2>
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        {detail.isPending ? (
          <p className="route-state">正在读取流水详情...</p>
        ) : (
          <>
            <strong className="finance-detail-amount">
              {money(displayAmount)}
            </strong>
            {current.transfer ? (
              <section className="finance-detail-summary">
                <strong>转账金额：{money(current.transfer.amountCents)}</strong>
                <span>
                  转出：{current.transfer.sourceAccountName ?? "未关联账户"}
                </span>
                <span>
                  转入：{current.transfer.targetAccountName ?? "未关联账户"}
                </span>
                {BigInt(current.transfer.feeAmountCents ?? "0") > 0n ? (
                  <span>手续费：{money(current.transfer.feeAmountCents)}</span>
                ) : null}
              </section>
            ) : null}
            {current.refund && !isCorrected && !isVoided ? (
              <section className="finance-detail-summary">
                <strong>
                  {current.type === "REFUND" ? "退款摘要" : "退款进度"}
                </strong>
                <span>原支出：{money(current.refund.originalAmountCents)}</span>
                <span>已退款：{money(current.refund.refundedAmountCents)}</span>
                <span>
                  剩余可退款：{money(current.refund.remainingRefundableCents)}
                </span>
                {current.refund.refunds.length ? (
                  <div className="finance-detail-history">
                    <b>退款记录</b>
                    {current.refund.refunds.map((item) => (
                      <span key={item.id}>
                        {item.businessDate} · {money(item.amountCents)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {current.refund.remainingRefundableCents === "0" ? (
                  <Badge tone="warning">已全部退款</Badge>
                ) : null}
              </section>
            ) : null}
            {isCorrected ? (
              <section className="finance-detail-summary">
                <strong>这笔原记录已更正</strong>
                <span>退款请对当前有效记录操作</span>
                {current.refund &&
                BigInt(current.refund.refundedAmountCents) > 0n ? (
                  <span>
                    历史已退款：{money(current.refund.refundedAmountCents)}
                  </span>
                ) : null}
                {current.correction?.original ? (
                  <span>
                    原记录：
                    {current.correction.original.accountName ?? "未关联账户"} ·{" "}
                    {current.correction.original.categoryName ?? "无分类"} ·{" "}
                    {money(current.correction.original.amountCents)}
                  </span>
                ) : null}
                {current.correction?.current ? (
                  <span>
                    当前有效记录：
                    {current.correction.current.accountName ?? "未关联账户"} ·{" "}
                    {current.correction.current.categoryName ?? "无分类"} ·{" "}
                    {money(current.correction.current.amountCents)}
                  </span>
                ) : null}
              </section>
            ) : null}
            {isVoided ? (
              <section className="finance-detail-summary">
                <strong>这笔记录已作废，不再影响余额和报表</strong>
                <span>不可再发起退款</span>
                {current.refund &&
                BigInt(current.refund.refundedAmountCents) > 0n ? (
                  <span>
                    历史已退款：{money(current.refund.refundedAmountCents)}
                  </span>
                ) : null}
              </section>
            ) : null}
            <dl>
              <div>
                <dt>账户</dt>
                <dd>
                  {current.type === "TRANSFER"
                    ? `${current.sourceAccountName ?? "转出账户"} → ${current.targetAccountName ?? "转入账户"}`
                    : (current.accountName ?? "未关联账户")}
                </dd>
              </div>
              <div>
                <dt>分类</dt>
                <dd>{current.categoryName ?? "无"}</dd>
              </div>
              <div>
                <dt>业务日期</dt>
                <dd>{current.businessDate}</dd>
              </div>
              <div>
                <dt>记录时区</dt>
                <dd>{current.recordTimezone}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  {current.status === "REVERSED"
                    ? "已更正"
                    : current.status === "VOIDED"
                      ? "已作废"
                      : (current.status ?? "POSTED")}
                </dd>
              </div>
              <div>
                <dt>备注</dt>
                <dd>{current.note || "无"}</dd>
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
                >
                  退款
                </Button>
                <Button onClick={() => setAction("correct")}>更正</Button>
                <Button
                  variant="danger"
                  loading={pending}
                  onClick={() => void voidTransaction()}
                >
                  作废
                </Button>
              </footer>
            ) : null}
            <p>原始流水仍保留；退款、更正和作废通过追加记录更新有效结果。</p>
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
