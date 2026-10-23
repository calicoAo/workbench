import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test, { after, before, beforeEach } from "node:test";
import mysql, { type Connection } from "mysql2/promise";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const sourceUrl = new URL(testDatabaseUrl);
const freshDatabase = `workbench_fin01_fresh_${process.pid}_test`;
const upgradeDatabase = `workbench_fin01_upgrade_${process.pid}_test`;
const migrationDirectory = resolve(process.cwd(), "../../db/migration");
let admin: Connection;
let pool: Awaited<typeof import("../src/db/index.js")>["pool"];
let app: Awaited<typeof import("../src/app.js")>["app"];
let signToken: Awaited<typeof import("../src/auth.js")>["signToken"];
let counter = 0;
const op = () => `93000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function version(name: string) { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; }
async function migrations() { return (await readdir(migrationDirectory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1]); }
async function migrate(connection: Connection, database: string, from = 1, through = 42) { await connection.query(`USE \`${database}\``); for (const name of await migrations()) { const major = version(name)[0]; if (major >= from && major <= through) await connection.query(await readFile(resolve(migrationDirectory, name), "utf8")); } }
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Record<string, unknown>[])[0])[0]); }
function headers(userId = 1) { return { Authorization: `Bearer ${signToken({ id: userId, username: `user-${userId}`, displayName: `User ${userId}` })}`, "Content-Type": "application/json" }; }
async function api<T>(path: string, init: RequestInit = {}, userId = 1) { const response = await app.request(`/api${path}`, { ...init, headers: { ...headers(userId), ...(init.headers ?? {}) } }); const body = await response.json() as { data: T; message: string }; return { response, data: body.data, message: body.message }; }
async function initialize(userId = 1) { return api<{ categoryCount: number }>("/finance/initialize", { method: "POST", body: JSON.stringify({ operationId: op() }) }, userId); }
async function categories(userId = 1) { return (await api<Array<{ id: number; name: string; kind: string; enabled: boolean; version: number; sortOrder: number }>>("/finance/categories", {}, userId)).data; }
async function account(input: Record<string, unknown> = {}, userId = 1, operationId = op()) { return api<{ id: number; version: number; balanceCents: string; openingTransactionId: number | null }>("/finance/accounts", { method: "POST", body: JSON.stringify({ operationId, name: "工资卡", type: "BANK", openingDate: "2026-09-01", openingBalanceCents: "100000", includeInOverview: true, ...input }) }, userId); }
async function record(type: "income" | "expenses", accountId: number, categoryId: number, amountCents: string, operationId = op(), userId = 1, extra: Record<string, unknown> = {}) { return api<{ transactionId: number; entryId: number; amountCents: string; businessDate: string; recordTimezone: string; reward: { xp: number; coins: number; reason: string } | null }>(`/finance/${type}`, { method: "POST", body: JSON.stringify({ operationId, accountId, categoryId, amountCents, occurredDate: "2026-09-21", occurredTime: "23:30", note: type, ...extra }) }, userId); }

