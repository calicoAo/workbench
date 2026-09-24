import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Eye,
  EyeOff,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  WalletCards,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Badge, Button, IconButton } from "../../shared/ui";
import { AccountDialog } from "./account-dialog";
import {
  accountTypeLabel,
  decimalToCents,
  transactionTypeLabel,
  yuan,
  type FinanceAccount,
  type FinanceBudget,
  type FinanceCategory,
  type FinanceCategoryKind,
  type FinanceOverview,
  type FinanceReport,
  type FinanceRecurringOccurrence,
  type FinanceRecurringTemplate,
  type FinanceTransaction,
} from "./model";
import { RecordDialog } from "./record-dialog";
import { TransferDialog } from "./transfer-dialog";
import { TransactionActionDialog } from "./transaction-action-dialog";

export { yuan } from "./model";

type Tab =
  | "overview"
  | "accounts"
  | "transactions"
  | "budgets"
  | "recurring"
  | "reports";

export function FinancePage({
  request,
  userId,
  date,
  initialAction,
  onError,
}: {
  request: Request;
  userId: number;
  date: string;
  initialAction?: "income" | "expense" | "transfer";
  onError: (message: string, title?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (
    [
      "overview",
      "accounts",
      "transactions",
      "budgets",
      "recurring",
      "reports",
    ].includes(params.get("tab") ?? "")
      ? params.get("tab")
      : "overview"
  ) as Tab;
  const overview = useQuery({
    queryKey: queryKeys.financeOverview(userId, date.slice(0, 7)),
    queryFn: () =>
      request<FinanceOverview>(
        `/api/finance/overview?month=${date.slice(0, 7)}`,
      ),
  });
  const accounts = useQuery({
    queryKey: queryKeys.financeAccounts(userId, "all"),
    queryFn: () => request<FinanceAccount[]>("/api/finance/accounts?view=all"),
  });
  const categories = useQuery({
    queryKey: queryKeys.financeCategories(userId),
    queryFn: () => request<FinanceCategory[]>("/api/finance/categories"),
  });
  const budgets = useQuery({
    queryKey: ["finance-budgets", userId, date.slice(0, 7)],
    enabled: tab === "budgets",
    queryFn: () =>
      request<FinanceBudget[]>(
        `/api/finance/budgets?month=${date.slice(0, 7)}`,
      ),
  });
  const templates = useQuery({
    queryKey: ["finance-recurring-templates", userId],
    enabled: tab === "recurring",
    queryFn: () =>
      request<FinanceRecurringTemplate[]>("/api/finance/recurring-templates"),
  });
  const occurrences = useQuery({
    queryKey: ["finance-recurring-occurrences", userId, date.slice(0, 7)],
    enabled: tab === "recurring",
    queryFn: () =>
      request<FinanceRecurringOccurrence[]>(
        `/api/finance/recurring-occurrences?from=${date.slice(0, 7)}-01&to=${date}`,
      ),
  });
  const reports = useQuery({
    queryKey: ["finance-reports", userId, date.slice(0, 7)],
    enabled: tab === "reports",
    queryFn: () =>
      request<FinanceReport>(`/api/finance/reports?month=${date.slice(0, 7)}`),
  });
  const [accountEditor, setAccountEditor] = useState<
    FinanceAccount | "new" | null
  >(null);
  const [transferOpen, setTransferOpen] = useState(
    initialAction === "transfer",
  );
  const [recordKind, setRecordKind] = useState<FinanceCategoryKind | null>(
    initialAction === "expense"
      ? "EXPENSE"
      : initialAction === "income"
        ? "INCOME"
        : null,
  );
  const [hidden, setHidden] = useState(
    () => localStorage.getItem("personal-workbench:finance-hidden") === "true",
  );
  useEffect(() => {
    setRecordKind(
      initialAction === "expense"
        ? "EXPENSE"
        : initialAction === "income"
          ? "INCOME"
          : null,
    );
    setTransferOpen(initialAction === "transfer");
  }, [initialAction]);
  function chooseTab(next: Tab) {
    const values = new URLSearchParams(params);
    values.set("tab", next);
    values.delete("action");
    values.delete("nonce");
    setParams(values);
  }
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-overview", userId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-accounts", userId] }),
      queryClient.invalidateQueries({
        queryKey: ["finance-categories", userId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["finance-transactions", userId],
      }),
      queryClient.invalidateQueries({ queryKey: ["finance-budgets", userId] }),
      queryClient.invalidateQueries({
        queryKey: ["finance-recurring", userId],
      }),
      queryClient.invalidateQueries({ queryKey: ["finance-reports", userId] }),
    ]);
  }
  async function initialize() {
    try {
      await request("/api/finance/initialize", {
        method: "POST",
        body: JSON.stringify({ operationId: crypto.randomUUID() }),
      });
      await refresh();
    } catch (error) {
      onError(message(error), "财务分类没有初始化");
    }
  }
  function toggleHidden() {
    setHidden((value) => {
      localStorage.setItem("personal-workbench:finance-hidden", String(!value));
      return !value;
    });
  }
  const loading =
    overview.isPending || accounts.isPending || categories.isPending;
  return (
    <section className="finance-route">
      <header className="finance-head">
        <div>
          <p className="route-eyebrow">独立的真实资金账本</p>
          <h1>财务</h1>
          <p>余额来自已入账分录，和工作台金币完全分开。</p>
        </div>
        <div className="finance-head-actions">
          <IconButton
            label={hidden ? "显示金额" : "隐藏金额"}
            onClick={toggleHidden}
          >
            {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
          </IconButton>
          <Button onClick={() => setRecordKind("INCOME")}>
            <ArrowUpCircle size={16} />
            记收入
          </Button>
          <Button onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight size={16} />
            转账
          </Button>
          <Button variant="primary" onClick={() => setRecordKind("EXPENSE")}>
            <ArrowDownCircle size={16} />
            记支出
          </Button>
        </div>
      </header>
      <nav className="finance-tabs" aria-label="财务导航">
        <button
          className={tab === "overview" ? "is-active" : ""}
          onClick={() => chooseTab("overview")}
        >
          概览
        </button>
        <button
          className={tab === "accounts" ? "is-active" : ""}
          onClick={() => chooseTab("accounts")}
        >
          账户
        </button>
        <button
          className={tab === "transactions" ? "is-active" : ""}
          onClick={() => chooseTab("transactions")}
        >
          流水
        </button>
        <button
          className={tab === "budgets" ? "is-active" : ""}
          onClick={() => chooseTab("budgets")}
        >
          预算
        </button>
        <button
          className={tab === "recurring" ? "is-active" : ""}
          onClick={() => chooseTab("recurring")}
        >
          周期
        </button>
        <button
          className={tab === "reports" ? "is-active" : ""}
          onClick={() => chooseTab("reports")}
        >
          报表
        </button>
      </nav>
      {loading ? <p className="route-state">正在读取账本...</p> : null}
      {!loading && !categories.data?.length ? (
        <section className="finance-onboarding">
          <Landmark size={30} />
          <div>
            <h2>开始使用独立财务账本</h2>
            <p>
              初始化常用收入和支出分类；不会读取或转换任务、奖励与股票复盘。
            </p>
          </div>
          <Button variant="primary" onClick={() => void initialize()}>
            初始化财务分类
          </Button>
        </section>
      ) : null}
      {tab === "overview" && overview.data ? (
        <Overview
          data={overview.data}
          hidden={hidden}
          onAccount={() => chooseTab("accounts")}
        />
      ) : null}
      {tab === "accounts" ? (
        <Accounts
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          hidden={hidden}
          request={request}
          onCreate={() => setAccountEditor("new")}
          onEdit={setAccountEditor}
          onChanged={refresh}
          onError={onError}
        />
      ) : null}
      {tab === "transactions" ? (
        <Transactions
          request={request}
          userId={userId}
          date={date}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          hidden={hidden}
          initialTransactionId={params.get("transactionId")}
          onChanged={refresh}
          onError={onError}
        />
      ) : null}
      {tab === "budgets" ? (
        <Budgets
          request={request}
          month={date.slice(0, 7)}
          categories={categories.data ?? []}
          budgets={budgets.data ?? []}
          onChanged={refresh}
          onError={onError}
        />
      ) : null}
      {tab === "recurring" ? (
        <Recurring
          request={request}
          date={date}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          templates={templates.data ?? []}
          occurrences={occurrences.data ?? []}
          onChanged={refresh}
          onError={onError}
        />
      ) : null}
      {tab === "reports" ? (
        <Reports data={reports.data} hidden={hidden} />
      ) : null}
      {accountEditor ? (
        <AccountDialog
          account={accountEditor === "new" ? null : accountEditor}
          date={date}
          request={request}
          onClose={() => setAccountEditor(null)}
          onSaved={refresh}
          onError={onError}
        />
      ) : null}
      {recordKind && !loading ? (
        <RecordDialog
          kind={recordKind}
          date={date}
          request={request}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setRecordKind(null)}
          onSaved={refresh}
          onError={onError}
        />
      ) : null}
      {transferOpen && !loading ? (
        <TransferDialog
          date={date}
          request={request}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setTransferOpen(false)}
          onSaved={refresh}
          onError={onError}
        />
      ) : null}
    </section>
  );
}

