import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl); const fresh = `workbench_fin04_${process.pid}_test`; const migrationDirectory = resolve(process.cwd(), "../../db/migration");
let admin: Connection; let pool: Pool; let app: typeof import("../src/app.js").app; let signToken: typeof import("../src/auth.js").signToken; let token = ""; let sequence = 0;
function version(name: string) { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; }
async function migrations() { return (await readdir(migrationDirectory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1] || a.localeCompare(b)); }
async function migrate(connection: Connection) { await connection.query(`USE \`${fresh}\``); for (const name of await migrations()) await connection.query(await readFile(resolve(migrationDirectory, name), "utf8")); }
async function api<T = any>(path: string, init: RequestInit = {}, auth = token) { const response = await app.request(`http://localhost/api${path}`, { ...init, headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json", ...(init.headers ?? {}) } }); const body = await response.json() as { data: T; code: number; message: string }; return { response, data: body.data, body }; }
function op() { return `${++sequence}-0000-4000-8000-000000000000`.replace(/^\d+/, (value) => value.padStart(8, "0")); }
async function scalar(query: string, values: unknown[] = []) { const [rows] = await pool.query(query, values); return Number((rows as Array<Record<string, unknown>>)[0].value); }
async function initialize(auth = token) { return api("/finance/initialize", { method: "POST", body: JSON.stringify({ operationId: op() }) }, auth); }
async function account(name: string, auth = token) { return api<{ id: number; version: number }>("/finance/accounts", { method: "POST", body: JSON.stringify({ operationId: op(), name, type: "BANK", openingDate: "2026-01-01", openingBalanceCents: "0", includeInOverview: true }) }, auth); }
async function categories(auth = token) { return (await api<Array<{ id: number; kind: string; version: number }>>("/finance/categories", {}, auth)).data; }
function csv(rows: string[]) { return ["date,time,amount,direction,account,category,note,id,currency", ...rows].join("\n"); }
function mapping() { return { date: "date", time: "time", amount: "amount", direction: "direction", account: "account", category: "category", note: "note", externalId: "id", currency: "currency" }; }
async function preview(sourceName: string, content: string) { return api<any>("/finance/imports/external/preview", { method: "POST", body: JSON.stringify({ operationId: op(), sourceName, csv: content, timezone: "Asia/Shanghai", mapping: mapping() }) }); }

before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${fresh}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await migrate(admin);
  const appUrl = new URL(sourceUrl); appUrl.pathname = `/${fresh}`; process.env.DATABASE_URL = appUrl.toString(); process.env.JWT_SECRET = "fin04-tests-only-secret";
  [{ pool }, { app }, { signToken }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
  token = signToken({ id: 1, username: "test", displayName: "Test" });
});
beforeEach(async () => {
  await pool.query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of ["finance_data_audits", "finance_import_rows", "finance_recurring_occurrences", "finance_recurring_templates", "finance_budgets", "finance_entries", "finance_transactions", "finance_import_batches", "finance_accounts", "finance_categories", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("DELETE FROM users WHERE id > 1"); await pool.query("SET FOREIGN_KEY_CHECKS=1"); await pool.query("UPDATE users SET deleted_at=NULL,timezone='Asia/Shanghai' WHERE id=1");
});
after(async () => { await pool?.end(); await admin.query(`DROP DATABASE IF EXISTS \`${fresh}\``); await admin.end(); });

test("V31 creates Finance-owned staging, audit and canonical source identity", async () => {
  assert.equal(await scalar("SELECT COUNT(*) value FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('finance_import_batches','finance_import_rows','finance_data_audits')"), 3);
  assert.equal(await scalar("SELECT COUNT(DISTINCT index_name) value FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='finance_transactions' AND index_name='uk_finance_transaction_import_identity'"), 1);
});

test("preview is ledger-pure, validates rows, and confirm is source and operation idempotent", async () => {
  await initialize(); const kinds = await categories(); const income = kinds.find((item) => item.kind === "INCOME")!; const expense = kinds.find((item) => item.kind === "EXPENSE")!; const bank = await account("导入账户");
  const content = csv([`2026-09-20,09:00,100.00,INCOME,导入账户,${income.id},工资,inc-1,CNY`, `2026-09-21,12:00,50.00,EXPENSE,导入账户,${expense.id},午餐,exp-1,CNY`, `not-a-date,12:00,3.00,EXPENSE,导入账户,${expense.id},坏日期,bad-1,CNY`, `2026-09-22,12:00,1.00,EXPENSE,导入账户,${expense.id},外币,fx-1,USD`]);
  const staged = await preview("bank.csv", content); assert.equal(staged.response.status, 200); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions"), 0); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_entries"), 0);
  assert.deepEqual(staged.data.rows.map((row: any) => row.status), ["READY", "READY", "INVALID", "INVALID"]);
  assert.deepEqual(staged.data.rows.slice(0, 2).map((row: any) => row.date), ["2026-09-20", "2026-09-21"]);
  const operationId = op(); const first = await api<any>(`/finance/imports/${staged.data.id}/confirm`, { method: "POST", body: JSON.stringify({ operationId }) }); const replay = await api<any>(`/finance/imports/${staged.data.id}/confirm`, { method: "POST", body: JSON.stringify({ operationId }) }); const changed = await api<any>(`/finance/imports/${staged.data.id}/confirm`, { method: "POST", body: JSON.stringify({ operationId, allowPossibleDuplicates: true }) });
  assert.equal(first.response.status, 200); assert.deepEqual(replay.data, first.data); assert.equal(changed.response.status, 409); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions"), 2); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_entries"), 2);
  assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions WHERE source=1 AND import_batch_id IS NOT NULL AND source_row_fingerprint IS NOT NULL"), 2);
  const uploadedAgain = await preview("renamed.csv", content); assert.equal(uploadedAgain.data.id, staged.data.id); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_import_batches"), 1);
  const overview = await api<{ monthlyIncomeCents: string; monthlyExpenseCents: string }>("/finance/overview?month=2026-09"); const report = await api<{ monthly: { incomeCents: string; expenseCents: string } }>("/finance/reports?month=2026-09"); assert.deepEqual([overview.data.monthlyIncomeCents, overview.data.monthlyExpenseCents, report.data.monthly.incomeCents, report.data.monthly.expenseCents], ["10000", "5000", "10000", "5000"]);
  assert.equal(bank.response.status, 200);
});