before(async () => {
  admin = await mysql.createConnection({ host: sourceUrl.hostname, port: Number(sourceUrl.port || 3306), user: decodeURIComponent(sourceUrl.username), password: decodeURIComponent(sourceUrl.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${freshDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`CREATE DATABASE \`${upgradeDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await migrate(admin, freshDatabase);
  await migrate(admin, upgradeDatabase, 1, 27);
  await admin.query(`USE \`${upgradeDatabase}\``);
  await admin.query("INSERT INTO quick_notes (user_id,note_date,content,created_at,updated_at) VALUES (1,'2026-09-20','preserve before finance',NOW(),NOW())");
  await migrate(admin, upgradeDatabase, 28, 42);
  const appUrl = new URL(testDatabaseUrl); appUrl.pathname = `/${freshDatabase}`;
  process.env.NODE_ENV = "test"; process.env.DATABASE_URL = appUrl.toString(); process.env.JWT_SECRET = "fin01-tests-only-secret";
  [{ pool }, { app }, { signToken }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
});

beforeEach(async () => {
  await pool.query("UPDATE finance_transactions SET related_transaction_id=NULL, source_account_id=NULL, target_account_id=NULL");
  await pool.query("DROP TRIGGER IF EXISTS fail_finance_entry_insert");
  await pool.query("DELETE FROM reward_events");
  await pool.query("DELETE FROM user_growth");
  for (const table of ["finance_recurring_occurrences", "finance_recurring_templates", "finance_budgets", "finance_entries", "finance_transactions", "finance_accounts", "finance_categories", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (934,'fin-isolation','Finance Isolation','Asia/Shanghai',NOW(),NOW()) ON DUPLICATE KEY UPDATE deleted_at=NULL,timezone='Asia/Shanghai'");
  await pool.query("UPDATE users SET timezone='Asia/Shanghai' WHERE id=1");
});

after(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS \`${freshDatabase}\``);
  await admin.query(`DROP DATABASE IF EXISTS \`${upgradeDatabase}\``);
  await admin.end();
});

test("V28 migrates fresh and current-head databases without mutable balance storage", async () => {
  const [fresh] = await admin.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='${freshDatabase}' AND table_name IN ('finance_accounts','finance_categories','finance_transactions','finance_entries')`);
  const [upgrade] = await admin.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='${upgradeDatabase}' AND table_name IN ('finance_accounts','finance_categories','finance_transactions','finance_entries')`);
  assert.equal(Number((fresh as Array<{ count: number }>)[0].count), 4); assert.equal(Number((upgrade as Array<{ count: number }>)[0].count), 4);
  const [balanceColumns] = await admin.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='${freshDatabase}' AND table_name='finance_accounts' AND column_name LIKE '%balance%'`);
  assert.deepEqual(balanceColumns, []);
  await admin.query(`USE \`${upgradeDatabase}\``); const [notes] = await admin.query("SELECT content FROM quick_notes WHERE content='preserve before finance'"); assert.equal((notes as unknown[]).length, 1);
});

test("opening balance is one OPENING transaction and Entry while monthly flow stays zero", async () => {
  const created = await account(); assert.equal(created.response.status, 200); assert.equal(created.data.balanceCents, "100000");
  const accounts = await api<Array<{ id: number; balanceCents: string }>>("/finance/accounts"); assert.equal(accounts.data[0].balanceCents, "100000");
  const overview = await api<{ monthlyIncomeCents: string; monthlyExpenseCents: string; netWorthCents: string }>("/finance/overview?month=2026-09");
  assert.deepEqual([overview.data.monthlyIncomeCents, overview.data.monthlyExpenseCents, overview.data.netWorthCents], ["0", "0", "100000"]);
  assert.equal(await scalar("SELECT COUNT(*) FROM finance_transactions WHERE type=0"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM finance_entries WHERE amount_cents=100000"), 1);
});

test("custom Finance categories persist, appear in the canonical list, and remain user-owned", async () => {
  const created = await api<{ id: number; version: number }>("/finance/categories", { method: "POST", body: JSON.stringify({ kind: "EXPENSE", name: "宠物医疗", sortOrder: 20 }) });
  assert.equal(created.response.status, 200);
  assert.deepEqual(created.data.version, 1);
  const own = await categories();
  const persisted = own.find((item) => item.id === created.data.id);
  assert.ok(persisted);
  assert.deepEqual({ id: persisted.id, name: persisted.name, kind: persisted.kind, enabled: persisted.enabled, version: persisted.version, sortOrder: persisted.sortOrder }, { id: created.data.id, name: "宠物医疗", kind: "EXPENSE", enabled: true, version: 1, sortOrder: 20 });
  assert.equal((await categories(934)).some((item) => item.id === created.data.id), false);
  assert.equal(await scalar("SELECT COUNT(*) FROM finance_categories WHERE id=? AND user_id=1", [created.data.id]), 1);
});

test("global success feedback preference defaults on and persists per user", async () => {
  const initial = await api<{ feedback: { showSuccess: boolean } }>("/settings");
  assert.equal(initial.data.feedback.showSuccess, true);
  const updated = await api<{ feedback: { showSuccess: boolean } }>("/settings", { method: "PATCH", body: JSON.stringify({ showSuccessFeedback: false }) });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.feedback.showSuccess, false);
  assert.equal((await api<{ feedback: { showSuccess: boolean } }>("/settings", {}, 934)).data.feedback.showSuccess, true);
});

test("recurring reminder time is projected, snapshotted at preparation, and used when posted", async () => {
  await initialize();
  const expense = (await categories()).find((item) => item.kind === "EXPENSE")!;
  const bank = await account({ openingBalanceCents: "0" });
  const created = await api<{ id: number; version: number }>("/finance/recurring-templates", { method: "POST", body: JSON.stringify({ operationId: op(), type: "EXPENSE", name: "房租", amountCents: "300000", accountId: bank.data.id, categoryId: expense.id, frequency: "MONTHLY", scheduleValue: 21, scheduledTime: "19:30", startDate: "2026-10-01" }) });
  assert.equal(created.response.status, 200);
  const projected = await api<Array<{ templateId: number; scheduledDate: string; scheduledTime: string; dueAt: string }>>("/finance/reminders?from=2026-10-21&to=2026-10-28");
  assert.deepEqual(projected.data.map(({ templateId, scheduledDate, scheduledTime }) => ({ templateId, scheduledDate, scheduledTime })), [{ templateId: created.data.id, scheduledDate: "2026-10-21", scheduledTime: "19:30" }]);
  assert.equal(projected.data[0].dueAt, "2026-10-21T11:30:00.000Z");
  await api("/finance/recurring-occurrences/prepare", { method: "POST", body: JSON.stringify({ operationId: op(), from: "2026-10-01", to: "2026-10-21" }) });
  const prepared = await api<Array<{ id: number; scheduledTime: string; status: string }>>("/finance/recurring-occurrences?from=2026-10-01&to=2026-10-21");
  assert.deepEqual(prepared.data.map((row) => [row.scheduledTime, row.status]), [["19:30", "PENDING"]]);
  await api(`/finance/recurring-templates/${created.data.id}`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 1, scheduledTime: "08:15" }) });
  const confirmOperation = op();
  const confirmation = await api<{ reward: { xp: number; coins: number; reason: string } }>(`/finance/recurring-occurrences/${prepared.data[0].id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: confirmOperation, expectedVersion: 1 }) });
  assert.deepEqual(confirmation.data.reward, { xp: 5, coins: 2, reason: "财务记录" });
  const replay = await api(`/finance/recurring-occurrences/${prepared.data[0].id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: confirmOperation, expectedVersion: 1 }) });
  assert.deepEqual(replay.data, confirmation.data);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_type='finance_entry'"), 1);
  const [transaction] = await pool.query("SELECT occurred_at FROM finance_transactions WHERE type=2");
  assert.equal(new Date((transaction as Array<{ occurred_at: Date }>)[0].occurred_at).toISOString(), "2026-10-21T11:30:00.000Z");
  const afterPost = await api<Array<{ templateId: number }>>("/finance/reminders?from=2026-10-21&to=2026-10-28");
  assert.equal(afterPost.data.length, 0);
});

