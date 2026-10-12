import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test, { after, before, beforeEach } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl);
const database = `workbench_finance_archive_${process.pid}_test`;
let admin: Connection;
let pool: Pool;
let app: typeof import("../src/app.js").app;
let token: string;
type Overview = Awaited<ReturnType<typeof import("../src/finance.js").financeOverviewForUser>>;
type Account = Overview["accounts"][number];
const month = "2026-09";
const commandDate = { occurredDate: `${month}-10`, occurredTime: "12:00" };

async function api<T = unknown>(path: string, method = "GET", body?: unknown, status = 200): Promise<T> {
  const response = await app.request(`/api/finance${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json() as { data: T; message: string };
  assert.equal(response.status, status, result.message);
  return result.data;
}
const post = <T = unknown>(path: string, body: Record<string, unknown>, status = 200) => api<T>(path, "POST", { operationId: randomUUID(), ...body }, status);
const overview = () => api<Overview>(`/overview?month=${month}`);
const accounts = (view = "all") => api<Account[]>(`/accounts?view=${view}`);
const createAccount = (type = "BANK", balance = "0", includeInOverview = true) => post<{ id: number; version: number; openingTransactionId: number | null }>("/accounts", {
  name: `${type} ${randomUUID()}`, type, openingDate: `${month}-01`, openingBalanceCents: balance, includeInOverview
});
const archive = (id: number, expectedVersion: number, archived = true) => post<{ version: number }>(`/accounts/${id}/${archived ? "archive" : "unarchive"}`, { expectedVersion });
async function ledger() {
  const [transactions, entries] = await Promise.all([
    pool.query("SELECT * FROM finance_transactions ORDER BY id"),
    pool.query("SELECT * FROM finance_entries ORDER BY id")
  ]);
  return { transactions: transactions[0], entries: entries[0] };
}
async function analytics() {
  const [current, budgets, report] = await Promise.all([
    overview(), api(`/budgets?month=${month}`), api(`/reports?month=${month}`)
  ]);
  return { income: current.monthlyIncomeCents, expense: current.monthlyExpenseCents, budgetSummary: current.budgetSummary, budgets, report };
}
async function totals(expected: [string, string, string]) {
  const current = await overview();
  assert.deepEqual([current.totalAssetsCents, current.totalLiabilitiesCents, current.netWorthCents], expected);
}

before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`USE \`${database}\``);
  const directory = resolve(process.cwd(), "../../db/migration");
  const version = (name: string) => { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; };
  const migrations = (await readdir(directory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1] || a.localeCompare(b));
  for (const migration of migrations) await admin.query(await readFile(resolve(directory, migration), "utf8"));
  const appUrl = new URL(sourceUrl); appUrl.pathname = `/${database}`;
  process.env.NODE_ENV = "test"; process.env.DATABASE_URL = appUrl.toString(); process.env.JWT_SECRET = "finance-archive-tests-only-secret";
  const auth = await import("../src/auth.js");
  [{ pool }, { app }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js")]);
  token = auth.signToken({ id: 1, username: "archive-test", displayName: "Archive Test" });
});
beforeEach(async () => {
  await pool.query("UPDATE finance_transactions SET related_transaction_id=NULL,source_account_id=NULL,target_account_id=NULL");
  for (const table of ["finance_budgets", "finance_entries", "finance_transactions", "finance_accounts", "finance_categories", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("UPDATE users SET deleted_at=NULL,timezone='Asia/Shanghai' WHERE id=1");
});
after(async () => {
  await pool?.end();
  if (admin) { await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); }
});

test("asset archive excludes current totals, retains history and analytics, and restore reinstates the balance", async () => {
  await post("/initialize", {});
  const categories = await api<Array<{ id: number; kind: string }>>("/categories");
  const expenseCategory = categories.find((item) => item.kind === "EXPENSE")!;
  const bank = await createAccount("BANK", "100000");
  const expense = await post<{ transactionId: number }>("/expenses", { accountId: bank.id, categoryId: expenseCategory.id, amountCents: "30000", ...commandDate });
  await post("/budgets", { budgetMonth: month, limitCents: "50000" });
  await post("/budgets", { budgetMonth: month, categoryId: expenseCategory.id, limitCents: "40000" });
  await totals(["70000", "0", "70000"]);
  const history = await api(`/transactions?accountId=${bank.id}`);
  const detail = await api(`/transactions/${expense.transactionId}`);
  const originalLedger = await ledger();
  const originalAnalytics = await analytics();
  assert.equal(originalAnalytics.expense, "30000");

  await archive(bank.id, 1);
  await totals(["0", "0", "0"]);
  assert.equal((await overview()).accountCount, 0);
  assert.deepEqual(await accounts("active"), []);
  const archived = (await accounts("archived"))[0];
  assert.equal(archived.id, bank.id); assert.equal(archived.balanceCents, "70000"); assert.ok(archived.archivedAt);
  assert.deepEqual(await api(`/transactions?accountId=${bank.id}`), history);
  assert.deepEqual(await api(`/transactions/${expense.transactionId}`), detail);
  assert.deepEqual(await analytics(), originalAnalytics);
  assert.deepEqual(await ledger(), originalLedger);

  await archive(bank.id, 2, false);
  await totals(["70000", "0", "70000"]);
  assert.equal((await accounts("active"))[0].balanceCents, "70000");
  assert.deepEqual(await ledger(), originalLedger);
  assert.deepEqual(await analytics(), originalAnalytics);
});

test("liability archive and restore change eligibility without changing owed balance or ledger history", async () => {
  await createAccount("BANK", "100000");
  const credit = await createAccount("CREDIT", "-50000");
  await totals(["100000", "50000", "50000"]);
  const originalLedger = await ledger();
  const history = await api(`/transactions?accountId=${credit.id}`);
  const originalAnalytics = await analytics();
  await archive(credit.id, 1);
  await totals(["100000", "0", "100000"]);
  assert.equal((await accounts()).find((item) => item.id === credit.id)?.balanceCents, "-50000");
  assert.deepEqual(await ledger(), originalLedger);
  assert.deepEqual(await api(`/transactions?accountId=${credit.id}`), history);
  assert.deepEqual(await analytics(), originalAnalytics);
  await archive(credit.id, 2, false);
  await totals(["100000", "50000", "50000"]);
  assert.deepEqual(await ledger(), originalLedger);
  assert.deepEqual(await analytics(), originalAnalytics);
});

test("active, archived and restored accounts respect both inclusion preference values", async () => {
  const bank = await createAccount("BANK", "10000");
  const originalLedger = await ledger();
  await totals(["10000", "0", "10000"]); // active + included
  await api(`/accounts/${bank.id}`, "PUT", { expectedVersion: 1, includeInOverview: false });
  await totals(["0", "0", "0"]); // active + excluded
  await archive(bank.id, 2);
  await totals(["0", "0", "0"]); // archived + excluded
  await archive(bank.id, 3, false);
  await totals(["0", "0", "0"]); // restored + excluded
  await archive(bank.id, 4);
  await api(`/accounts/${bank.id}`, "PUT", { expectedVersion: 5, includeInOverview: true });
  await totals(["0", "0", "0"]); // archived + included
  await archive(bank.id, 6, false);
  await totals(["10000", "0", "10000"]); // restored + included
  assert.equal((await accounts())[0].includeInOverview, true);
  assert.equal((await accounts())[0].balanceCents, "10000");
  assert.deepEqual(await ledger(), originalLedger);
});

test("CREDIT negative, zero and positive balances and signed non-CREDIT balances preserve the existing formula", async () => {
  const negative = await createAccount("CREDIT", "-50000");
  const zero = await createAccount("CREDIT", "0");
  const positive = await createAccount("CREDIT", "15000");
  await createAccount("BANK", "-1000");
  await totals(["14000", "50000", "-36000"]);
  await archive(zero.id, 1);
  await totals(["14000", "50000", "-36000"]);
  await archive(positive.id, 1);
  await totals(["-1000", "50000", "-51000"]);
  await archive(positive.id, 2, false);
  await api(`/accounts/${positive.id}`, "PUT", { expectedVersion: 3, includeInOverview: false });
  await totals(["-1000", "50000", "-51000"]);
  await api(`/accounts/${negative.id}`, "PUT", { expectedVersion: 1, includeInOverview: false });
  await totals(["-1000", "0", "-1000"]);
});

test("archived accounts still reject income, expense and either transfer direction without new ledger rows", async () => {
  await post("/initialize", {});
  const categories = await api<Array<{ id: number; kind: string }>>("/categories");
  const archived = await createAccount("BANK", "100000");
  const active = await createAccount("BANK", "10000");
  await archive(archived.id, 1);
  const originalLedger = await ledger();
  for (const kind of ["INCOME", "EXPENSE"]) {
    await post(kind === "INCOME" ? "/income" : "/expenses", { accountId: archived.id, categoryId: categories.find((item) => item.kind === kind)!.id, amountCents: "1000", ...commandDate }, 409);
  }
  for (const [sourceAccountId, targetAccountId] of [[archived.id, active.id], [active.id, archived.id]]) {
    await post("/transfers", { sourceAccountId, targetAccountId, amountCents: "1000", ...commandDate }, 409);
  }
  assert.deepEqual(await ledger(), originalLedger);
  assert.equal((await accounts()).find((item) => item.id === archived.id)?.balanceCents, "100000");
});
