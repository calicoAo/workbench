import { and, asc, desc, eq, isNull, like, lt, sql } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { financeAccounts, financeBudgets, financeCategories, financeEntries, financeRecurringOccurrences, financeRecurringTemplates, financeTransactions, users } from "./db/schema.js";
import { FinanceAccountType, FinanceCategoryKind, FinanceTransactionSource, FinanceTransactionStatus, FinanceTransactionType } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { runMutation } from "./mutation-receipt.js";
import { businessDateAt, localDateTimeToUtc } from "./time.js";

const accountTypeNames = ["CASH", "BANK", "PAYMENT", "CREDIT"] as const;
const categoryKindNames = ["INCOME", "EXPENSE"] as const;
const transactionTypeNames = ["OPENING", "INCOME", "EXPENSE", "TRANSFER", "REFUND", "REVERSAL", "CORRECTION"] as const;
const MAX_CENTS = 9_223_372_036_854_775_807n;
const MIN_CENTS = -9_223_372_036_854_775_808n;

const defaultCategories = [
  [FinanceCategoryKind.EXPENSE, "餐饮", 10], [FinanceCategoryKind.EXPENSE, "交通", 20],
  [FinanceCategoryKind.EXPENSE, "购物", 30], [FinanceCategoryKind.EXPENSE, "居住", 40],
  [FinanceCategoryKind.EXPENSE, "娱乐", 50], [FinanceCategoryKind.EXPENSE, "健康", 60],
  [FinanceCategoryKind.EXPENSE, "学习", 70], [FinanceCategoryKind.EXPENSE, "社交", 80],
  [FinanceCategoryKind.EXPENSE, "其他", 90], [FinanceCategoryKind.INCOME, "工资", 10],
  [FinanceCategoryKind.INCOME, "奖金", 20], [FinanceCategoryKind.INCOME, "副业", 30],
  [FinanceCategoryKind.INCOME, "其他收入", 40]
] as const;

type AccountTypeName = (typeof accountTypeNames)[number];
type CategoryKindName = (typeof categoryKindNames)[number];
type TransactionTypeName = (typeof transactionTypeNames)[number];

function accountTypeValue(value: AccountTypeName) { return accountTypeNames.indexOf(value); }
function categoryKindValue(value: CategoryKindName) { return categoryKindNames.indexOf(value); }
function transactionTypeValue(value: TransactionTypeName) { return transactionTypeNames.indexOf(value); }

function cents(value: string, positive = false) {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) throw new BusinessError(ErrorCode.PARAM_ERROR, "amountCents must be a canonical integer string", 400);
  const parsed = BigInt(value);
  if (parsed < MIN_CENTS || parsed > MAX_CENTS || (positive && parsed <= 0n)) throw new BusinessError(ErrorCode.PARAM_ERROR, positive ? "amountCents must be positive" : "amountCents is out of range", 400);
  return parsed;
}

async function timezoneFor(client: DatabaseClient, userId: number) {
  const [user] = await client.select({ timezone: users.timezone }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
  if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
  return user.timezone;
}

function occurredAt(date: string, time: string, timezone: string) {
  try { return localDateTimeToUtc(date, time.length === 5 ? `${time}:00` : time, timezone); }
  catch { throw new BusinessError(ErrorCode.PARAM_ERROR, "occurred local date-time is invalid", 400); }
}

async function lockedAccount(client: DatabaseClient, userId: number, id: number) {
  const [account] = await client.select().from(financeAccounts).where(and(eq(financeAccounts.id, id), eq(financeAccounts.userId, userId))).for("update");
  if (!account) throw new BusinessError(ErrorCode.NOT_FOUND, "finance account not found", 404);
  return account;
}

async function lockedCategory(client: DatabaseClient, userId: number, id: number) {
  const [category] = await client.select().from(financeCategories).where(and(eq(financeCategories.id, id), eq(financeCategories.userId, userId))).for("update");
  if (!category) throw new BusinessError(ErrorCode.NOT_FOUND, "finance category not found", 404);
  return category;
}

export async function initializeFinance(input: { userId: number; operationId: string }) {
  return runMutation({ ...input, commandType: "FINANCE_INITIALIZE", request: {} }, async (tx) => {
    const now = new Date();
    for (const [kind, name, sortOrder] of defaultCategories) {
      await tx.insert(financeCategories).values({ userId: input.userId, kind, name, sortOrder, enabled: 1, version: 1, createdAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { updatedAt: sql`${financeCategories.updatedAt}` } });
    }
    const rows = await tx.select({ id: financeCategories.id }).from(financeCategories).where(eq(financeCategories.userId, input.userId));
    return { initialized: true, categoryCount: rows.length };
  });
}

export async function createFinanceAccount(input: { userId: number; operationId: string; name: string; type: AccountTypeName; openingDate: string; openingBalanceCents: string; includeInOverview: boolean }) {
  const openingBalance = cents(input.openingBalanceCents);
  const request = { name: input.name, type: input.type, openingDate: input.openingDate, openingBalanceCents: openingBalance.toString(), includeInOverview: input.includeInOverview };
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_CREATE_ACCOUNT", request }, async (tx) => {
    const timezone = await timezoneFor(tx, input.userId);
    const now = new Date();
    const [accountResult] = await tx.insert(financeAccounts).values({ userId: input.userId, name: input.name, type: accountTypeValue(input.type), currency: "CNY", includeInOverview: input.includeInOverview ? 1 : 0, openingDate: input.openingDate, version: 1, createdAt: now, updatedAt: now });
    let openingTransactionId: number | null = null;
    if (openingBalance !== 0n) {
      const [transactionResult] = await tx.insert(financeTransactions).values({ userId: input.userId, type: FinanceTransactionType.OPENING, occurredAt: occurredAt(input.openingDate, "00:00", timezone), recordTimezone: timezone, businessDate: input.openingDate, categoryId: null, note: "期初余额", status: FinanceTransactionStatus.POSTED, source: FinanceTransactionSource.MANUAL, version: 1, createdAt: now, updatedAt: now });
      openingTransactionId = transactionResult.insertId;
      await tx.insert(financeEntries).values({ userId: input.userId, transactionId: openingTransactionId, accountId: accountResult.insertId, amountCents: openingBalance, createdAt: now });
    }
    return { id: accountResult.insertId, version: 1, openingTransactionId, balanceCents: openingBalance.toString() };
  });
}

export async function updateFinanceAccount(input: { userId: number; accountId: number; expectedVersion: number; name?: string; includeInOverview?: boolean; archived?: boolean }) {
  return db.transaction(async (tx) => {
    const account = await lockedAccount(tx, input.userId, input.accountId);
    if (account.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "finance account version conflict", 409);
    const version = account.version + 1;
    await tx.update(financeAccounts).set({ name: input.name ?? account.name, includeInOverview: input.includeInOverview === undefined ? account.includeInOverview : input.includeInOverview ? 1 : 0, archivedAt: input.archived === undefined ? account.archivedAt : input.archived ? new Date() : null, version, updatedAt: new Date() }).where(eq(financeAccounts.id, account.id));
    return { id: account.id, version, archived: input.archived ?? Boolean(account.archivedAt) };
  });
}

export async function archiveFinanceAccount(input: { userId: number; operationId: string; accountId: number; expectedVersion: number; archived: boolean }) {
  return runMutation({
    userId: input.userId,
    operationId: input.operationId,
    commandType: input.archived ? "FINANCE_ARCHIVE_ACCOUNT" : "FINANCE_UNARCHIVE_ACCOUNT",
    request: { accountId: input.accountId, expectedVersion: input.expectedVersion, archived: input.archived }
  }, async (tx) => {
    const account = await lockedAccount(tx, input.userId, input.accountId);
    if (account.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "finance account version conflict", 409);
    const version = account.version + 1;
    await tx.update(financeAccounts).set({ archivedAt: input.archived ? new Date() : null, version, updatedAt: new Date() }).where(eq(financeAccounts.id, account.id));
    return { id: account.id, version, archived: input.archived };
  });
}

export async function createFinanceCategory(input: { userId: number; kind: CategoryKindName; name: string; sortOrder: number }) {
  const now = new Date();
  try {
    const [result] = await db.insert(financeCategories).values({ userId: input.userId, kind: categoryKindValue(input.kind), name: input.name, sortOrder: input.sortOrder, enabled: 1, version: 1, createdAt: now, updatedAt: now });
    return { id: result.insertId, version: 1 };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ER_DUP_ENTRY") throw new BusinessError(ErrorCode.CONFLICT, "finance category name already exists", 409);
    throw error;
  }
}