test("possible duplicates require opt-in and partial failures can be corrected and retried", async () => {
  await initialize(); const expense = (await categories()).find((item) => item.kind === "EXPENSE")!; const good = await account("日常账户"); const retry = await account("待修复账户");
  await api("/finance/expenses", { method: "POST", body: JSON.stringify({ operationId: op(), accountId: good.data.id, categoryId: expense.id, amountCents: "1000", occurredDate: "2026-09-20", occurredTime: "12:00", note: "相同消费" }) });
  const staged = await preview("partial.csv", csv([`2026-09-20,12:00,10.00,EXPENSE,日常账户,${expense.id},相同消费,dup-1,CNY`, `2026-09-21,12:00,20.00,EXPENSE,日常账户,${expense.id},正常行,ok-1,CNY`, `2026-09-22,12:00,30.00,EXPENSE,待修复账户,${expense.id},重试行,retry-1,CNY`]));
  assert.equal(staged.data.rows[0].status, "POSSIBLE_DUPLICATE"); await api(`/finance/accounts/${retry.data.id}/archive`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) });
  const partial = await api<any>(`/finance/imports/${staged.data.id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: op() }) }); assert.equal(partial.data.status, "PARTIAL"); assert.equal(partial.data.summary.imported, 1); assert.equal(partial.data.summary.failed, 1); assert.equal(partial.data.summary.possibleDuplicate, 1);
  await api(`/finance/accounts/${retry.data.id}/unarchive`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 2 }) }); const failedRow = (await api<any>(`/finance/imports/${staged.data.id}`)).data.rows.find((row: any) => row.status === "FAILED"); await api(`/finance/imports/${staged.data.id}/rows/${failedRow.id}`, { method: "PUT", body: JSON.stringify({ accountId: retry.data.id }) });
  const retryResult = await api<any>(`/finance/imports/${staged.data.id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: op(), rowIds: [failedRow.id] }) }); assert.equal(retryResult.data.summary.imported, 2); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions WHERE source=1"), 2);
  const possibleId = staged.data.rows[0].id; await api(`/finance/imports/${staged.data.id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: op(), rowIds: [possibleId], allowPossibleDuplicates: true }) }); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions WHERE source=1"), 3);
});

test("versioned backup restores the Finance graph atomically with mapped relations", async () => {
  await initialize(); const kinds = await categories(); const expense = kinds.find((item) => item.kind === "EXPENSE")!; const bank = await account("备份账户");
  const imported = await preview("backup.csv", csv([`2026-09-20,12:00,25.00,EXPENSE,备份账户,${expense.id},备份流水,b-1,CNY`])); await api(`/finance/imports/${imported.data.id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: op() }) });
  await api("/finance/budgets", { method: "POST", body: JSON.stringify({ operationId: op(), budgetMonth: "2026-09", limitCents: "10000" }) }); await api("/finance/recurring-templates", { method: "POST", body: JSON.stringify({ operationId: op(), type: "EXPENSE", name: "备份周期项", amountCents: "1000", accountId: bank.data.id, categoryId: expense.id, frequency: "MONTHLY", scheduleValue: 20, startDate: "2026-09-01" }) }); await api("/finance/recurring-occurrences/prepare", { method: "POST", body: JSON.stringify({ operationId: op(), from: "2026-09-01", to: "2026-09-30" }) }); const occurrence = (await api<any[]>("/finance/recurring-occurrences?from=2026-09-01&to=2026-09-30")).data[0]; await api(`/finance/recurring-occurrences/${occurrence.id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: occurrence.version }) });
  const exported = await api<any>("/finance/maintenance/export/json", { method: "POST", body: JSON.stringify({ operationId: op() }) }); const backup = JSON.parse(exported.data.content); assert.equal(backup.format, "workbench-finance-backup"); assert.equal(backup.schemaVersion, 1);
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (2,'restore-user','Restore','Asia/Shanghai',NOW(),NOW())"); const restoreToken = signToken({ id: 2, username: "restore-user", displayName: "Restore" }); const restorePreview = await api<any>("/finance/maintenance/restore/preview", { method: "POST", body: JSON.stringify(backup) }, restoreToken); assert.equal(restorePreview.data.valid, true);
  const operationId = op(); const restored = await api<any>("/finance/maintenance/restore/confirm", { method: "POST", body: JSON.stringify({ operationId, backup }) }, restoreToken); const replay = await api<any>("/finance/maintenance/restore/confirm", { method: "POST", body: JSON.stringify({ operationId, backup }) }, restoreToken); assert.equal(restored.data.restored, true); assert.deepEqual(replay.data, restored.data);
  const second = await api("/finance/maintenance/restore/confirm", { method: "POST", body: JSON.stringify({ operationId: op(), backup }) }, restoreToken); assert.equal(second.response.status, 409); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions WHERE user_id=2"), backup.graph.finance_transactions.length); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_entries WHERE user_id=2"), backup.graph.finance_entries.length); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_recurring_occurrences WHERE user_id=2 AND posted_transaction_id IS NOT NULL"), 1); assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions WHERE user_id=2 AND source=1 AND import_batch_id IS NOT NULL"), 1);
  const sourceOverview = await api<any>("/finance/overview?month=2026-09"); const restoredOverview = await api<any>("/finance/overview?month=2026-09", {}, restoreToken); assert.deepEqual([restoredOverview.data.totalBalanceCents, restoredOverview.data.monthlyExpenseCents], [sourceOverview.data.totalBalanceCents, sourceOverview.data.monthlyExpenseCents]);
});

test("reconciliation reports normal ledgers and pure graph validation detects controlled anomalies", async () => {
  await initialize(); const normal = await api<any>("/finance/maintenance/reconciliation", { method: "POST", body: JSON.stringify({ operationId: op(), from: "2026-09-01", to: "2026-09-30" }) }); assert.equal(normal.data.status, "ALL_CLEAR");
  const { validateFinanceBackup } = await import("../src/finance-maintenance.js"); const invalid = validateFinanceBackup({ format: "workbench-finance-backup", schemaVersion: 1, currency: "CNY", graph: { finance_accounts: [{ id: 1 }], finance_categories: [], finance_import_batches: [], finance_transactions: [{ id: 1, type: 3, category_id: null, source_account_id: 1, target_account_id: 99, related_transaction_id: null, import_batch_id: null }], finance_entries: [{ id: 1, transaction_id: 1, account_id: 1, amount_cents: "-100" }], finance_budgets: [], finance_recurring_templates: [], finance_recurring_occurrences: [{ id: 1, template_id: 99, account_id_snapshot: 1, category_id_snapshot: 99, status: 1, posted_transaction_id: null }], finance_import_rows: [] } });
  assert.equal(invalid.valid, false); assert.ok(invalid.errors.some((error: string) => error.includes("Transfer"))); assert.ok(invalid.errors.some((error: string) => error.includes("Recurring")));
});