test("expense and income update Entry-derived balances and monthly business-date totals", async () => {
  await initialize(); const cats = await categories(); const bank = await account();
  const expense = cats.find((item) => item.name === "餐饮")!; const income = cats.find((item) => item.name === "工资")!;
  await record("expenses", bank.data.id, expense.id, "3000");
  let accounts = await api<Array<{ balanceCents: string }>>("/finance/accounts"); assert.equal(accounts.data[0].balanceCents, "97000");
  await record("income", bank.data.id, income.id, "50000");
  accounts = await api<Array<{ balanceCents: string }>>("/finance/accounts"); assert.equal(accounts.data[0].balanceCents, "147000");
  const overview = await api<{ monthlyIncomeCents: string; monthlyExpenseCents: string }>("/finance/overview?month=2026-09"); assert.equal(overview.data.monthlyIncomeCents, "50000"); assert.equal(overview.data.monthlyExpenseCents, "3000");
});

test("posted income and expense grant one fixed reward per transaction; transfer and edits do not", async () => {
  await initialize(); const cats = await categories(); const expense = cats.find((item) => item.kind === "EXPENSE")!; const income = cats.find((item) => item.kind === "INCOME")!; const firstAccount = await account({ name: "主账户", openingBalanceCents: "0" }); const secondAccount = await account({ name: "储蓄卡", openingBalanceCents: "0" });
  const expenseOperation = op(); const spent = await record("expenses", firstAccount.data.id, expense.id, "1000", expenseOperation); const replay = await record("expenses", firstAccount.data.id, expense.id, "1000", expenseOperation);
  assert.deepEqual(spent.data.reward, { xp: 5, coins: 2, reason: "财务记录" }); assert.deepEqual(replay.data, spent.data);
  const earned = await record("income", firstAccount.data.id, income.id, "2000"); assert.deepEqual(earned.data.reward, { xp: 5, coins: 2, reason: "财务记录" });
  await api("/finance/transfers", { method: "POST", body: JSON.stringify({ operationId: op(), sourceAccountId: firstAccount.data.id, targetAccountId: secondAccount.data.id, amountCents: "500", occurredDate: "2026-09-21", occurredTime: "23:40" }) });
  await api(`/finance/transactions/${spent.data.transactionId}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, note: "edited" }) });
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_type='finance_entry'"), 2);
  assert.deepEqual([await scalar("SELECT xp_total FROM user_growth WHERE user_id=1"), await scalar("SELECT coins FROM user_growth WHERE user_id=1")], [10, 4]);
});

test("credit expense becomes negative balance, explicit liability, and remains a real expense", async () => {
  await initialize(); const expense = (await categories()).find((item) => item.kind === "EXPENSE")!;
  const credit = await account({ name: "信用卡", type: "CREDIT", openingBalanceCents: "0" }); await record("expenses", credit.data.id, expense.id, "10000");
  const accounts = await api<Array<{ type: string; balanceCents: string }>>("/finance/accounts"); assert.deepEqual([accounts.data[0].type, accounts.data[0].balanceCents], ["CREDIT", "-10000"]);
  const overview = await api<{ totalAssetsCents: string; totalLiabilitiesCents: string; netWorthCents: string; monthlyExpenseCents: string }>("/finance/overview?month=2026-09");
  assert.deepEqual([overview.data.totalAssetsCents, overview.data.totalLiabilitiesCents, overview.data.netWorthCents, overview.data.monthlyExpenseCents], ["0", "10000", "-10000", "10000"]);
});

test("operation replay is single-counted and changed payload returns 409", async () => {
  await initialize(); const expense = (await categories()).find((item) => item.kind === "EXPENSE")!; const bank = await account({ openingBalanceCents: "0" }); const operationId = op();
  const first = await record("expenses", bank.data.id, expense.id, "1200", operationId); const replay = await record("expenses", bank.data.id, expense.id, "1200", operationId);
  assert.deepEqual(replay.data, first.data); assert.equal(await scalar("SELECT COUNT(*) FROM finance_transactions"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM finance_entries"), 1);
  const conflict = await record("expenses", bank.data.id, expense.id, "1300", operationId); assert.equal(conflict.response.status, 409); assert.equal(await scalar("SELECT COUNT(*) FROM mutation_receipts WHERE operation_id=?", [operationId]), 1);
});

test("Entry failure rolls back transaction and receipt without partial finance state", async () => {
  await initialize(); const expense = (await categories()).find((item) => item.kind === "EXPENSE")!; const bank = await account({ openingBalanceCents: "0" }); const operationId = op();
  await pool.query("CREATE TRIGGER fail_finance_entry_insert BEFORE INSERT ON finance_entries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='forced finance entry failure'");
  const failed = await record("expenses", bank.data.id, expense.id, "9900", operationId); assert.equal(failed.response.status, 500);
  await pool.query("DROP TRIGGER fail_finance_entry_insert");
  assert.equal(await scalar("SELECT COUNT(*) FROM finance_transactions"), 0); assert.equal(await scalar("SELECT COUNT(*) FROM finance_entries"), 0); assert.equal(await scalar("SELECT COUNT(*) FROM mutation_receipts WHERE operation_id=?", [operationId]), 0);
});

test("ownership, category kind and disabled rules reject new writes while history remains readable", async () => {
  await initialize(); await initialize(934); const own = await categories(); const foreign = await categories(934); const bank = await account({ openingBalanceCents: "0" }); const foreignBank = await account({ name: "Foreign", openingBalanceCents: "0" }, 934);
  const expense = own.find((item) => item.kind === "EXPENSE")!; const income = own.find((item) => item.kind === "INCOME")!;
  assert.equal((await record("expenses", foreignBank.data.id, expense.id, "100")).response.status, 404);
  assert.equal((await record("expenses", bank.data.id, foreign.find((item) => item.kind === "EXPENSE")!.id, "100")).response.status, 404);
  assert.equal((await record("expenses", bank.data.id, income.id, "100")).response.status, 409);
  const posted = await record("expenses", bank.data.id, expense.id, "100");
  await api(`/finance/categories/${expense.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: expense.version, enabled: false }) });
  assert.equal((await record("expenses", bank.data.id, expense.id, "100")).response.status, 409);
  const detail = await api<{ id: number; categoryName: string }>(`/finance/transactions/${posted.data.transactionId}`); assert.equal(detail.data.categoryName, expense.name);
});

