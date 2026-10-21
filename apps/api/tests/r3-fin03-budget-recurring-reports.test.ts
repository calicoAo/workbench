import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, before, beforeEach, after } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl); const fresh = `workbench_fin03_${process.pid}_test`; const migrationDirectory = resolve(process.cwd(), "../../db/migration"); let admin: Connection; let pool: Pool; let app: typeof import("../src/app.js").app; let signToken: typeof import("../src/auth.js").signToken; let token = ""; let sequence = 0;
function version(name: string) { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; }
async function migrations() { return (await readdir(migrationDirectory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1] || a.localeCompare(b)); }
async function migrate(connection: Connection) { await connection.query(`USE \`${fresh}\``); for (const name of await migrations()) await connection.query(await readFile(resolve(migrationDirectory, name), "utf8")); }
async function api<T = unknown>(path: string, init: RequestInit = {}) { const response = await app.request(`http://localhost/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } }); const body = await response.json() as { data: T; code: number; message: string }; return { response, data: body.data }; }
function op() { return `${sequence++}-0000-4000-8000-000000000000`.replace(/^\d+/, (value) => value.padStart(8, "0")); }
async function scalar(query: string, values: unknown[] = []) { const [rows] = await pool.query(query, values); return Number((rows as Array<Record<string, unknown>>)[0].value); }

before(async () => { admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" }); await admin.query(`CREATE DATABASE \`${fresh}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await migrate(admin); const appUrl = new URL(sourceUrl); appUrl.pathname = `/${fresh}`; process.env.DATABASE_URL = appUrl.toString(); process.env.JWT_SECRET = "fin03-tests-only-secret"; [{ pool }, { app }, { signToken }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]); token = signToken({ id: 1, username: "test", displayName: "Test" }); });
beforeEach(async () => { for (const table of ["finance_recurring_occurrences", "finance_recurring_templates", "finance_budgets", "finance_entries", "finance_transactions", "finance_accounts", "finance_categories", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`); await pool.query("UPDATE users SET deleted_at=NULL,timezone='Asia/Shanghai' WHERE id=1"); });
after(async () => { await pool?.end(); await admin.query(`DROP DATABASE IF EXISTS \`${fresh}\``); await admin.end(); });

async function initialize() { await api("/finance/initialize", { method: "POST", body: JSON.stringify({ operationId: op() }) }); }
async function account(name = "主账户") { return api<{ id: number; version: number }>("/finance/accounts", { method: "POST", body: JSON.stringify({ operationId: op(), name: `${name}-${sequence}`, type: "BANK", openingDate: "2026-09-01", openingBalanceCents: "100000", includeInOverview: true }) }); }
async function categories() { return (await api<Array<{ id: number; kind: string }>>("/finance/categories")).data; }

test("V30 creates budget, recurring and report tables", async () => { assert.equal(await scalar("SELECT COUNT(*) value FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('finance_budgets','finance_recurring_templates','finance_recurring_occurrences')"), 3); });

test("budget total/category uses effective posted expense and update is idempotent", async () => { await initialize(); const category = (await categories()).find((item) => item.kind === "EXPENSE")!; const source = await account(); await api("/finance/expenses", { method: "POST", body: JSON.stringify({ operationId: op(), accountId: source.data.id, categoryId: category.id, amountCents: "3000", occurredDate: "2026-09-10", occurredTime: "12:00" }) }); const budget = await api<{ id: number; version: number }>("/finance/budgets", { method: "POST", body: JSON.stringify({ operationId: op(), budgetMonth: "2026-09", categoryId: category.id, limitCents: "5000" }) }); const rows = await api<Array<{ spentCents: string; remainingCents: string }>>("/finance/budgets?month=2026-09"); assert.deepEqual([rows.data[0].spentCents, rows.data[0].remainingCents], ["3000", "2000"]); const updated = await api<{ version: number }>("/finance/budgets", { method: "POST", body: JSON.stringify({ operationId: op(), budgetMonth: "2026-09", categoryId: category.id, limitCents: "6000", expectedVersion: budget.data.version }) }); assert.equal(updated.data.version, 2); });

