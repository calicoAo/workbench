import { formatCurrencyCents, tx } from "../../app/i18n";
export type FinanceAccountType = "CASH" | "BANK" | "PAYMENT" | "CREDIT";
export type FinanceCategoryKind = "INCOME" | "EXPENSE";
export type FinanceTransactionType = "OPENING" | "INCOME" | "EXPENSE" | "TRANSFER" | "REFUND" | "REVERSAL" | "CORRECTION";
export type FinanceTransactionStatus = "POSTED" | "REVERSED" | "VOIDED";

export type FinanceAccount = {
  id: number; name: string; type: FinanceAccountType; currency: "CNY"; includeInOverview: boolean;
  openingDate: string; archivedAt: string | null; version: number; balanceCents: string;
};

export type FinanceCategory = {
  id: number; kind: FinanceCategoryKind; name: string; sortOrder: number; enabled: boolean; version: number;
};

export type FinanceTransaction = {
  id: number; type: FinanceTransactionType; occurredAt: string; recordTimezone: string; businessDate: string;
  categoryId: number | null; categoryName: string | null; note: string | null; version: number; status?: FinanceTransactionStatus;
  accountId: number | null; accountName: string | null; accountType: FinanceAccountType | null; amountCents: string;
  displayAmountCents?: string; incomeContributionCents?: string; expenseContributionCents?: string;
  sourceAccountId?: number | null; sourceAccountName?: string | null; targetAccountId?: number | null; targetAccountName?: string | null; relatedTransactionId?: number | null;
  transfer?: { amountCents: string; sourceAccountName: string | null; targetAccountName: string | null; feeAmountCents: string } | null;
  refund?: { originalAmountCents: string; refundedAmountCents: string; remainingRefundableCents: string; canRefund: boolean; refunds: Array<{ id: number; amountCents: string; businessDate: string; occurredAt: string; accountName: string | null; note: string | null }> } | null;
  correction?: { original: { id: number; amountCents: string; accountName: string | null; categoryName: string | null; businessDate: string; status: string } | null; current: { id: number; amountCents: string; accountName: string | null; categoryName: string | null; businessDate: string } | null } | null;
  voided?: { message: string } | null;
  entries?: Array<{ id: number; accountId: number; accountName: string; accountType: FinanceAccountType; amountCents: string }>;
};

export type FinanceOverview = {
  currency: "CNY"; month: string; recordTimezone: string; totalAssetsCents: string; totalLiabilitiesCents: string;
  netWorthCents: string; monthlyIncomeCents: string; monthlyExpenseCents: string; accountCount: number;
  accounts: FinanceAccount[]; recentTransactions: FinanceTransaction[];
  budgetSummary?: { limitCents: string; spentCents: string; remainingCents: string } | null;
  pendingRecurringSummary?: { count: number };
};

export type FinanceBudget = { id: number; budgetMonth: string; categoryId: number | null; categoryName: string | null; limitCents: string; spentCents: string; remainingCents: string; version: number };
export type FinanceRecurringTemplate = { id: number; type: "INCOME" | "EXPENSE"; name: string; amountCents: string; accountId: number; accountName: string; categoryId: number; categoryName: string; frequency: "MONTHLY" | "WEEKLY"; scheduleValue: number; startDate: string; endDate: string | null; enabled: boolean; version: number };
export type FinanceRecurringOccurrence = { id: number; templateId: number; scheduledDate: string; recordTimezone: string; status: "PENDING" | "POSTED" | "SKIPPED"; amountCentsSnapshot: string; accountIdSnapshot: number; categoryIdSnapshot: number; postedTransactionId: number | null; version: number; templateName: string; type: "INCOME" | "EXPENSE"; accountName: string; categoryName: string };
export type FinanceReport = { month: string; monthly: { incomeCents: string; expenseCents: string; netCashflowCents: string }; categories: Array<{ categoryId: number | null; categoryName: string; netExpenseCents: string; netRefund: boolean }>; accounts: Array<{ accountId: number; accountName: string; startingBalanceCents: string; inflowCents: string; outflowCents: string; netChangeCents: string; endingBalanceCents: string; reconciled: boolean }>; reconciliation: boolean };

export function yuan(cents: string, hidden = false) {
  if (hidden) return "¥••••";
  return formatCurrencyCents(cents);
}

export function decimalToCents(value: string) {
  const normalized = value.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) throw new Error(tx("请输入最多两位小数的金额"));
  const negative = normalized.startsWith("-"); const [whole, fraction = ""] = normalized.replace("-", "").split(".");
  return `${negative ? "-" : ""}${BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))}`;
}

export const accountTypeLabel: Record<FinanceAccountType, string> = { CASH: "现金", BANK: "银行", PAYMENT: "支付账户", CREDIT: "信用账户" };
export const transactionTypeLabel: Record<FinanceTransactionType, string> = { OPENING: "期初", INCOME: "收入", EXPENSE: "支出", TRANSFER: "转账", REFUND: "退款", REVERSAL: "冲正", CORRECTION: "更正" };