test("timezone snapshots, filters, safe metadata and optimistic versions remain stable", async () => {
  await initialize(); const cats = await categories(); const expense = cats.find((item) => item.kind === "EXPENSE")!; const bank = await account({ openingBalanceCents: "0" });
  const posted = await record("expenses", bank.data.id, expense.id, "2500", op(), 1, { occurredDate: "2026-09-21", occurredTime: "23:55", note: "晚餐" });
  await pool.query("UPDATE users SET timezone='America/New_York' WHERE id=1");
  const detail = await api<{ businessDate: string; recordTimezone: string; note: string; version: number }>(`/finance/transactions/${posted.data.transactionId}`);
  assert.deepEqual([detail.data.businessDate, detail.data.recordTimezone], ["2026-09-21", "Asia/Shanghai"]);
  const filtered = await api<{ items: Array<{ id: number }> }>(`/finance/transactions?from=2026-09-21&to=2026-09-21&accountId=${bank.data.id}&categoryId=${expense.id}&type=EXPENSE&keyword=%E6%99%9A%E9%A4%90`); assert.deepEqual(filtered.data.items.map((item) => item.id), [posted.data.transactionId]);
  assert.equal((await api(`/finance/accounts/${bank.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, name: "主卡" }) })).response.status, 200);
  assert.equal((await api(`/finance/accounts/${bank.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, name: "过期名称" }) })).response.status, 409);
  assert.equal((await api(`/finance/categories/${expense.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: expense.version, sortOrder: 999 }) })).response.status, 200);
  assert.equal((await api(`/finance/categories/${expense.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: expense.version, sortOrder: 1000 }) })).response.status, 409);
  assert.equal((await api(`/finance/transactions/${posted.data.transactionId}`, { method: "PUT", body: JSON.stringify({ expectedVersion: detail.data.version, note: "商务晚餐" }) })).response.status, 200);
});