export async function updateFinanceCategory(input: { userId: number; categoryId: number; expectedVersion: number; name?: string; sortOrder?: number; enabled?: boolean }) {
  try {
    return await db.transaction(async (tx) => {
      const category = await lockedCategory(tx, input.userId, input.categoryId);
      if (category.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "finance category version conflict", 409);
      const version = category.version + 1;
      await tx.update(financeCategories).set({ name: input.name ?? category.name, sortOrder: input.sortOrder ?? category.sortOrder, enabled: input.enabled === undefined ? category.enabled : input.enabled ? 1 : 0, version, updatedAt: new Date() }).where(eq(financeCategories.id, category.id));
      return { id: category.id, version, enabled: input.enabled ?? Boolean(category.enabled) };
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ER_DUP_ENTRY") throw new BusinessError(ErrorCode.CONFLICT, "finance category name already exists", 409);
    throw error;
  }
}

export async function createFinanceTransaction(input: { userId: number; operationId: string; type: "INCOME" | "EXPENSE"; accountId: number; categoryId: number; amountCents: string; occurredDate: string; occurredTime: string; note?: string | null }) {
  const amount = cents(input.amountCents, true);
  const request = { type: input.type, accountId: input.accountId, categoryId: input.categoryId, amountCents: amount.toString(), occurredDate: input.occurredDate, occurredTime: input.occurredTime, note: input.note?.trim() || null };
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: `FINANCE_CREATE_${input.type}`, request }, async (tx) => {
    const account = await lockedAccount(tx, input.userId, input.accountId);
    if (account.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "archived finance account cannot receive new transactions", 409);
    if (account.currency !== "CNY") throw new BusinessError(ErrorCode.CONFLICT, "FIN-01 supports CNY accounts only", 409);
    const category = await lockedCategory(tx, input.userId, input.categoryId);
    const expectedKind = input.type === "INCOME" ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE;
    if (!category.enabled) throw new BusinessError(ErrorCode.CONFLICT, "disabled finance category cannot be used for a new transaction", 409);
    if (category.kind !== expectedKind) throw new BusinessError(ErrorCode.CONFLICT, "finance category kind does not match transaction type", 409);
    const timezone = await timezoneFor(tx, input.userId);
    const now = new Date();
    const type = input.type === "INCOME" ? FinanceTransactionType.INCOME : FinanceTransactionType.EXPENSE;
    const [transactionResult] = await tx.insert(financeTransactions).values({ userId: input.userId, type, occurredAt: occurredAt(input.occurredDate, input.occurredTime, timezone), recordTimezone: timezone, businessDate: input.occurredDate, categoryId: category.id, note: input.note?.trim() || null, status: FinanceTransactionStatus.POSTED, source: FinanceTransactionSource.MANUAL, version: 1, createdAt: now, updatedAt: now });
    const signedAmount = input.type === "INCOME" ? amount : -amount;
    const [entryResult] = await tx.insert(financeEntries).values({ userId: input.userId, transactionId: transactionResult.insertId, accountId: account.id, amountCents: signedAmount, createdAt: now });
    return { id: transactionResult.insertId, transactionId: transactionResult.insertId, entryId: entryResult.insertId, version: 1, amountCents: signedAmount.toString(), businessDate: input.occurredDate, recordTimezone: timezone };
  });
}

export async function postImportedFinanceTransaction(client: DatabaseClient, input: { userId: number; type: "INCOME" | "EXPENSE"; accountId: number; categoryId: number; amountCents: bigint; occurredDate: string; occurredTime: string; recordTimezone: string; note?: string | null; importBatchId: number; sourceRowKey: string; sourceNamespace: string; sourceRowFingerprint: string }) {
  const account = await lockedAccount(client, input.userId, input.accountId);
  if (account.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "archived finance account cannot receive imported transactions", 409);
  if (account.currency !== "CNY") throw new BusinessError(ErrorCode.CONFLICT, "finance import supports CNY accounts only", 409);
  const category = await lockedCategory(client, input.userId, input.categoryId);
  const expectedKind = input.type === "INCOME" ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE;
  if (!category.enabled) throw new BusinessError(ErrorCode.CONFLICT, "disabled finance category cannot be used for an imported transaction", 409);
  if (category.kind !== expectedKind) throw new BusinessError(ErrorCode.CONFLICT, "finance category kind does not match imported transaction type", 409);
  const absoluteAmount = input.amountCents < 0n ? -input.amountCents : input.amountCents;
  if (absoluteAmount === 0n) throw new BusinessError(ErrorCode.PARAM_ERROR, "finance amount must be non-zero", 400);
  const now = new Date();
  const [transaction] = await client.insert(financeTransactions).values({
    userId: input.userId,
    type: input.type === "INCOME" ? FinanceTransactionType.INCOME : FinanceTransactionType.EXPENSE,
    occurredAt: occurredAt(input.occurredDate, input.occurredTime, input.recordTimezone),
    recordTimezone: input.recordTimezone,
    businessDate: input.occurredDate,
    categoryId: category.id,
    note: input.note?.trim() || null,
    status: FinanceTransactionStatus.POSTED,
    source: FinanceTransactionSource.IMPORT,
    importBatchId: input.importBatchId,
    sourceRowKey: input.sourceRowKey,
    sourceNamespace: input.sourceNamespace,
    sourceRowFingerprint: input.sourceRowFingerprint,
    version: 1,
    createdAt: now,
    updatedAt: now
  });
  const [entry] = await client.insert(financeEntries).values({ userId: input.userId, transactionId: transaction.insertId, accountId: account.id, amountCents: input.type === "INCOME" ? absoluteAmount : -absoluteAmount, createdAt: now });
  return { id: transaction.insertId, transactionId: transaction.insertId, entryId: entry.insertId };
}

type FinanceMovement = { accountId: number; amountCents: bigint };
type FinanceCommandDate = { occurredDate: string; occurredTime: string; note?: string | null };

async function insertFinanceHeader(client: DatabaseClient, input: { userId: number; type: number; categoryId?: number | null; sourceAccountId?: number | null; targetAccountId?: number | null; relatedTransactionId?: number | null } & FinanceCommandDate, timezone: string, now: Date) {
  const [result] = await client.insert(financeTransactions).values({ userId: input.userId, type: input.type, occurredAt: occurredAt(input.occurredDate, input.occurredTime, timezone), recordTimezone: timezone, businessDate: input.occurredDate, categoryId: input.categoryId ?? null, sourceAccountId: input.sourceAccountId ?? null, targetAccountId: input.targetAccountId ?? null, relatedTransactionId: input.relatedTransactionId ?? null, note: input.note?.trim() || null, status: FinanceTransactionStatus.POSTED, source: FinanceTransactionSource.MANUAL, version: 1, createdAt: now, updatedAt: now });
  return result.insertId;
}

async function insertFinanceEntries(client: DatabaseClient, userId: number, transactionId: number, movements: FinanceMovement[], now: Date) {
  await client.insert(financeEntries).values(movements.map((movement) => ({ userId, transactionId, accountId: movement.accountId, amountCents: movement.amountCents, createdAt: now })));
}

async function lockedAccounts(client: DatabaseClient, userId: number, ids: number[]) {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  const rows = [];
  for (const id of unique) rows.push(await lockedAccount(client, userId, id));
  return rows;
}

export async function createFinanceTransfer(input: { userId: number; operationId: string; sourceAccountId: number; targetAccountId: number; amountCents: string; feeAmountCents?: string; feeCategoryId?: number; occurredDate: string; occurredTime: string; note?: string | null }) {
  if (input.sourceAccountId === input.targetAccountId) throw new BusinessError(ErrorCode.CONFLICT, "source and target accounts must differ", 409);
  const amount = cents(input.amountCents, true); const fee = input.feeAmountCents ? cents(input.feeAmountCents, true) : 0n;
  const request = { ...input, amountCents: amount.toString(), feeAmountCents: fee.toString(), note: input.note?.trim() || null };
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_TRANSFER", request }, async (tx) => {
    const accounts = await lockedAccounts(tx, input.userId, [input.sourceAccountId, input.targetAccountId]);
    for (const account of accounts) { if (account.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "archived finance account cannot be used for a new transfer", 409); if (account.currency !== "CNY") throw new BusinessError(ErrorCode.CONFLICT, "FIN-02 supports CNY accounts only", 409); }
    const timezone = await timezoneFor(tx, input.userId); const now = new Date();
    const transferId = await insertFinanceHeader(tx, { ...input, userId: input.userId, type: FinanceTransactionType.TRANSFER, sourceAccountId: input.sourceAccountId, targetAccountId: input.targetAccountId }, timezone, now);
    await insertFinanceEntries(tx, input.userId, transferId, [{ accountId: input.sourceAccountId, amountCents: -amount }, { accountId: input.targetAccountId, amountCents: amount }], now);
    let feeTransactionId: number | null = null;
    if (fee > 0n) {
      if (!input.feeCategoryId) throw new BusinessError(ErrorCode.PARAM_ERROR, "feeCategoryId is required when feeAmountCents is present", 400);
      const category = await lockedCategory(tx, input.userId, input.feeCategoryId);
      if (category.kind !== FinanceCategoryKind.EXPENSE || !category.enabled) throw new BusinessError(ErrorCode.CONFLICT, "fee category must be an enabled expense category", 409);
      feeTransactionId = await insertFinanceHeader(tx, { ...input, userId: input.userId, type: FinanceTransactionType.EXPENSE, categoryId: category.id, relatedTransactionId: transferId }, timezone, now);
      await insertFinanceEntries(tx, input.userId, feeTransactionId, [{ accountId: input.sourceAccountId, amountCents: -fee }], now);
    }
    return { id: transferId, transactionId: transferId, feeTransactionId, version: 1 };
  });
}