function Overview({
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

function Accounts({
  accounts,
  categories,
  hidden,
  request,
  onCreate,
  onEdit,
  onChanged,
  onError,
}: {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  hidden: boolean;
  request: Request;
  onCreate: () => void;
  onEdit: (account: FinanceAccount) => void;
  onChanged: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const shown = accounts.filter((item) => showArchived || !item.archivedAt);
  return (
    <div className="finance-accounts-layout">
      <main className="finance-panel">
        <header>
          <div>
            <p className="route-eyebrow">账户余额</p>
            <h2>账户</h2>
          </div>
          <Button variant="primary" onClick={onCreate}>
            <Plus size={16} />
            创建账户
          </Button>
        </header>
        <label className="finance-check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          显示已归档
        </label>
        <div className="finance-account-list">
          {shown.map((account) => (
            <article
              key={account.id}
              className={account.archivedAt ? "is-archived" : ""}
            >
              <span className="finance-account-icon">
                <WalletCards size={20} />
              </span>
              <div>
                <strong>{account.name}</strong>
                <small>
                  {accountTypeLabel[account.type]} · CNY · 期初{" "}
                  {account.openingDate}
                </small>
              </div>
              <div className="finance-account-balance">
                <strong
                  className={
                    account.type === "CREDIT" &&
                    BigInt(account.balanceCents) < 0n
                      ? "is-debt"
                      : ""
                  }
                >
                  {account.type === "CREDIT" &&
                  BigInt(account.balanceCents) < 0n
                    ? `欠款 ${yuan((-BigInt(account.balanceCents)).toString(), hidden)}`
                    : yuan(account.balanceCents, hidden)}
                </strong>
                <small>
                  {account.includeInOverview ? "计入总览" : "不计入总览"}
                  {account.archivedAt ? " · 已归档" : ""}
                </small>
              </div>
              <IconButton
                label={`编辑 ${account.name}`}
                onClick={() => onEdit(account)}
              >
                <Pencil size={16} />
              </IconButton>
            </article>
          ))}
        </div>
        {!shown.length ? (
          <p className="finance-empty">
            还没有账户。创建账户时可以同时写入期初分录。
          </p>
        ) : null}
      </main>
      <CategoryManager
        request={request}
        categories={categories}
        onChanged={onChanged}
        onError={onError}
      />
    </div>
  );
}

function CategoryManager({
  request,
  categories,
  onChanged,
  onError,
}: {
  request: Request;
  categories: FinanceCategory[];
  onChanged: () => Promise<void>;
  onError: (message: string, title?: string) => void;
}) {
  const [draft, setDraft] = useState({
    kind: "EXPENSE" as FinanceCategoryKind,
    name: "",
  });
  const [editing, setEditing] = useState<FinanceCategory | null>(null);
  const [pending, setPending] = useState(false);
  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await request("/api/finance/categories", {
        method: "POST",
        body: JSON.stringify({
          kind: draft.kind,
          name: draft.name.trim(),
          sortOrder:
            categories.filter((item) => item.kind === draft.kind).length * 10 +
            10,
        }),
      });
      setDraft({ ...draft, name: "" });
      await onChanged();
    } catch (error) {
      onError(message(error), "分类没有创建");
    } finally {
      setPending(false);
    }
  }
  async function save(category: FinanceCategory, changes: object) {
    setPending(true);
    try {
      await request(`/api/finance/categories/${category.id}`, {
        method: "PUT",
        body: JSON.stringify({ expectedVersion: category.version, ...changes }),
      });
      setEditing(null);
      await onChanged();
    } catch (error) {
      onError(message(error), "分类没有更新");
    } finally {
      setPending(false);
    }
  }
  return (
    <aside className="finance-panel finance-categories">
      <header>
        <div>
          <p className="route-eyebrow">分类管理</p>
          <h2>收支分类</h2>
        </div>
      </header>
      <form onSubmit={create}>
        <select
          aria-label="新分类类型"
          className="field"
          value={draft.kind}
          onChange={(event) =>
            setDraft({
              ...draft,
              kind: event.target.value as FinanceCategoryKind,
            })
          }
        >
          <option value="EXPENSE">支出</option>
          <option value="INCOME">收入</option>
        </select>
        <input
          required
          aria-label="新财务分类"
          className="field"
          maxLength={64}
          placeholder="分类名称"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <Button loading={pending} type="submit">
          添加
        </Button>
      </form>
      {(["EXPENSE", "INCOME"] as const).map((kind) => (
        <section key={kind}>
          <h3>{kind === "EXPENSE" ? "支出" : "收入"}</h3>
          {categories
            .filter((item) => item.kind === kind)
            .map((item) => (
              <div className="finance-category-row" key={item.id}>
                {editing?.id === item.id ? (
                  <input
                    autoFocus
                    aria-label={`编辑 ${item.name}`}
                    className="field"
                    defaultValue={item.name}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void save(item, {
                          name: event.currentTarget.value.trim(),
                        });
                      }
                    }}
                  />
                ) : (
                  <span>
                    {item.name}
                    {!item.enabled ? (
                      <Badge tone="warning">已停用</Badge>
                    ) : null}
                  </span>
                )}
                <div>
                  <IconButton
                    label={`编辑分类 ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <button
                    disabled={pending}
                    onClick={() => void save(item, { enabled: !item.enabled })}
                  >
                    {item.enabled ? "停用" : "启用"}
                  </button>
                </div>
              </div>
            ))}
        </section>
      ))}
    </aside>
  );
}

function Transactions({
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

function TransactionList({
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
      onError(message(error), "流水没有作废");
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

function message(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

function Budgets({
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
      onError(message(error), "预算没有保存");
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
      onError(message(error), "预算没有删除");
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

function Recurring({
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
      onError(message(error), "周期模板没有创建");
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
      onError(message(error), "周期发生项没有准备");
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
      onError(message(error), "周期发生项操作失败");
    }
  }
  return (
    <section className="finance-panel finance-recurring-page">
      <header>
        <div>
          <p className="route-eyebrow">周期计划</p>
          <h2>周期收支</h2>
          <p className="finance-recurring-note">
            确认入账后会影响真实余额；跳过不会入账。
          </p>
        </div>
        <Button aria-label="准备本月发生项" onClick={() => void prepare()}>
          <span className="finance-prepare-label-full">准备本月发生项</span>
          <span className="finance-prepare-label-mobile">准备本月</span>
        </Button>
      </header>
      <form className="finance-form-grid" onSubmit={create}>
        <input
          className="field"
          required
          placeholder="模板名称"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <input
          className="field"
          required
          inputMode="decimal"
          placeholder="金额"
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
          <option value="EXPENSE">支出</option>
          <option value="INCOME">收入</option>
        </select>
        <select
          className="field"
          required
          value={draft.accountId}
          onChange={(event) =>
            setDraft({ ...draft, accountId: event.target.value })
          }
        >
          <option value="">账户</option>
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
          <option value="">分类</option>
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
          <option value="MONTHLY">每月</option>
          <option value="WEEKLY">每周</option>
        </select>
        <Button loading={pending} type="submit">
          创建模板
        </Button>
      </form>
      <h3 className="finance-subheading">待确认发生项</h3>
      <div className="finance-occurrence-list">
        {occurrences
          .filter((item) => item.status === "PENDING")
          .map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.templateName}</strong>
                <small>
                  预计入账 · 未入账 · {item.scheduledDate} · {item.categoryName}{" "}
                  · {yuan(item.amountCentsSnapshot)}
                </small>
              </div>
              <div>
                <Button onClick={() => void act(item, "confirm")}>
                  确认入账
                </Button>
                <Button onClick={() => void act(item, "skip")}>跳过</Button>
              </div>
            </article>
          ))}
      </div>
      {occurrences.filter((item) => item.status === "PENDING").length === 0 ? (
        <p className="finance-empty">
          没有待确认发生项。准备后才会出现，不会自动影响余额。
        </p>
      ) : null}
      <h3 className="finance-subheading">模板</h3>
      {templates.map((item) => (
        <div className="finance-recurring-template" key={item.id}>
          <span>
            <strong>{item.name}</strong>
            <small>
              {item.type === "INCOME" ? "收入" : "支出"} ·{" "}
              {item.frequency === "MONTHLY" ? "每月" : "每周"} ·{" "}
              {item.accountName}
            </small>
          </span>
          <b>{yuan(item.amountCents)}</b>
        </div>
      ))}
    </section>
  );
}

function Reports({ data, hidden }: { data?: FinanceReport; hidden: boolean }) {
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
