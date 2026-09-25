import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl), database = `workbench_onboarding_${process.pid}_test`;
const migrationDirectory = resolve(process.cwd(), process.cwd().endsWith("/apps/api") ? "../../db/migration" : "db/migration");
let admin: Connection, pool: Pool, app: typeof import("../src/app.js").app, signToken: typeof import("../src/auth.js").signToken;
function version(name: string) { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; }
async function migrate(through = 34) { const names = (await readdir(migrationDirectory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1]); await admin.query(`USE \`${database}\``); for (const name of names) if (version(name)[0] <= through) await admin.query(await readFile(resolve(migrationDirectory, name), "utf8")); }
function headers(userId = 1) { return { Authorization: `Bearer ${signToken({ id: userId, username: `onboarding-${userId}`, displayName: "Onboarding" })}`, "Content-Type": "application/json" }; }
async function api<T = any>(path: string, init: RequestInit = {}, userId = 1) { const response = await app.request(`http://localhost/api${path}`, { ...init, headers: { ...headers(userId), ...(init.headers ?? {}) } }); const body = await response.json() as { data: T; message: string }; return { response, data: body.data, message: body.message }; }
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Record<string, unknown>[])[0])[0]); }

before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await migrate();
  const url = new URL(sourceUrl); url.pathname = `/${database}`; process.env.NODE_ENV = "test"; process.env.DATABASE_URL = url.toString(); process.env.JWT_SECRET = "onboarding-tests-only";
  [{ pool }, { app }, { signToken }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
});
beforeEach(async () => {
  await pool.query("DELETE FROM onboarding_hint_state"); await pool.query("DELETE FROM onboarding_flow_progress");
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (931,'existing-onboarding','Existing','Asia/Shanghai',NOW(),NOW()) ON DUPLICATE KEY UPDATE deleted_at=NULL");
});
after(async () => { await pool?.end(); await admin?.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin?.end(); });

test("new registration is eligible while existing users do not auto-trigger", async () => {
  const existing = await api<{ eligible: boolean; flow: null }>("/onboarding/status", {}, 931); assert.equal(existing.data.eligible, false); assert.equal(existing.data.flow, null);
  const username = `onboarding_${Date.now()}`;
  const response = await app.request("http://localhost/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "secure-pass", displayName: "New" }) });
  assert.equal(response.status, 200); const payload = await response.json() as { data: { user: { id: number } } };
  const status = await api<{ eligible: boolean; flow: { status: string; currentStepId: string } }>("/onboarding/status", {}, payload.data.user.id);
  assert.equal(status.data.eligible, true); assert.deepEqual([status.data.flow.status, status.data.flow.currentStepId], ["NOT_STARTED", "publish"]);
});

test("flow transitions are ordered, replay-safe, restartable, skippable, and version-isolated", async () => {
  await pool.query("INSERT INTO onboarding_flow_progress (user_id,flow_id,flow_version,status,current_step_id,updated_at) VALUES (1,'core-loop',1,'NOT_STARTED','publish',NOW()),(1,'core-loop',2,'COMPLETED',NULL,NOW())");
  assert.equal((await api<any>("/onboarding/flows/core-loop/start", { method: "POST" })).data.status, "IN_PROGRESS");
  assert.equal((await api<any>("/onboarding/flows/core-loop/advance", { method: "POST", body: JSON.stringify({ stepId: "create" }) })).response.status, 409);
  for (const stepId of ["publish", "create", "accept", "start"]) { const first = await api<any>("/onboarding/flows/core-loop/advance", { method: "POST", body: JSON.stringify({ stepId }) }); const replay = await api<any>("/onboarding/flows/core-loop/advance", { method: "POST", body: JSON.stringify({ stepId }) }); assert.equal(replay.response.status, 200); assert.equal(first.data.status, stepId === "start" ? "COMPLETED" : "IN_PROGRESS"); }
  assert.equal(await scalar("SELECT COUNT(*) FROM onboarding_flow_progress WHERE user_id=1 AND flow_version=2 AND status='COMPLETED'"), 1);
  assert.equal((await api<any>("/onboarding/flows/core-loop/restart", { method: "POST" })).data.currentStepId, "publish");
  assert.equal((await api<any>("/onboarding/flows/core-loop/skip", { method: "POST" })).data.status, "SKIPPED");
});

test("hint state is isolated per user and onboarding deletion leaves domain facts unchanged", async () => {
  await pool.query("INSERT INTO onboarding_flow_progress (user_id,flow_id,flow_version,status,current_step_id,updated_at) VALUES (1,'core-loop',1,'COMPLETED',NULL,NOW()),(931,'core-loop',1,'COMPLETED',NULL,NOW())");
  await api("/onboarding/hints/finance-intro/seen", { method: "POST", body: JSON.stringify({ hintVersion: 1 }) }); await api("/onboarding/hints/finance-intro/seen", { method: "POST", body: JSON.stringify({ hintVersion: 1 }) }); await api("/onboarding/hints/finance-intro/dismiss", { method: "POST", body: JSON.stringify({ hintVersion: 1 }) });
  assert.equal(await scalar("SELECT COUNT(*) FROM onboarding_hint_state WHERE user_id=1 AND hint_key='finance-intro'"), 1); assert.equal((await api<any>("/onboarding/status", {}, 931)).data.hints.length, 0);
  await pool.query("INSERT INTO tasks (user_id,title,priority,difficulty,status,pinned,progress_percent,version,sort_order,completion_sequence,created_at,updated_at) VALUES (1,'Domain fact',2,2,0,0,0,1,10,0,NOW(),NOW())");
  const before = await scalar("SELECT COUNT(*) FROM tasks WHERE user_id=1"); await pool.query("DELETE FROM onboarding_hint_state WHERE user_id=1"); await pool.query("DELETE FROM onboarding_flow_progress WHERE user_id=1");
  assert.equal(await scalar("SELECT COUNT(*) FROM tasks WHERE user_id=1"), before); assert.equal((await api<any>("/tasks")).data.some((task: any) => task.title === "Domain fact"), true);
});