async function lockedTransaction(client: DatabaseClient, userId: number, id: number) {
  const [transaction] = await client.select().from(financeTransactions).where(and(eq(financeTransactions.id, id), eq(financeTransactions.userId, userId))).for("update");
  if (!transaction) throw new BusinessError(ErrorCode.NOT_FOUND, "finance transaction not found", 404);
  return transaction;
}

async function transactionEntries(client: DatabaseClient, userId: number, transactionId: number) {
  return client.select().from(financeEntries).where(and(eq(financeEntries.userId, userId), eq(financeEntries.transactionId, transactionId))).orderBy(asc(financeEntries.id));
}

export async function refundFinanceTransaction(input: { userId: number; operationId: string; transactionId: number; expectedVersion: number; accountId?: number; amountCents: string } & FinanceCommandDate) {
  const amount = cents(input.amountCents, true); const request = { ...input, amountCents: amount.toString() };
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_REFUND", request }, async (tx) => {
    const original = await lockedTransaction(tx, input.userId, input.transactionId);
    if (original.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "finance transaction version conflict", 409);
    if (original.type !== FinanceTransactionType.EXPENSE || original.status !== FinanceTransactionStatus.POSTED) throw new BusinessError(ErrorCode.CONFLICT, "only posted expenses can be refunded", 409);
    const originalEntries = await transactionEntries(tx, input.userId, original.id); if (originalEntries.length !== 1) throw new BusinessError(ErrorCode.CONFLICT, "expense refund requires one original account", 409);
    const [refunded] = await tx.select({ total: sql<string>`coalesce(sum(${financeEntries.amountCents}), 0)` }).from(financeTransactions).innerJoin(financeEntries, eq(financeEntries.transactionId, financeTransactions.id)).where(and(eq(financeTransactions.userId, input.userId), eq(financeTransactions.type, FinanceTransactionType.REFUND), eq(financeTransactions.relatedTransactionId, original.id), eq(financeTransactions.status, FinanceTransactionStatus.POSTED)));
    if (BigInt(String(refunded?.total ?? "0")) + amount > -BigInt(originalEntries[0].amountCents)) throw new BusinessError(ErrorCode.CONFLICT, "refund exceeds remaining refundable amount", 409);
    const targetAccountId = input.accountId ?? originalEntries[0].accountId; const [account] = await lockedAccounts(tx, input.userId, [targetAccountId]);
    if (account.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "archived finance account cannot receive a refund", 409);
    const timezone = await timezoneFor(tx, input.userId); const now = new Date(); const id = await insertFinanceHeader(tx, { ...input, userId: input.userId, type: FinanceTransactionType.REFUND, categoryId: original.categoryId, relatedTransactionId: original.id }, timezone, now);
    await insertFinanceEntries(tx, input.userId, id, [{ accountId: targetAccountId, amountCents: amount }], now);
    const nextVersion = original.version + 1;
    await tx.update(financeTransactions).set({ version: nextVersion, updatedAt: now }).where(eq(financeTransactions.id, original.id));
    return { id, transactionId: id, originalTransactionId: original.id, version: 1, originalVersion: nextVersion, remainingRefundableCents: (-BigInt(originalEntries[0].amountCents) - BigInt(String(refunded?.total ?? "0")) - amount).toString() };
  });
}

export async function correctFinanceTransaction(input: { userId: number; operationId: string; transactionId: number; expectedVersion: number; amountCents: string; accountId?: number; categoryId?: number; } & FinanceCommandDate) {
  const amount = cents(input.amountCents, true); const request = { ...input, amountCents: amount.toString() };
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_CORRECT", request }, async (tx) => {
    const original = await lockedTransaction(tx, input.userId, input.transactionId); if (original.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "finance transaction version conflict", 409); if (original.type !== FinanceTransactionType.INCOME && original.type !== FinanceTransactionType.EXPENSE) throw new BusinessError(ErrorCode.CONFLICT, "only income or expense can be corrected", 409); if (original.status !== FinanceTransactionStatus.POSTED) throw new BusinessError(ErrorCode.CONFLICT, "transaction is no longer correctable", 409);
    const originalEntries = await transactionEntries(tx, input.userId, original.id); const accountId = input.accountId ?? originalEntries[0]?.accountId; if (!accountId) throw new BusinessError(ErrorCode.CONFLICT, "transaction has no account", 409); const [account] = await lockedAccounts(tx, input.userId, [accountId]); if (account.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "archived account cannot receive a correction", 409);
    const category = await lockedCategory(tx, input.userId, input.categoryId ?? original.categoryId!); if (!category.enabled) throw new BusinessError(ErrorCode.CONFLICT, "correction requires an enabled category", 409); if (category.kind !== (original.type === FinanceTransactionType.INCOME ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE)) throw new BusinessError(ErrorCode.CONFLICT, "category kind does not match original transaction", 409);
    const timezone = await timezoneFor(tx, input.userId); const now = new Date(); const reversalId = await insertFinanceHeader(tx, { ...input, userId: input.userId, type: FinanceTransactionType.REVERSAL, relatedTransactionId: original.id }, timezone, now); await insertFinanceEntries(tx, input.userId, reversalId, originalEntries.map((entry) => ({ accountId: entry.accountId, amountCents: -BigInt(entry.amountCents) })), now);
    const replacementId = await insertFinanceHeader(tx, { ...input, userId: input.userId, type: FinanceTransactionType.CORRECTION, categoryId: category.id, relatedTransactionId: original.id }, timezone, now); await insertFinanceEntries(tx, input.userId, replacementId, [{ accountId, amountCents: original.type === FinanceTransactionType.INCOME ? amount : -amount }], now);
    await tx.update(financeTransactions).set({ status: FinanceTransactionStatus.REVERSED, version: original.version + 1, updatedAt: now }).where(eq(financeTransactions.id, original.id));
    return { id: replacementId, transactionId: replacementId, originalTransactionId: original.id, reversalTransactionId: reversalId, version: 1 };
  });
}

export async function voidFinanceTransaction(input: { userId: number; operationId: string; transactionId: number; expectedVersion: number; occurredDate?: string; occurredTime?: string; note?: string | null }) {
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_VOID", request: input }, async (tx) => {
    const original = await lockedTransaction(tx, input.userId, input.transactionId); if (original.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "finance transaction version conflict", 409); if (original.type !== FinanceTransactionType.INCOME && original.type !== FinanceTransactionType.EXPENSE) throw new BusinessError(ErrorCode.CONFLICT, "only income or expense can be voided", 409); if (original.status !== FinanceTransactionStatus.POSTED) throw new BusinessError(ErrorCode.CONFLICT, "transaction is no longer voidable", 409);
    const originalEntries = await transactionEntries(tx, input.userId, original.id); const timezone = await timezoneFor(tx, input.userId); const now = new Date(); const reversalId = await insertFinanceHeader(tx, { ...input, userId: input.userId, type: FinanceTransactionType.REVERSAL, relatedTransactionId: original.id, occurredDate: input.occurredDate ?? original.businessDate, occurredTime: input.occurredTime ?? "00:00" }, timezone, now); await insertFinanceEntries(tx, input.userId, reversalId, originalEntries.map((entry) => ({ accountId: entry.accountId, amountCents: -BigInt(entry.amountCents) })), now); await tx.update(financeTransactions).set({ status: FinanceTransactionStatus.VOIDED, version: original.version + 1, updatedAt: now }).where(eq(financeTransactions.id, original.id)); return { id: reversalId, transactionId: reversalId, originalTransactionId: original.id, version: original.version + 1 };
  });
}