test("recurring preparation creates pending only, confirm posts once, skip has no balance effect", async () => { await initialize(); const category = (await categories()).find((item) => item.kind === "EXPENSE")!; const source = await account(); const template = await api<{ id: number }>("/finance/recurring-templates", { method: "POST", body: JSON.stringify({ operationId: op(), type: "EXPENSE", name: "房租", amountCents: "2000", accountId: source.data.id, categoryId: category.id, frequency: "MONTHLY", scheduleValue: 5, startDate: "2026-09-01" }) }); assert.equal(template.response.status, 200); await api("/finance/recurring-occurrences/prepare", { method: "POST", body: JSON.stringify({ operationId: op(), from: "2026-09-01", to: "2026-09-10" }) }); const pending = await api<Array<{ id: number; status: string; version: number }>>("/finance/recurring-occurrences?from=2026-09-01&to=2026-09-10"); assert.equal(pending.data[0].status, "PENDING"); const before = await api<Array<{ id: number; balanceCents: string }>>("/finance/accounts?view=all"); const posted = await api<{ transactionId: number }>(`/finance/recurring-occurrences/${pending.data[0].id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: pending.data[0].version }) }); assert.equal(posted.response.status, 200); const replay = await api<{ transactionId: number }>(`/finance/recurring-occurrences/${pending.data[0].id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 2 }) }); assert.equal(replay.response.status, 200); assert.equal(replay.data.transactionId, posted.data.transactionId); const after = await api<Array<{ id: number; balanceCents: string }>>("/finance/accounts?view=all"); assert.equal(BigInt(after.data[0].balanceCents), BigInt(before.data[0].balanceCents) - 2000n); const occurrence = await api<Array<{ id: number; status: string; version: number }>>("/finance/recurring-occurrences?from=2026-09-01&to=2026-09-10"); await api(`/finance/recurring-occurrences/${occurrence.data[0].id}/skip`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: occurrence.data[0].version }) }).then((result) => assert.equal(result.response.status, 409)); });

test("report returns monthly flow, category breakdown, account movement and reconciliation", async () => { await initialize(); const category = (await categories()).find((item) => item.kind === "EXPENSE")!; const source = await account(); await api("/finance/expenses", { method: "POST", body: JSON.stringify({ operationId: op(), accountId: source.data.id, categoryId: category.id, amountCents: "1200", occurredDate: "2026-09-10", occurredTime: "12:00" }) }); const report = await api<{ monthly: { expenseCents: string; netCashflowCents: string }; categories: Array<{ netExpenseCents: string }>; reconciliation: boolean }>("/finance/reports?month=2026-09"); assert.deepEqual([report.data.monthly.expenseCents, report.data.monthly.netCashflowCents, report.data.categories[0].netExpenseCents, report.data.reconciliation], ["1200", "-1200", "1200", true]); });