test("ledger order follows immutable insertion identity across backdates, pages and metadata edits", async () => {
  await initialize(); const expense = (await categories()).find((item) => item.kind === "EXPENSE")!;
  const bank = await account({ openingBalanceCents: "0" });
  const ids: number[] = [];
  for (const occurredDate of ["2026-09-23", "2026-09-22", "2026-09-01", "2026-09-01"]) {
    const created = await record("expenses", bank.data.id, expense.id, "15800", op(), 1, { occurredDate });
    assert.equal(created.response.status, 200); ids.push(created.data.transactionId);
  }
  const url = "/finance/transactions?type=EXPENSE&limit=2";
  const first = await api<{ items: { id: number }[]; nextCursor: number }>(url);
  const second = await api<{ items: { id: number }[]; nextCursor: number | null }>(`${url}&cursor=${first.data.nextCursor}`);
  assert.deepEqual([...first.data.items, ...second.data.items].map((item) => item.id), [...ids].reverse());
  assert.equal(second.data.nextCursor, null);
  const edit = await api(`/finance/transactions/${ids[0]}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, note: "edited oldest insertion" }) });
  assert.equal(edit.response.status, 200);
  assert.deepEqual((await api<{ items: { id: number }[] }>(url)).data.items.map((item) => item.id), ids.slice(2).reverse());
  assert.deepEqual((await api<{ items: unknown[] }>(url, {}, 934)).data.items, []);
});