export async function updateFinanceTransactionNote(input: { userId: number; transactionId: number; expectedVersion: number; note: string | null }) {
  return db.transaction(async (tx) => {
    const [transaction] = await tx.select().from(financeTransactions).where(and(eq(financeTransactions.id, input.transactionId), eq(financeTransactions.userId, input.userId))).for("update");
    if (!transaction) throw new BusinessError(ErrorCode.NOT_FOUND, "finance transaction not found", 404);
    if (transaction.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "finance transaction version conflict", 409);
    const version = transaction.version + 1;
    await tx.update(financeTransactions).set({ note: input.note?.trim() || null, version, updatedAt: new Date() }).where(eq(financeTransactions.id, transaction.id));
    return { id: transaction.id, version };
  });
}

export async function financeAccountsForUser(userId: number, view: "active" | "archived" | "all" = "active") {
  const rows = await db.select({
    id: financeAccounts.id, name: financeAccounts.name, type: financeAccounts.type, currency: financeAccounts.currency,
    includeInOverview: financeAccounts.includeInOverview, openingDate: financeAccounts.openingDate, archivedAt: financeAccounts.archivedAt,
    version: financeAccounts.version, createdAt: financeAccounts.createdAt, updatedAt: financeAccounts.updatedAt,
    balanceCents: sql<string>`cast(coalesce(sum(${financeEntries.amountCents}), 0) as char)`
  }).from(financeAccounts)
    .leftJoin(financeEntries, and(eq(financeEntries.accountId, financeAccounts.id), eq(financeEntries.userId, userId)))
    .leftJoin(financeTransactions, and(eq(financeTransactions.id, financeEntries.transactionId), eq(financeTransactions.userId, userId)))
    .where(and(eq(financeAccounts.userId, userId), view === "active" ? isNull(financeAccounts.archivedAt) : view === "archived" ? sql`${financeAccounts.archivedAt} is not null` : sql`true`))
    .groupBy(financeAccounts.id).orderBy(asc(financeAccounts.archivedAt), asc(financeAccounts.type), asc(financeAccounts.id));
  return rows.map((row) => ({ ...row, type: accountTypeNames[row.type], includeInOverview: Boolean(row.includeInOverview), balanceCents: String(row.balanceCents) }));
}

export async function financeCategoriesForUser(userId: number) {
  const rows = await db.select().from(financeCategories).where(eq(financeCategories.userId, userId)).orderBy(asc(financeCategories.kind), asc(financeCategories.sortOrder), asc(financeCategories.id));
  return rows.map((row) => ({ ...row, kind: categoryKindNames[row.kind], enabled: Boolean(row.enabled) }));
}

type TransactionFilters = { transactionId?: number; from?: string; to?: string; accountId?: number; categoryId?: number; type?: TransactionTypeName; keyword?: string; cursor?: number; limit: number };

