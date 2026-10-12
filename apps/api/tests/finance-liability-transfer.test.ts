import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test, { after, before, beforeEach } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl);
const database = `workbench_liability_transfer_${process.pid}_test`;
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
  process.env.NODE_ENV = "test"; process.env.DATABASE_URL = appUrl.toString(); process.env.JWT_SECRET = "finance-liability-tests-only-secret";
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

const transfer = (sourceAccountId: number, targetAccountId: number, amountCents: string, status = 200, extra: Record<string, unknown> = {}) => post<{ transactionId: number }>("/transfers", { sourceAccountId, targetAccountId, amountCents, ...commandDate, ...extra }, status);
async function balances(expected: Array<[number, string]>) {
  const current = await accounts();
  for (const [id, value] of expected) assert.equal(current.find((item) => item.id === id)?.balanceCents, value);
}
async function twoEntries(transactionId: number, source: number, target: number, amount: string) {
  const [entries] = await pool.query("SELECT account_id AS accountId,CAST(amount_cents AS CHAR) AS cents FROM finance_entries WHERE transaction_id=? ORDER BY account_id", [transactionId]);
  const expected = [{ accountId: source, cents: (-BigInt(amount)).toString() }, { accountId: target, cents: amount }].sort((a,b) => a.accountId-b.accountId);
  assert.deepEqual((entries as object[]).map((row) => ({ ...row })), expected);
  const detail = await api<{ type: string; note: string; transfer: { amountCents: string }; incomeContributionCents: string; expenseContributionCents: string }>(`/transactions/${transactionId}`);
  assert.equal(detail.type, "TRANSFER"); assert.equal(detail.transfer.amountCents, amount);
  assert.equal(detail.incomeContributionCents, "0"); assert.equal(detail.expenseContributionCents, "0");
}

test("borrowing increases assets and debt with two signed entries and unchanged monthly analytics", async () => {
  const bank = await createAccount("BANK", "200000"); const credit = await createAccount("CREDIT", "-100000");
  const before = await analytics();
  const posted = await transfer(credit.id, bank.id, "50000", 200, { note: "本次借入" });
  await balances([[bank.id, "250000"], [credit.id, "-150000"]]); await totals(["250000", "150000", "100000"]);
  await twoEntries(posted.transactionId, credit.id, bank.id, "50000");
  const next = await analytics();
  assert.deepEqual([next.income, next.expense, next.budgets, next.budgetSummary], [before.income, before.expense, before.budgets, before.budgetSummary]);
  const report = await api<{ monthly: { incomeCents: string; expenseCents: string } }>(`/reports?month=${month}`);
  assert.deepEqual(report.monthly, { incomeCents: "0", expenseCents: "0", netCashflowCents: "0" });
});

for (const { amount, after, totals: expected } of [
  { amount: "50000", after: "-270000", totals: ["450000", "270000", "180000"] },
  { amount: "320000", after: "0", totals: ["180000", "0", "180000"] },
  { amount: "330000", after: "10000", totals: ["180000", "0", "180000"] },
]) test(`repayment ${amount} preserves expense, settlement and positive CREDIT assets`, async () => {
  const bank = await createAccount("BANK", "500000"); const credit = await createAccount("CREDIT", "-320000");
  const result = await transfer(bank.id, credit.id, amount);
  await balances([[bank.id, (500000n-BigInt(amount)).toString()], [credit.id, after]]);
  await totals(expected as [string,string,string]); await twoEntries(result.transactionId, bank.id, credit.id, amount);
  const current = await overview(); assert.equal(current.monthlyIncomeCents,"0"); assert.equal(current.monthlyExpenseCents,"0");
});

test("credit card purchase then principal repayment counts expense exactly once in Overview, Budget and Report", async () => {
  await post("/initialize", {});
  const category = (await api<Array<{ id: number; kind: string }>>("/categories")).find((item) => item.kind === "EXPENSE")!;
  const bank = await createAccount("BANK", "100000"); const credit = await createAccount("CREDIT");
  await post("/budgets", { budgetMonth: month, limitCents: "50000" });
  await post("/expenses", { accountId: credit.id, categoryId: category.id, amountCents: "20000", ...commandDate });
  const original = await analytics(); assert.equal(original.expense, "20000");
  await transfer(bank.id, credit.id, "20000"); await balances([[credit.id, "0"], [bank.id, "80000"]]);
  const next = await analytics(); assert.equal(next.income, "0"); assert.equal(next.expense, "20000");
  assert.deepEqual(next.budgets, original.budgets); assert.deepEqual(next.budgetSummary, original.budgetSummary);
  const report = next.report as { monthly: { expenseCents: string }; categories: unknown[] };
  assert.equal(report.monthly.expenseCents,"20000"); assert.deepEqual(report.categories, (original.report as typeof report).categories);
});

test("generic CREDIT to CREDIT and prepaid withdrawal remain TRANSFER and zero monthly flow", async () => {
  const a = await createAccount("CREDIT", "20000"); const b = await createAccount("CREDIT", "-30000"); const bank = await createAccount("BANK");
  const first = await transfer(a.id, b.id, "5000"); await twoEntries(first.transactionId, a.id, b.id,"5000");
  const second = await transfer(a.id, bank.id, "10000"); await twoEntries(second.transactionId, a.id, bank.id,"10000");
  await balances([[a.id,"5000"], [b.id,"-25000"], [bank.id,"10000"]]); await totals(["15000","25000","-10000"]);
  const current = await overview(); assert.equal(current.monthlyIncomeCents,"0"); assert.equal(current.monthlyExpenseCents,"0");
});

test("active excluded accounts can transfer with scoped Overview; archive rejects either direction without posting", async () => {
  const bank = await createAccount("BANK","100000"); const credit = await createAccount("CREDIT","-20000",false);
  await transfer(credit.id,bank.id,"5000"); await totals(["105000","0","105000"]);
  await balances([[credit.id,"-25000"]]); await transfer(bank.id,credit.id,"10000"); await totals(["95000","0","95000"]);
  await archive(credit.id,1);
  const [before] = await pool.query("SELECT COUNT(*) AS count FROM finance_entries");
  await transfer(bank.id,credit.id,"1000",409); await transfer(credit.id,bank.id,"1000",409);
  const [after] = await pool.query("SELECT COUNT(*) AS count FROM finance_entries"); assert.deepEqual(after,before);
  await balances([[credit.id,"-15000"]]);
});

test("borrow/repay receipt replay does not duplicate principal; fees remain the only additional expense", async () => {
  await post("/initialize", {});
  const category = (await api<Array<{ id: number; kind: string }>>("/categories")).find((item) => item.kind === "EXPENSE")!;
  const bank = await createAccount("BANK","100000"); const credit = await createAccount("CREDIT","-10000");
  const operationId = randomUUID(); const extra = { operationId, feeAmountCents:"300", feeCategoryId:category.id };
  const first = await transfer(bank.id,credit.id,"12000",200,extra); const replay = await transfer(bank.id,credit.id,"12000",200,extra);
  assert.equal(first.transactionId,replay.transactionId); await balances([[bank.id,"87700"],[credit.id,"2000"]]);
  const current = await overview(); assert.equal(current.monthlyIncomeCents,"0"); assert.equal(current.monthlyExpenseCents,"300");
});