test("selected recurring generation is scoped, retry-safe, and never reposts resolved occurrences", async () => {
  await initialize();
  const category = (await categories()).find((item) => item.kind === "EXPENSE")!;
  const source = await account();
  async function template(name: string, scheduleValue: number, startDate = "2026-10-01") {
    const result = await api<{ id: number }>("/finance/recurring-templates", { method: "POST", body: JSON.stringify({ operationId: op(), type: "EXPENSE", name, amountCents: "2000", accountId: source.data.id, categoryId: category.id, frequency: "MONTHLY", scheduleValue, scheduledTime: "09:45", startDate }) });
    assert.equal(result.response.status, 200);
    return result.data.id;
  }
  const selected = await template("selected", 26);
  const unselected = await template("unselected", 27);
  const noDate = await template("future", 1, "2026-11-01");
  const generate = (ids: number[], operationId = op()) => api<{ created: number; existing: number }>("/finance/recurring-occurrences/prepare", { method: "POST", body: JSON.stringify({ operationId, from: "2026-10-01", to: "2026-10-31", templateIds: ids }) });
  const identity = op();
  const first = await generate([selected], identity);
  assert.deepEqual(first.data, { created: 1, existing: 0 });
  assert.deepEqual((await generate([selected], identity)).data, first.data);
  assert.deepEqual((await generate([selected])).data, { created: 0, existing: 1 });
  assert.equal((await generate([unselected], identity)).response.status, 409);
  assert.deepEqual((await generate([noDate])).data, { created: 0, existing: 0 });
  assert.equal(await scalar("SELECT COUNT(*) value FROM finance_recurring_occurrences WHERE template_id=?", [unselected]), 0);
  const rows = (await api<Array<{ id: number; templateId: number; status: string; version: number; scheduledTime: string }>>("/finance/recurring-occurrences?from=2026-10-01&to=2026-10-31")).data;
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].templateId, rows[0].status, rows[0].scheduledTime], [selected, "PENDING", "09:45"]);
  assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions WHERE type IN (1,2)"), 0);
  const balance = async () => (await api<Array<{ balanceCents: string }>>("/finance/accounts")).data[0].balanceCents;
  assert.equal(await balance(), "100000");
  const confirmed = await api(`/finance/recurring-occurrences/${rows[0].id}/confirm`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) });
  assert.equal(confirmed.response.status, 200);
  assert.equal(await balance(), "98000");
  assert.deepEqual((await generate([selected])).data, { created: 0, existing: 1 });
  await generate([unselected]);
  const [skippable] = (await api<Array<{ id: number; templateId: number }>>("/finance/recurring-occurrences?from=2026-10-01&to=2026-10-31")).data.filter((row) => row.templateId === unselected);
  assert.equal((await api(`/finance/recurring-occurrences/${skippable.id}/skip`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) })).response.status, 200);
  assert.deepEqual((await generate([selected, unselected])).data, { created: 0, existing: 2 });
  assert.equal(await balance(), "98000");
  assert.equal(await scalar("SELECT COUNT(*) value FROM finance_transactions WHERE type=2"), 1);
  const statuses = (await api<Array<{ status: string }>>("/finance/recurring-occurrences?from=2026-10-01&to=2026-10-31")).data.map((row) => row.status);
  assert.deepEqual(statuses, ["POSTED", "SKIPPED"]);
});

test("selected recurring generation rejects empty, disabled, missing and foreign selections atomically", async () => {
  await initialize();
  const category = (await categories()).find((item) => item.kind === "EXPENSE")!;
  const source = await account();
  const ids: number[] = [];
  for (const name of ["enabled", "disabled"]) {
    const result = await api<{ id: number }>("/finance/recurring-templates", { method: "POST", body: JSON.stringify({ operationId: op(), type: "EXPENSE", name, amountCents: "2000", accountId: source.data.id, categoryId: category.id, frequency: "MONTHLY", scheduleValue: 26, startDate: "2026-10-01" }) });
    ids.push(result.data.id);
  }
  await pool.query("UPDATE finance_recurring_templates SET enabled=0 WHERE id=?", [ids[1]]);
  await pool.query("INSERT INTO users (id,username,display_name) VALUES (935,'selected-foreign','Other user') ON DUPLICATE KEY UPDATE deleted_at=NULL");
  const ownerToken = token;
  token = signToken({ id: 935, username: "selected-foreign", displayName: "Other user" });
  await initialize();
  const otherCategory = (await categories()).find((item) => item.kind === "EXPENSE")!;
  const otherAccount = await account("Other account");
  const foreign = await api<{ id: number }>("/finance/recurring-templates", { method: "POST", body: JSON.stringify({ operationId: op(), type: "EXPENSE", name: "foreign", amountCents: "2000", accountId: otherAccount.data.id, categoryId: otherCategory.id, frequency: "MONTHLY", scheduleValue: 26, startDate: "2026-10-01" }) });
  assert.equal(foreign.response.status, 200);
  ids.push(foreign.data.id);
  token = ownerToken;
  for (const [templateIds, status] of [[[], 400], [[ids[0], ids[1]], 409], [[ids[0], ids[2]], 409], [[ids[0], 9999999], 409]] as Array<[number[], number]>) {
    const result = await api("/finance/recurring-occurrences/prepare", { method: "POST", body: JSON.stringify({ operationId: op(), from: "2026-10-01", to: "2026-10-31", templateIds }) });
    assert.equal(result.response.status, status);
    assert.equal(await scalar("SELECT COUNT(*) value FROM finance_recurring_occurrences"), 0);
  }
});