export async function financeTransactionsForUser(userId: number, filters: TransactionFilters) {
  const conditions = [eq(financeTransactions.userId, userId), filters.type === "REVERSAL" ? eq(financeTransactions.type, FinanceTransactionType.REVERSAL) : sql`${financeTransactions.type} <> ${FinanceTransactionType.REVERSAL}`];
  if (filters.transactionId) conditions.push(eq(financeTransactions.id, filters.transactionId));
  if (filters.from) conditions.push(sql`${financeTransactions.businessDate} >= ${filters.from}`);
  if (filters.to) conditions.push(sql`${financeTransactions.businessDate} <= ${filters.to}`);
  if (filters.accountId) conditions.push(eq(financeEntries.accountId, filters.accountId));
  if (filters.categoryId) conditions.push(eq(financeTransactions.categoryId, filters.categoryId));
  if (filters.type && filters.type !== "REVERSAL") conditions.push(eq(financeTransactions.type, transactionTypeValue(filters.type)));
  if (filters.keyword) conditions.push(like(financeTransactions.note, `%${filters.keyword}%`));
  if (filters.cursor) conditions.push(lt(financeTransactions.id, filters.cursor));
  const rows = await db.select({
    id: financeTransactions.id, type: financeTransactions.type, occurredAt: financeTransactions.occurredAt,
    recordTimezone: financeTransactions.recordTimezone, businessDate: financeTransactions.businessDate,
    categoryId: financeTransactions.categoryId, categoryName: financeCategories.name, note: financeTransactions.note,
    status: financeTransactions.status, source: financeTransactions.source, version: financeTransactions.version,
    accountId: sql<number | null>`case when ${financeTransactions.type} = ${FinanceTransactionType.TRANSFER} then null else max(${financeEntries.accountId}) end`, accountName: sql<string | null>`case when ${financeTransactions.type} = ${FinanceTransactionType.TRANSFER} then null else max(${financeAccounts.name}) end`, accountType: sql<number | null>`case when ${financeTransactions.type} = ${FinanceTransactionType.TRANSFER} then null else max(${financeAccounts.type}) end`,
    amountCents: sql<string>`cast(coalesce(sum(${financeEntries.amountCents}), 0) as char)`, displayAmountCents: sql<string>`cast(coalesce(sum(case when ${financeEntries.amountCents} > 0 then ${financeEntries.amountCents} else 0 end), 0) as char)`, sourceAccountId: financeTransactions.sourceAccountId, targetAccountId: financeTransactions.targetAccountId, relatedTransactionId: financeTransactions.relatedTransactionId
  }).from(financeTransactions)
    .innerJoin(financeEntries, and(eq(financeEntries.transactionId, financeTransactions.id), eq(financeEntries.userId, userId)))
    .innerJoin(financeAccounts, and(eq(financeAccounts.id, financeEntries.accountId), eq(financeAccounts.userId, userId)))
    .leftJoin(financeCategories, and(eq(financeCategories.id, financeTransactions.categoryId), eq(financeCategories.userId, userId)))
    .where(and(...conditions)).groupBy(financeTransactions.id, financeTransactions.type, financeTransactions.occurredAt, financeTransactions.recordTimezone, financeTransactions.businessDate, financeTransactions.categoryId, financeTransactions.note, financeTransactions.status, financeTransactions.source, financeTransactions.version, financeTransactions.sourceAccountId, financeTransactions.targetAccountId, financeTransactions.relatedTransactionId, financeCategories.name).orderBy(desc(financeTransactions.occurredAt), desc(financeTransactions.id)).limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const accountIds = [...new Set(rows.slice(0, filters.limit).flatMap((row) => [row.sourceAccountId, row.targetAccountId].filter((id): id is number => id !== null)))];
  const accountRows = accountIds.length ? await db.select({ id: financeAccounts.id, name: financeAccounts.name }).from(financeAccounts).where(and(eq(financeAccounts.userId, userId), sql`${financeAccounts.id} in (${sql.join(accountIds.map((id) => sql`${id}`), sql`, `)})`)) : [];
  const accountNames = new Map(accountRows.map((row) => [row.id, row.name]));
  const items = rows.slice(0, filters.limit).map((row) => ({ ...row, type: transactionTypeNames[row.type], status: ["POSTED", "REVERSED", "VOIDED"][row.status], accountType: row.accountType === null ? null : accountTypeNames[row.accountType], amountCents: String(row.amountCents), displayAmountCents: row.type === FinanceTransactionType.TRANSFER ? String(row.displayAmountCents) : String(row.amountCents), incomeContributionCents: row.type === FinanceTransactionType.INCOME ? String(row.amountCents) : "0", expenseContributionCents: row.type === FinanceTransactionType.EXPENSE ? String(-BigInt(String(row.amountCents))) : row.type === FinanceTransactionType.REFUND ? String(-BigInt(String(row.amountCents))) : row.type === FinanceTransactionType.CORRECTION && BigInt(String(row.amountCents)) < 0n ? String(-BigInt(String(row.amountCents))) : "0", sourceAccountId: row.sourceAccountId ?? null, sourceAccountName: row.sourceAccountId ? accountNames.get(row.sourceAccountId) ?? null : null, targetAccountId: row.targetAccountId ?? null, targetAccountName: row.targetAccountId ? accountNames.get(row.targetAccountId) ?? null : null, relatedTransactionId: row.relatedTransactionId ?? null }));
  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

export async function financeTransactionForUser(userId: number, transactionId: number) {
  const [transaction] = await db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.id, transactionId)));
  if (!transaction) throw new BusinessError(ErrorCode.NOT_FOUND, "finance transaction not found", 404);
  const entries = await db.select({ id: financeEntries.id, accountId: financeEntries.accountId, accountName: financeAccounts.name, accountType: financeAccounts.type, amountCents: financeEntries.amountCents }).from(financeEntries).innerJoin(financeAccounts, eq(financeAccounts.id, financeEntries.accountId)).where(and(eq(financeEntries.userId, userId), eq(financeEntries.transactionId, transactionId)));
  const [category] = transaction.categoryId ? await db.select({ name: financeCategories.name }).from(financeCategories).where(eq(financeCategories.id, transaction.categoryId)) : [];
  const related = transaction.relatedTransactionId ? await db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.id, transaction.relatedTransactionId))) : [];
  const children = await db.select().from(financeTransactions).where(and(eq(financeTransactions.userId, userId), eq(financeTransactions.relatedTransactionId, transaction.id)));
  const childEntries = children.length ? await db.select({ transactionId: financeEntries.transactionId, amountCents: financeEntries.amountCents, accountId: financeEntries.accountId }).from(financeEntries).where(and(eq(financeEntries.userId, userId), sql`${financeEntries.transactionId} in (${sql.join(children.map((item) => sql`${item.id}`), sql`, `)})`)) : [];
  const accountIds = [...new Set([transaction.sourceAccountId, transaction.targetAccountId, ...entries.map((entry) => entry.accountId), ...childEntries.map((entry) => entry.accountId)].filter((id): id is number => id !== null))];
  const accountRows = accountIds.length ? await db.select({ id: financeAccounts.id, name: financeAccounts.name, type: financeAccounts.type }).from(financeAccounts).where(and(eq(financeAccounts.userId, userId), sql`${financeAccounts.id} in (${sql.join(accountIds.map((id) => sql`${id}`), sql`, `)})`)) : [];
  const accountNames = new Map(accountRows.map((row) => [row.id, row.name]));
  const accountTypeById = new Map(accountRows.map((row) => [row.id, accountTypeNames[row.type]]));
  const signedAmount = entries.reduce((sum, entry) => sum + BigInt(entry.amountCents), 0n);
  const principalAmount = transaction.type === FinanceTransactionType.TRANSFER ? entries.filter((entry) => BigInt(entry.amountCents) > 0n).reduce((sum, entry) => sum + BigInt(entry.amountCents), 0n) : signedAmount;
  const refundRows = transaction.type === FinanceTransactionType.EXPENSE ? children.filter((item) => item.type === FinanceTransactionType.REFUND && item.status === FinanceTransactionStatus.POSTED) : transaction.type === FinanceTransactionType.REFUND ? [transaction] : [];
  const original = transaction.type === FinanceTransactionType.REFUND ? related[0] : transaction.type === FinanceTransactionType.EXPENSE ? transaction : related[0];
  const originalEntries = original ? (original.id === transaction.id ? entries : await transactionEntries(db, userId, original.id)) : [];
  const originalExpenseAmount = original?.type === FinanceTransactionType.EXPENSE ? -originalEntries.reduce((sum, entry) => sum + BigInt(entry.amountCents), 0n) : 0n;
  const amountEntriesFor = (id: number) => id === transaction.id ? entries : childEntries.filter((entry) => entry.transactionId === id);
  const refunds = refundRows.map((refund) => ({ id: refund.id, amountCents: amountEntriesFor(refund.id).reduce((sum, entry) => sum + BigInt(entry.amountCents), 0n).toString(), businessDate: refund.businessDate, occurredAt: refund.occurredAt, accountName: accountNames.get(amountEntriesFor(refund.id)[0]?.accountId ?? 0) ?? null, note: refund.note }));
  const refundedAmount = refunds.reduce((sum, item) => sum + BigInt(item.amountCents), 0n);
  const correctionOriginal = transaction.type === FinanceTransactionType.CORRECTION ? related[0] : transaction.type === FinanceTransactionType.EXPENSE && transaction.status === FinanceTransactionStatus.REVERSED ? transaction : null;
  const correctionReplacement = transaction.type === FinanceTransactionType.CORRECTION ? transaction : children.find((item) => item.type === FinanceTransactionType.CORRECTION) ?? null;
  const refundIsOpen = original?.type === FinanceTransactionType.EXPENSE && original.status === FinanceTransactionStatus.POSTED;
  const remainingRefundable = refundIsOpen ? originalExpenseAmount - refundedAmount : 0n;
  const summary = {
    displayAmountCents: principalAmount.toString(), incomeContributionCents: transaction.type === FinanceTransactionType.INCOME ? signedAmount.toString() : "0", expenseContributionCents: transaction.type === FinanceTransactionType.EXPENSE ? (-signedAmount).toString() : transaction.type === FinanceTransactionType.REFUND ? (-signedAmount).toString() : transaction.type === FinanceTransactionType.CORRECTION && signedAmount < 0n ? (-signedAmount).toString() : "0",
    transfer: transaction.type === FinanceTransactionType.TRANSFER ? { amountCents: principalAmount.toString(), sourceAccountName: accountNames.get(transaction.sourceAccountId ?? 0) ?? null, targetAccountName: accountNames.get(transaction.targetAccountId ?? 0) ?? null, feeAmountCents: children.filter((item) => item.type === FinanceTransactionType.EXPENSE).reduce((sum, item) => sum + -childEntries.filter((entry) => entry.transactionId === item.id).reduce((entrySum, entry) => entrySum + BigInt(entry.amountCents), 0n), 0n).toString() } : null,
    refund: originalExpenseAmount > 0n ? { originalAmountCents: originalExpenseAmount.toString(), refundedAmountCents: refundedAmount.toString(), remainingRefundableCents: remainingRefundable.toString(), canRefund: refundIsOpen && remainingRefundable > 0n, refunds } : null,
    correction: correctionOriginal || correctionReplacement ? { original: correctionOriginal ? { id: correctionOriginal.id, amountCents: (await transactionEntries(db, userId, correctionOriginal.id)).reduce((sum, entry) => sum + BigInt(entry.amountCents), 0n).toString(), accountName: accountNames.get((await transactionEntries(db, userId, correctionOriginal.id))[0]?.accountId ?? 0) ?? null, categoryName: category?.name ?? null, businessDate: correctionOriginal.businessDate, status: correctionOriginal.status === FinanceTransactionStatus.REVERSED ? "已更正" : "POSTED" } : null, current: correctionReplacement ? { id: correctionReplacement.id, amountCents: childEntries.filter((entry) => entry.transactionId === correctionReplacement.id).reduce((sum, entry) => sum + BigInt(entry.amountCents), 0n).toString(), accountName: accountNames.get(childEntries.find((entry) => entry.transactionId === correctionReplacement.id)?.accountId ?? 0) ?? null, categoryName: category?.name ?? null, businessDate: correctionReplacement.businessDate } : null } : null,
    voided: transaction.status === FinanceTransactionStatus.VOIDED ? { message: "这笔流水仍保留在历史中，但已不再影响余额和报表。" } : null
  };
  return { ...transaction, type: transactionTypeNames[transaction.type], status: ["POSTED", "REVERSED", "VOIDED"][transaction.status], categoryName: category?.name ?? null, accountId: transaction.type === FinanceTransactionType.TRANSFER ? null : entries[0]?.accountId ?? null, accountName: transaction.type === FinanceTransactionType.TRANSFER ? null : accountNames.get(entries[0]?.accountId ?? 0) ?? null, accountType: transaction.type === FinanceTransactionType.TRANSFER ? null : accountTypeById.get(entries[0]?.accountId ?? 0) ?? null, amountCents: signedAmount.toString(), sourceAccountId: transaction.sourceAccountId ?? null, sourceAccountName: accountNames.get(transaction.sourceAccountId ?? 0) ?? null, targetAccountId: transaction.targetAccountId ?? null, targetAccountName: accountNames.get(transaction.targetAccountId ?? 0) ?? null, relatedTransactionId: transaction.relatedTransactionId ?? null, ...summary, entries: entries.map((entry) => ({ ...entry, accountType: accountTypeById.get(entry.accountId)!, amountCents: String(entry.amountCents) })) };
}

