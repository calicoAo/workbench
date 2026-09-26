import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, Eye, EyeOff, Landmark } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Button, IconButton } from "../../shared/ui";
import { AccountDialog } from "./account-dialog";
import { Accounts } from "./accounts";
import { Budgets } from "./budgets";
import { Overview } from "./overview";
import { Recurring } from "./recurring";
import {
  type FinanceAccount,
  type FinanceBudget,
  type FinanceCategory,
  type FinanceCategoryKind,
  type FinanceOverview,
  type FinanceReport,
  type FinanceRecurringOccurrence,
  type FinanceRecurringTemplate,
} from "./model";
import { RecordDialog } from "./record-dialog";
import { Reports } from "./reports";
import { TransferDialog } from "./transfer-dialog";
import { Transactions } from "./transactions";
import { financeErrorMessage } from "./error";
import { tx } from "../../app/i18n";

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
      onError(financeErrorMessage(error), tx("财务分类没有初始化"));
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
          <p className="route-eyebrow">{tx("独立的真实资金账本")}</p>
          <h1>{tx("财务")}</h1>
          <p>{tx("余额来自已入账分录，和工作台金币完全分开。")}</p>
        </div>
        <div className="finance-head-actions">
          <IconButton
            label={hidden ? tx("显示金额") : tx("隐藏金额")}
            onClick={toggleHidden}
          >
            {hidden ? <Eye size={17} /> : <EyeOff size={17} />}
          </IconButton>
          <Button onClick={() => setRecordKind("INCOME")}>
            <ArrowUpCircle size={16} />{tx("记收入")}</Button>
          <Button onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight size={16} />{tx("转账")}</Button>
          <Button variant="primary" onClick={() => setRecordKind("EXPENSE")}>
            <ArrowDownCircle size={16} />{tx("记支出")}</Button>
        </div>
      </header>
      <nav className="finance-tabs" aria-label={tx("财务导航")}>
        <button
          className={tab === "overview" ? "is-active" : ""}
          onClick={() => chooseTab("overview")}
        >{tx("概览")}</button>
        <button
          className={tab === "accounts" ? "is-active" : ""}
          onClick={() => chooseTab("accounts")}
        >{tx("账户")}</button>
        <button
          className={tab === "transactions" ? "is-active" : ""}
          onClick={() => chooseTab("transactions")}
        >{tx("流水")}</button>
        <button
          className={tab === "budgets" ? "is-active" : ""}
          onClick={() => chooseTab("budgets")}
        >{tx("预算")}</button>
        <button
          className={tab === "recurring" ? "is-active" : ""}
          onClick={() => chooseTab("recurring")}
        >{tx("周期")}</button>
        <button
          className={tab === "reports" ? "is-active" : ""}
          onClick={() => chooseTab("reports")}
        >{tx("报表")}</button>
      </nav>
      {loading ? <p className="route-state">{tx("正在读取账本...")}</p> : null}
      {!loading && !categories.data?.length ? (
        <section className="finance-onboarding">
          <Landmark size={30} />
          <div>
            <h2>{tx("开始使用独立财务账本")}</h2>
            <p>{tx("初始化常用收入和支出分类；不会读取或转换任务、奖励与股票复盘。")}</p>
          </div>
          <Button variant="primary" onClick={() => void initialize()}>{tx("初始化财务分类")}</Button>
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