export async function financeOverviewForUser(userId: number, month?: string) {
  const timezone = await timezoneFor(db, userId);
  const selectedMonth = month ?? businessDateAt(new Date(), timezone).slice(0, 7);
  const allAccounts = await financeAccountsForUser(userId, "all");
  let totalAssets = 0n, totalLiabilities = 0n, netWorth = 0n;
  for (const account of allAccounts) {
    if (!account.includeInOverview) continue;
    const balance = BigInt(account.balanceCents);
    netWorth += balance;
    if (account.type === "CREDIT") {
      if (balance < 0n) totalLiabilities += -balance;
      else totalAssets += balance;
    } else totalAssets += balance;
  }
  const monthly = await financeEffectiveFlowForMonth(userId, selectedMonth);
  const recent = await financeTransactionsForUser(userId, { limit: 5 });
  const budgetRows = await db.select({ limitCents: financeBudgets.limitCents }).from(financeBudgets).where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.budgetMonth, selectedMonth)));
  const pendingRows = await db.select({ id: financeRecurringOccurrences.id }).from(financeRecurringOccurrences).where(and(eq(financeRecurringOccurrences.userId, userId), eq(financeRecurringOccurrences.status, 0), sql`${financeRecurringOccurrences.scheduledDate} >= ${`${selectedMonth}-01`}`, sql`${financeRecurringOccurrences.scheduledDate} < date_add(${`${selectedMonth}-01`}, interval 1 month)`));
  return {
    currency: "CNY", month: selectedMonth, recordTimezone: timezone,
    totalAssetsCents: totalAssets.toString(), totalLiabilitiesCents: totalLiabilities.toString(), netWorthCents: netWorth.toString(),
    monthlyIncomeCents: monthly.income.toString(), monthlyExpenseCents: monthly.expense.toString(),
    accountCount: allAccounts.filter((account) => !account.archivedAt).length, accounts: allAccounts, recentTransactions: recent.items,
    budgetSummary: budgetRows.length ? { limitCents: budgetRows.reduce((sum, row) => sum + BigInt(row.limitCents), 0n).toString(), spentCents: monthly.expense.toString(), remainingCents: (budgetRows.reduce((sum, row) => sum + BigInt(row.limitCents), 0n) - monthly.expense).toString() } : null,
    pendingRecurringSummary: { count: pendingRows.length },
    rules: { assets: "CASH/BANK/PAYMENT signed balances plus positive CREDIT balances", liabilities: "absolute value of negative CREDIT balances", netWorth: "sum of all included signed account balances" }
  };
}

const budgetMonth = /^\d{4}-(0[1-9]|1[0-2])$/;
const recurringDate = /^\d{4}-\d{2}-\d{2}$/;
const budgetLimit = (value: string) => cents(value);
const recurringTypeValue = (value: "INCOME" | "EXPENSE") => value === "INCOME" ? FinanceTransactionType.INCOME : FinanceTransactionType.EXPENSE;
const recurringTypeName = (value: number) => value === FinanceTransactionType.INCOME ? "INCOME" : "EXPENSE";

export async function financeBudgetsForUser(userId: number, month: string) {
  if (!budgetMonth.test(month)) throw new BusinessError(ErrorCode.PARAM_ERROR, "budget month is invalid", 400);
  const rows = await db.select({ id: financeBudgets.id, budgetMonth: financeBudgets.budgetMonth, periodTimezone: financeBudgets.periodTimezone, categoryId: financeBudgets.categoryId, categoryScopeKey: financeBudgets.categoryScopeKey, limitCents: financeBudgets.limitCents, version: financeBudgets.version, categoryName: financeCategories.name }).from(financeBudgets).leftJoin(financeCategories, and(eq(financeCategories.id, financeBudgets.categoryId), eq(financeCategories.userId, userId))).where(and(eq(financeBudgets.userId, userId), eq(financeBudgets.budgetMonth, month))).orderBy(asc(financeBudgets.categoryScopeKey));
  const report = await financeReportsForUser(userId, month);
  const spentByCategory = new Map(report.categories.map((item) => [item.categoryId ?? "uncategorized", BigInt(item.netExpenseCents)]));
  const totalSpent = BigInt(report.monthly.expenseCents);
  return rows.map((row) => { const spent = row.categoryId === null ? totalSpent : spentByCategory.get(row.categoryId) ?? 0n; return { ...row, limitCents: String(row.limitCents), spentCents: spent.toString(), remainingCents: (BigInt(row.limitCents) - spent).toString() }; });
}

export async function upsertFinanceBudget(input: { userId: number; operationId: string; budgetMonth: string; categoryId?: number | null; limitCents: string; expectedVersion?: number }) {
  const limit = budgetLimit(input.limitCents); if (limit < 0n) throw new BusinessError(ErrorCode.PARAM_ERROR, "budget limit must be non-negative", 400);
  if (!budgetMonth.test(input.budgetMonth)) throw new BusinessError(ErrorCode.PARAM_ERROR, "budget month is invalid", 400);
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_UPSERT_BUDGET", request: { budgetMonth: input.budgetMonth, categoryId: input.categoryId ?? null, limitCents: limit.toString(), expectedVersion: input.expectedVersion ?? null } }, async (tx) => {
    const timezone = await timezoneFor(tx, input.userId); const categoryId = input.categoryId ?? null; if (categoryId !== null) await lockedCategory(tx, input.userId, categoryId);
    const scope = categoryId === null ? "TOTAL" : String(categoryId); const [existing] = await tx.select().from(financeBudgets).where(and(eq(financeBudgets.userId, input.userId), eq(financeBudgets.budgetMonth, input.budgetMonth), eq(financeBudgets.categoryScopeKey, scope))).for("update"); const now = new Date();
    if (existing) { if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "budget version conflict", 409); const version = existing.version + 1; await tx.update(financeBudgets).set({ limitCents: limit, version, updatedAt: now }).where(eq(financeBudgets.id, existing.id)); return { id: existing.id, version }; }
    const [result] = await tx.insert(financeBudgets).values({ userId: input.userId, budgetMonth: input.budgetMonth, periodTimezone: timezone, categoryId, categoryScopeKey: scope, limitCents: limit, version: 1, createdAt: now, updatedAt: now }); return { id: result.insertId, version: 1 };
  });
}

export async function deleteFinanceBudget(input: { userId: number; operationId: string; id: number; expectedVersion: number }) {
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_DELETE_BUDGET", request: input }, async (tx) => { const [row] = await tx.select().from(financeBudgets).where(and(eq(financeBudgets.userId, input.userId), eq(financeBudgets.id, input.id))).for("update"); if (!row) throw new BusinessError(ErrorCode.NOT_FOUND, "budget not found", 404); if (row.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "budget version conflict", 409); await tx.delete(financeBudgets).where(eq(financeBudgets.id, row.id)); return { id: row.id, deleted: true }; });
}

function scheduledDates(template: { frequency: number; scheduleValue: number; startDate: string; endDate: string | null }, from: string, to: string) {
  const dates: string[] = []; const cursor = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`); const start = new Date(`${template.startDate}T00:00:00Z`); const max = template.endDate ? new Date(`${template.endDate}T00:00:00Z`) : end;
  for (; cursor <= end && cursor <= max; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (cursor < start) continue;
    const day = cursor.getUTCDay();
    const monthDays = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
    const monthlyMatch = cursor.getUTCDate() === Math.min(template.scheduleValue, monthDays);
    if ((template.frequency === 0 && monthlyMatch) || (template.frequency === 1 && day === template.scheduleValue)) dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

type EffectiveFlowRow = {
  type: number;
  categoryId: number | null;
  categoryName: string | null;
  accountId: number;
  accountName: string;
  amountCents: bigint;
};

function effectiveContribution(row: EffectiveFlowRow, related?: { type: number; categoryId: number | null; categoryName: string | null }) {
  const source = row.type === FinanceTransactionType.REVERSAL ? related : row;
  if (!source) return { income: 0n, expense: 0n, categoryId: row.categoryId, categoryName: row.categoryName };
  if (source.type === FinanceTransactionType.INCOME) return { income: row.amountCents, expense: 0n, categoryId: source.categoryId, categoryName: source.categoryName };
  if (source.type === FinanceTransactionType.EXPENSE || source.type === FinanceTransactionType.REFUND) return { income: 0n, expense: -row.amountCents, categoryId: source.categoryId, categoryName: source.categoryName };
  if (source.type === FinanceTransactionType.CORRECTION) return row.amountCents >= 0n
    ? { income: row.amountCents, expense: 0n, categoryId: source.categoryId, categoryName: source.categoryName }
    : { income: 0n, expense: -row.amountCents, categoryId: source.categoryId, categoryName: source.categoryName };
  return { income: 0n, expense: 0n, categoryId: source.categoryId, categoryName: source.categoryName };
}

async function financeEffectiveRowsForMonth(userId: number, month: string) {
  const rows = await db.select({
    id: financeTransactions.id,
    type: financeTransactions.type,
    categoryId: financeTransactions.categoryId,
    categoryName: financeCategories.name,
    relatedTransactionId: financeTransactions.relatedTransactionId,
    accountId: financeEntries.accountId,
    accountName: financeAccounts.name,
    amountCents: financeEntries.amountCents
  }).from(financeTransactions)
    .innerJoin(financeEntries, eq(financeEntries.transactionId, financeTransactions.id))
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeEntries.accountId))
    .leftJoin(financeCategories, and(eq(financeCategories.id, financeTransactions.categoryId), eq(financeCategories.userId, userId)))
    .where(and(eq(financeTransactions.userId, userId), sql`${financeTransactions.businessDate} >= ${`${month}-01`}`, sql`${financeTransactions.businessDate} < date_add(${`${month}-01`}, interval 1 month)`));
  const relatedIds = [...new Set(rows.map((row) => row.relatedTransactionId).filter((id): id is number => id !== null))];
  const relatedRows = relatedIds.length ? await db.select({ id: financeTransactions.id, type: financeTransactions.type, categoryId: financeTransactions.categoryId, categoryName: financeCategories.name }).from(financeTransactions).leftJoin(financeCategories, and(eq(financeCategories.id, financeTransactions.categoryId), eq(financeCategories.userId, userId))).where(and(eq(financeTransactions.userId, userId), sql`${financeTransactions.id} in (${sql.join(relatedIds.map((id) => sql`${id}`), sql`, `)})`)) : [];
  const relatedById = new Map(relatedRows.map((row) => [row.id, row]));
  return rows.map((row) => ({ ...row, amountCents: BigInt(row.amountCents), related: row.relatedTransactionId ? relatedById.get(row.relatedTransactionId) : undefined }));
}

async function financeEffectiveFlowForMonth(userId: number, month: string) {
  const rows = await financeEffectiveRowsForMonth(userId, month);
  return rows.reduce((total, row) => {
    const contribution = effectiveContribution(row, row.related);
    return { income: total.income + contribution.income, expense: total.expense + contribution.expense };
  }, { income: 0n, expense: 0n });
}

export async function financeRecurringTemplatesForUser(userId: number) {
  const rows = await db.select({ id: financeRecurringTemplates.id, type: financeRecurringTemplates.type, name: financeRecurringTemplates.name, amountCents: financeRecurringTemplates.amountCents, accountId: financeRecurringTemplates.accountId, accountName: financeAccounts.name, categoryId: financeRecurringTemplates.categoryId, categoryName: financeCategories.name, frequency: financeRecurringTemplates.frequency, scheduleValue: financeRecurringTemplates.scheduleValue, startDate: financeRecurringTemplates.startDate, endDate: financeRecurringTemplates.endDate, enabled: financeRecurringTemplates.enabled, version: financeRecurringTemplates.version }).from(financeRecurringTemplates).innerJoin(financeAccounts, eq(financeAccounts.id, financeRecurringTemplates.accountId)).innerJoin(financeCategories, eq(financeCategories.id, financeRecurringTemplates.categoryId)).where(eq(financeRecurringTemplates.userId, userId)).orderBy(desc(financeRecurringTemplates.enabled), asc(financeRecurringTemplates.id));
  return rows.map((row) => ({ ...row, type: recurringTypeName(row.type), amountCents: String(row.amountCents), enabled: Boolean(row.enabled), frequency: row.frequency === 0 ? "MONTHLY" : "WEEKLY" }));
}

export async function createFinanceRecurringTemplate(input: { userId: number; operationId: string; type: "INCOME" | "EXPENSE"; name: string; amountCents: string; accountId: number; categoryId: number; frequency: "MONTHLY" | "WEEKLY"; scheduleValue: number; startDate: string; endDate?: string | null }) {
  const amount = cents(input.amountCents, true); if (!recurringDate.test(input.startDate) || (input.endDate && !recurringDate.test(input.endDate))) throw new BusinessError(ErrorCode.PARAM_ERROR, "recurring date is invalid", 400);
  if (input.frequency === "MONTHLY" && (input.scheduleValue < 1 || input.scheduleValue > 31)) throw new BusinessError(ErrorCode.PARAM_ERROR, "monthly scheduleValue must be 1-31", 400);
  if (input.frequency === "WEEKLY" && (input.scheduleValue < 0 || input.scheduleValue > 6)) throw new BusinessError(ErrorCode.PARAM_ERROR, "weekly scheduleValue must be 0-6", 400);
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_CREATE_RECURRING_TEMPLATE", request: { ...input, amountCents: amount.toString() } }, async (tx) => { const account = await lockedAccount(tx, input.userId, input.accountId); if (account.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "archived account cannot be used", 409); const category = await lockedCategory(tx, input.userId, input.categoryId); const expectedKind = input.type === "INCOME" ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE; if (!category.enabled || category.kind !== expectedKind) throw new BusinessError(ErrorCode.CONFLICT, "recurring category is invalid", 409); const now = new Date(); const [result] = await tx.insert(financeRecurringTemplates).values({ userId: input.userId, type: recurringTypeValue(input.type), name: input.name.trim(), amountCents: amount, accountId: account.id, categoryId: category.id, frequency: input.frequency === "MONTHLY" ? 0 : 1, scheduleValue: input.scheduleValue, startDate: input.startDate, endDate: input.endDate ?? null, enabled: 1, version: 1, createdAt: now, updatedAt: now }); return { id: result.insertId, version: 1 }; });
}

export async function updateFinanceRecurringTemplate(input: { userId: number; operationId: string; id: number; expectedVersion: number; name?: string; enabled?: boolean; amountCents?: string; accountId?: number; categoryId?: number; frequency?: "MONTHLY" | "WEEKLY"; scheduleValue?: number; startDate?: string; endDate?: string | null }) {
  const amount = input.amountCents === undefined ? undefined : cents(input.amountCents, true);
  if (input.startDate !== undefined && !recurringDate.test(input.startDate)) throw new BusinessError(ErrorCode.PARAM_ERROR, "recurring date is invalid", 400);
  if (input.endDate !== undefined && input.endDate !== null && !recurringDate.test(input.endDate)) throw new BusinessError(ErrorCode.PARAM_ERROR, "recurring date is invalid", 400);
  if (input.frequency === "MONTHLY" && (input.scheduleValue === undefined || input.scheduleValue < 1 || input.scheduleValue > 31)) throw new BusinessError(ErrorCode.PARAM_ERROR, "monthly scheduleValue must be 1-31", 400);
  if (input.frequency === "WEEKLY" && (input.scheduleValue === undefined || input.scheduleValue < 0 || input.scheduleValue > 6)) throw new BusinessError(ErrorCode.PARAM_ERROR, "weekly scheduleValue must be 0-6", 400);
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_UPDATE_RECURRING_TEMPLATE", request: { ...input, amountCents: amount?.toString() } }, async (tx) => {
    const [row] = await tx.select().from(financeRecurringTemplates).where(and(eq(financeRecurringTemplates.userId, input.userId), eq(financeRecurringTemplates.id, input.id))).for("update");
    if (!row) throw new BusinessError(ErrorCode.NOT_FOUND, "recurring template not found", 404);
    if (row.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "recurring template version conflict", 409);
    const account = input.accountId === undefined ? null : await lockedAccount(tx, input.userId, input.accountId);
    if (account?.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "archived account cannot be used", 409);
    const category = input.categoryId === undefined ? null : await lockedCategory(tx, input.userId, input.categoryId);
    const nextType = input.frequency === undefined ? row.frequency : input.frequency === "MONTHLY" ? 0 : 1;
    const nextSchedule = input.scheduleValue ?? row.scheduleValue;
    const expectedKind = row.type === FinanceTransactionType.INCOME ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE;
    if (category && (!category.enabled || category.kind !== expectedKind)) throw new BusinessError(ErrorCode.CONFLICT, "recurring category is invalid", 409);
    if (nextType === 0 && (nextSchedule < 1 || nextSchedule > 31)) throw new BusinessError(ErrorCode.PARAM_ERROR, "monthly scheduleValue must be 1-31", 400);
    if (nextType === 1 && (nextSchedule < 0 || nextSchedule > 6)) throw new BusinessError(ErrorCode.PARAM_ERROR, "weekly scheduleValue must be 0-6", 400);
    const version = row.version + 1; const now = new Date();
    await tx.update(financeRecurringTemplates).set({ name: input.name?.trim() || row.name, enabled: input.enabled === undefined ? row.enabled : input.enabled ? 1 : 0, amountCents: amount ?? row.amountCents, accountId: input.accountId ?? row.accountId, categoryId: input.categoryId ?? row.categoryId, frequency: nextType, scheduleValue: nextSchedule, startDate: input.startDate ?? row.startDate, endDate: input.endDate === undefined ? row.endDate : input.endDate, version, updatedAt: now }).where(eq(financeRecurringTemplates.id, row.id));
    return { id: row.id, version, enabled: input.enabled ?? Boolean(row.enabled) };
  });
}

export async function prepareFinanceRecurringOccurrences(input: { userId: number; operationId: string; from: string; to: string }) {
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_PREPARE_RECURRING", request: input }, async (tx) => { const timezone = await timezoneFor(tx, input.userId); const templates = await tx.select().from(financeRecurringTemplates).where(and(eq(financeRecurringTemplates.userId, input.userId), eq(financeRecurringTemplates.enabled, 1))); let created = 0; for (const template of templates) for (const scheduledDate of scheduledDates(template, input.from, input.to)) { const [result] = await tx.insert(financeRecurringOccurrences).values({ userId: input.userId, templateId: template.id, scheduledDate, recordTimezone: timezone, status: 0, amountCentsSnapshot: template.amountCents, accountIdSnapshot: template.accountId, categoryIdSnapshot: template.categoryId, postedTransactionId: null, version: 1, createdAt: new Date(), updatedAt: new Date() }).onDuplicateKeyUpdate({ set: { updatedAt: sql`${financeRecurringOccurrences.updatedAt}` } }); if (Number(result.insertId) > 0) created += 1; } return { created }; });
}

export async function financeRecurringOccurrencesForUser(userId: number, from?: string, to?: string) {
  const conditions = [eq(financeRecurringOccurrences.userId, userId)]; if (from) conditions.push(sql`${financeRecurringOccurrences.scheduledDate} >= ${from}`); if (to) conditions.push(sql`${financeRecurringOccurrences.scheduledDate} <= ${to}`);
  const rows = await db.select({ id: financeRecurringOccurrences.id, templateId: financeRecurringOccurrences.templateId, scheduledDate: financeRecurringOccurrences.scheduledDate, recordTimezone: financeRecurringOccurrences.recordTimezone, status: financeRecurringOccurrences.status, amountCentsSnapshot: financeRecurringOccurrences.amountCentsSnapshot, accountIdSnapshot: financeRecurringOccurrences.accountIdSnapshot, categoryIdSnapshot: financeRecurringOccurrences.categoryIdSnapshot, postedTransactionId: financeRecurringOccurrences.postedTransactionId, version: financeRecurringOccurrences.version, templateName: financeRecurringTemplates.name, type: financeRecurringTemplates.type, accountName: financeAccounts.name, categoryName: financeCategories.name }).from(financeRecurringOccurrences).innerJoin(financeRecurringTemplates, eq(financeRecurringTemplates.id, financeRecurringOccurrences.templateId)).innerJoin(financeAccounts, eq(financeAccounts.id, financeRecurringOccurrences.accountIdSnapshot)).innerJoin(financeCategories, eq(financeCategories.id, financeRecurringOccurrences.categoryIdSnapshot)).where(and(...conditions)).orderBy(asc(financeRecurringOccurrences.scheduledDate), asc(financeRecurringOccurrences.id));
  return rows.map((row) => ({ ...row, status: ["PENDING", "POSTED", "SKIPPED"][row.status], type: recurringTypeName(row.type), amountCentsSnapshot: String(row.amountCentsSnapshot) }));
}

export async function postFinanceRecurringOccurrence(input: { userId: number; operationId: string; id: number; expectedVersion: number; occurredTime?: string }) {
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_POST_RECURRING", request: input }, async (tx) => { const [occurrence] = await tx.select().from(financeRecurringOccurrences).where(and(eq(financeRecurringOccurrences.userId, input.userId), eq(financeRecurringOccurrences.id, input.id))).for("update"); if (!occurrence) throw new BusinessError(ErrorCode.NOT_FOUND, "recurring occurrence not found", 404); if (occurrence.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "recurring occurrence version conflict", 409); if (occurrence.status === 1) return { id: occurrence.id, status: "POSTED", transactionId: occurrence.postedTransactionId }; if (occurrence.status === 2) throw new BusinessError(ErrorCode.CONFLICT, "skipped occurrence cannot be posted", 409); const timezone = occurrence.recordTimezone; const now = new Date(); const [template] = await tx.select({ type: financeRecurringTemplates.type }).from(financeRecurringTemplates).where(and(eq(financeRecurringTemplates.id, occurrence.templateId), eq(financeRecurringTemplates.userId, input.userId))); const account = await lockedAccount(tx, input.userId, occurrence.accountIdSnapshot); if (account.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "archived account cannot receive recurring transactions", 409); const category = await lockedCategory(tx, input.userId, occurrence.categoryIdSnapshot); const type = template?.type ?? FinanceTransactionType.EXPENSE; if (!category.enabled || category.kind !== (type === FinanceTransactionType.INCOME ? FinanceCategoryKind.INCOME : FinanceCategoryKind.EXPENSE)) throw new BusinessError(ErrorCode.CONFLICT, "recurring snapshot category is invalid", 409); const transactionId = await insertFinanceHeader(tx, { userId: input.userId, type, categoryId: occurrence.categoryIdSnapshot, occurredDate: occurrence.scheduledDate, occurredTime: input.occurredTime ?? "09:00" }, timezone, now); const signed = type === FinanceTransactionType.INCOME ? BigInt(occurrence.amountCentsSnapshot) : -BigInt(occurrence.amountCentsSnapshot); await insertFinanceEntries(tx, input.userId, transactionId, [{ accountId: occurrence.accountIdSnapshot, amountCents: signed }], now); await tx.update(financeRecurringOccurrences).set({ status: 1, postedTransactionId: transactionId, version: occurrence.version + 1, updatedAt: now }).where(eq(financeRecurringOccurrences.id, occurrence.id)); return { id: occurrence.id, status: "POSTED", transactionId }; });
}

export async function skipFinanceRecurringOccurrence(input: { userId: number; operationId: string; id: number; expectedVersion: number }) {
  return runMutation({ userId: input.userId, operationId: input.operationId, commandType: "FINANCE_SKIP_RECURRING", request: input }, async (tx) => { const [row] = await tx.select().from(financeRecurringOccurrences).where(and(eq(financeRecurringOccurrences.userId, input.userId), eq(financeRecurringOccurrences.id, input.id))).for("update"); if (!row) throw new BusinessError(ErrorCode.NOT_FOUND, "recurring occurrence not found", 404); if (row.version !== input.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "recurring occurrence version conflict", 409); if (row.status === 1) throw new BusinessError(ErrorCode.CONFLICT, "posted occurrence cannot be skipped", 409); if (row.status === 2) return { id: row.id, status: "SKIPPED" }; await tx.update(financeRecurringOccurrences).set({ status: 2, version: row.version + 1, updatedAt: new Date() }).where(eq(financeRecurringOccurrences.id, row.id)); return { id: row.id, status: "SKIPPED" }; });
}

export async function financeReportsForUser(userId: number, month: string) {
  if (!budgetMonth.test(month)) throw new BusinessError(ErrorCode.PARAM_ERROR, "report month is invalid", 400);
  const rows = await financeEffectiveRowsForMonth(userId, month);
  const totals = { income: 0n, expense: 0n }; const categories = new Map<string, { categoryId: number | null; categoryName: string; net: bigint }>(); const accounts = new Map<number, { accountId: number; accountName: string; net: bigint; inflow: bigint; outflow: bigint }>();
  for (const row of rows) {
    const contribution = effectiveContribution(row, row.related);
    totals.income += contribution.income;
    totals.expense += contribution.expense;
    if (contribution.expense !== 0n && contribution.categoryId !== null) {
      const key = String(contribution.categoryId);
      const item = categories.get(key) ?? { categoryId: contribution.categoryId, categoryName: contribution.categoryName ?? "未分类", net: 0n };
      item.net += contribution.expense;
      categories.set(key, item);
    }
    const account = accounts.get(row.accountId) ?? { accountId: row.accountId, accountName: row.accountName, net: 0n, inflow: 0n, outflow: 0n };
    account.net += row.amountCents;
    if (row.amountCents >= 0n) account.inflow += row.amountCents; else account.outflow += -row.amountCents;
    accounts.set(row.accountId, account);
  }
  const allAccounts = await financeAccountsForUser(userId, "all"); const accountMovement = allAccounts.map((account) => { const movement = accounts.get(account.id) ?? { accountId: account.id, accountName: account.name, net: 0n, inflow: 0n, outflow: 0n }; const ending = BigInt(account.balanceCents); return { accountId: account.id, accountName: account.name, startingBalanceCents: (ending - movement.net).toString(), inflowCents: movement.inflow.toString(), outflowCents: movement.outflow.toString(), netChangeCents: movement.net.toString(), endingBalanceCents: ending.toString(), reconciled: ending - movement.net + movement.net === ending }; });
  return { month, monthly: { incomeCents: totals.income.toString(), expenseCents: totals.expense.toString(), netCashflowCents: (totals.income - totals.expense).toString() }, categories: [...categories.values()].map((item) => ({ categoryId: item.categoryId, categoryName: item.categoryName, netExpenseCents: item.net.toString(), netRefund: item.net < 0n })), accounts: accountMovement, reconciliation: accountMovement.every((item) => item.reconciled) };
}
