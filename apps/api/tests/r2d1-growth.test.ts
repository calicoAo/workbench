import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl); const fresh = `workbench_r2d1_fresh_${process.pid}_test`; const upgrade = `workbench_r2d1_upgrade_${process.pid}_test`; const migrationDirectory = resolve(process.cwd(), "../../db/migration");
let admin: Connection; let pool: Pool; let app: typeof import("../src/app.js").app; let signToken: typeof import("../src/auth.js").signToken; let token = ""; let sequence = 0;
function version(name: string) { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; }
async function migrations() { return (await readdir(migrationDirectory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1] || a.localeCompare(b)); }
async function migrate(connection: Connection, database: string, from = 1, through = 32) { await connection.query(`USE \`${database}\``); for (const name of await migrations()) { const major = version(name)[0]; if (major >= from && major <= through) await connection.query(await readFile(resolve(migrationDirectory, name), "utf8")); } }
function op() { return `82000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`; }
async function api<T = unknown>(path: string, init: RequestInit = {}) { const response = await app.request(`http://localhost/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } }); const body = await response.json() as { data: T; message: string }; return { response, data: body.data, message: body.message }; }
async function scalar(query: string, values: unknown[] = []) { const [rows] = await pool.query(query, values); return Number(Object.values((rows as Array<Record<string, unknown>>)[0])[0]); }
async function category(name: string) { const [rows] = await pool.query("SELECT id FROM task_categories WHERE user_id=1 AND name=?", [name]); return Number((rows as Array<{ id: number }>)[0].id); }
async function dimension(name: string) { const [rows] = await pool.query("SELECT id, dimension_key dimensionKey, version FROM growth_dimensions WHERE user_id=1 AND name=?", [name]); return (rows as Array<{ id: number; dimensionKey: string; version: number }>)[0]; }
async function overview(period = 30, to = "2026-09-24") { return (await api<any>(`/growth/overview?period=${period}&to=${to}`)).data; }

before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${fresh}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await admin.query(`CREATE DATABASE \`${upgrade}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await migrate(admin, fresh); await migrate(admin, upgrade, 1, 31); await admin.query(`USE \`${upgrade}\``); await admin.query("INSERT INTO quick_notes (user_id,note_date,content,created_at,updated_at) VALUES (1,'2026-09-20','preserve R2D1',NOW(),NOW())"); await migrate(admin, upgrade, 32, 32);
  const appUrl = new URL(sourceUrl); appUrl.pathname = `/${fresh}`; process.env.NODE_ENV = "test"; process.env.DATABASE_URL = appUrl.toString(); process.env.JWT_SECRET = "r2d1-tests-only-secret"; [{ pool }, { app }, { signToken }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]); token = signToken({ id: 1, username: "growth", displayName: "Growth" });
});
beforeEach(async () => {
  await pool.query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of ["finance_entries", "finance_transactions", "finance_accounts", "finance_categories", "habit_occurrences", "task_completion_events", "schedules", "timer_segments", "timer_sessions", "tasks", "reward_events", "user_growth", "growth_dimensions", "task_categories", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("SET FOREIGN_KEY_CHECKS=1"); await pool.query("UPDATE users SET deleted_at=NULL, timezone='Asia/Shanghai' WHERE id=1");
  const now = "2026-09-01 00:00:00";
  await pool.query("INSERT INTO growth_dimensions (user_id,dimension_key,name,icon_key,color,sort_order,enabled,version,created_at,updated_at) VALUES (1,'career','事业','briefcase','#5B8DEF',10,1,1,?,?),(1,'learning','学习','book-open','#B28DFF',20,1,1,?,?),(1,'body','身体','heart-pulse','#9BD67D',30,1,1,?,?)", [now, now, now, now, now, now]);
  await pool.query("INSERT INTO task_categories (user_id,name,color,icon,dimension_key,target_minutes,sort_order,enabled,created_at,updated_at) VALUES (1,'工作','#3B82F6','briefcase','career',6000,10,1,?,?),(1,'学习','#8B5CF6','book-open','learning',6000,20,1,?,?),(1,'其他','#64748B','circle',NULL,6000,30,1,?,?)", [now, now, now, now, now, now]);
});
after(async () => { await pool?.end(); await admin.query(`DROP DATABASE IF EXISTS \`${fresh}\``); await admin.query(`DROP DATABASE IF EXISTS \`${upgrade}\``); await admin.end(); });

test("V32 migrates fresh and upgrades V31 without changing existing history", async () => {
  const [tables] = await admin.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='${fresh}' AND table_name='growth_dimensions'`); assert.equal((tables as unknown[]).length, 1);
  await admin.query(`USE \`${upgrade}\``); const [notes] = await admin.query("SELECT content FROM quick_notes WHERE content='preserve R2D1'"); assert.equal((notes as unknown[]).length, 1); assert.equal(await (async () => { const [rows] = await admin.query("SELECT COUNT(*) value FROM growth_dimensions WHERE user_id=1"); return Number((rows as any[])[0].value); })(), 6);
});

test("Growth hero consumes the Rewards XP and level owner unchanged", async () => {
  await pool.query("INSERT INTO user_growth (user_id,level,xp_total,coins,created_at,updated_at) VALUES (1,99,180,27,NOW(),NOW())");
  const [growth, rewards] = await Promise.all([overview(), api<any>("/rewards")]);
  assert.deepEqual(growth.hero, rewards.data.growth); assert.equal(growth.hero.level, 2); assert.equal(growth.hero.xpTotal, 180);
});

test("ActualTime attributes timer, manual and legacy entries once without counting timer projections", async () => {
  const work = await category("工作"); const learning = await category("学习");
  await pool.query("INSERT INTO tasks (id,user_id,category_id,title,priority,difficulty,status,pinned,progress_percent,sort_order,completion_sequence,created_at,updated_at) VALUES (11,1,?,'计时任务',2,2,0,0,0,1,0,NOW(),NOW())", [work]);
  await pool.query("INSERT INTO timer_sessions (id,user_id,task_id,session_model,record_timezone,category_id,start_time,duration_minutes,status,completion_requested,task_completed,version,created_at,updated_at) VALUES (21,1,11,1,'Asia/Shanghai',?,'2026-09-20 01:00:00',60,2,0,0,1,NOW(),NOW())", [work]);
  const [segmentResult] = await pool.query("INSERT INTO timer_segments (user_id,timer_session_id,task_id,status,started_at,ended_at,business_date,record_timezone,project_attribution_status,category_id_at_occurrence,category_attribution_status,task_title_snapshot,version,created_at,updated_at) VALUES (1,21,11,1,'2026-09-20 01:00:00','2026-09-20 02:00:00','2026-09-20','Asia/Shanghai',1,?,2,'计时任务',1,NOW(),NOW())", [work]);
  const segmentId = Number((segmentResult as { insertId: number }).insertId);
  await pool.query("INSERT INTO schedules (user_id,task_id,category_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,timer_session_id,timer_segment_id,slice_date,project_attribution_status,category_id_at_occurrence,category_attribution_status,version,created_at,updated_at) VALUES (1,11,?,'2026-09-20','Asia/Shanghai','09:00:00','10:00:00','2026-09-20 01:00:00','2026-09-20 02:00:00','只读计时投影',1,1,1,1,3,0,21,?,'2026-09-20',1,?,2,1,NOW(),NOW())", [work, segmentId, work]);
  await pool.query("INSERT INTO schedules (user_id,category_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,project_attribution_status,category_id_at_occurrence,category_attribution_status,version,created_at,updated_at) VALUES (1,?,'2026-09-21','Asia/Shanghai','10:00:00','10:30:00','2026-09-21 02:00:00','2026-09-21 02:30:00','手工实际',1,1,1,0,1,1,1,?,2,1,NOW(),NOW()),(1,?,'2026-09-22','Asia/Shanghai','10:00:00','10:45:00','2026-09-22 02:00:00','2026-09-22 02:45:00','历史实际',1,1,1,0,2,1,1,?,2,1,NOW(),NOW())", [learning, learning, learning, learning]);
  const result = await overview(); const career = result.dimensions.find((item: any) => item.dimensionKey === "career"); const study = result.dimensions.find((item: any) => item.dimensionKey === "learning"); assert.equal(career.actualMinutes, 60); assert.equal(study.actualMinutes, 75); assert.equal(result.summary.actualMinutes, 135);
});

test("CompletionEvent survives reopen and current category mapping reclassifies history without rewriting facts", async () => {
  const work = await category("工作"); await pool.query("INSERT INTO tasks (id,user_id,category_id,title,priority,difficulty,status,pinned,progress_percent,sort_order,completion_sequence,created_at,updated_at) VALUES (31,1,?,'可重开任务',2,2,0,0,0,1,2,NOW(),NOW())", [work]);
  await pool.query("INSERT INTO task_completion_events (user_id,task_id,category_id_at_occurrence,occurred_at,record_timezone,business_date,lifecycle_version,operation_id,source,created_at) VALUES (1,31,?,'2026-09-20 01:00:00','Asia/Shanghai','2026-09-20',1,?,1,NOW()),(1,31,?,'2026-09-22 01:00:00','Asia/Shanghai','2026-09-22',2,?,1,NOW())", [work, op(), work, op()]);
  let result = await overview(); assert.equal(result.dimensions.find((item: any) => item.dimensionKey === "career").completedTaskCount, 2);
  await api(`/growth/category-mappings/${work}`, { method: "PUT", body: JSON.stringify({ dimensionKey: "learning" }) }); result = await overview(); assert.equal(result.dimensions.find((item: any) => item.dimensionKey === "career").completedTaskCount, 0); assert.equal(result.dimensions.find((item: any) => item.dimensionKey === "learning").completedTaskCount, 2); assert.equal(await scalar("SELECT category_id_at_occurrence FROM task_completion_events LIMIT 1"), work);
});

test("Unmapped and disabled category history remains visible, while disabling a dimension atomically unmaps categories", async () => {
  const other = await category("其他"); const work = await category("工作"); await pool.query("UPDATE task_categories SET enabled=0 WHERE id=?", [other]);
  await pool.query("INSERT INTO schedules (user_id,category_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,project_attribution_status,category_id_at_occurrence,category_attribution_status,version,created_at,updated_at) VALUES (1,?,'2026-09-20','Asia/Shanghai','10:00:00','11:00:00','2026-09-20 02:00:00','2026-09-20 03:00:00','未映射投入',1,1,1,0,1,1,1,?,2,1,NOW(),NOW())", [other, other]);
  let result = await overview(); assert.equal(result.unmapped.actualMinutes, 60);
  const career = await dimension("事业"); const disabled = await api<any>(`/growth/dimensions/${career.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: career.version, enabled: false }) }); assert.equal(disabled.response.status, 200); assert.equal(await scalar("SELECT COUNT(*) FROM task_categories WHERE id=? AND dimension_key IS NULL", [work]), 1);
});

test("7, 30 and 90 day periods use inclusive business-date boundaries and zero totals stay finite", async () => {
  const work = await category("工作");
  for (const [date, title] of [["2026-09-18", "inside seven"], ["2026-09-17", "outside seven"], ["2026-08-26", "inside thirty"], ["2026-08-25", "outside thirty"], ["2026-06-27", "inside ninety"], ["2026-06-26", "outside ninety"]]) await pool.query("INSERT INTO schedules (user_id,category_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,project_attribution_status,category_id_at_occurrence,category_attribution_status,version,created_at,updated_at) VALUES (1,?,?,'Asia/Shanghai','09:00:00','10:00:00',CONCAT(?,' 01:00:00'),CONCAT(?,' 02:00:00'),?,1,1,1,0,1,1,1,?,2,1,NOW(),NOW())", [work, date, date, date, title, work]);
  assert.equal((await overview(7)).summary.actualMinutes, 60); assert.equal((await overview(30)).summary.actualMinutes, 180); assert.equal((await overview(90)).summary.actualMinutes, 300);
  const zero = await api<any>("/growth/overview?period=7&to=2025-01-01"); assert.equal(zero.data.summary.actualMinutes, 0); assert.ok(zero.data.dimensions.every((item: any) => Number.isFinite(item.share) && item.share === 0));
});

test("Finance transactions do not change XP or Growth dimension metrics", async () => {
  const before = await overview(); await pool.query("INSERT INTO finance_categories (id,user_id,kind,name,sort_order,enabled,version,created_at,updated_at) VALUES (51,1,1,'成长无关',1,1,1,NOW(),NOW())"); await pool.query("INSERT INTO finance_accounts (id,user_id,name,type,currency,include_in_overview,opening_date,version,created_at,updated_at) VALUES (61,1,'账户',1,'CNY',1,'2026-01-01',1,NOW(),NOW())"); await pool.query("INSERT INTO finance_transactions (id,user_id,type,occurred_at,record_timezone,business_date,category_id,source_account_id,status,source,version,created_at,updated_at) VALUES (71,1,2,'2026-09-24 01:00:00','Asia/Shanghai','2026-09-24',51,61,0,0,1,NOW(),NOW())"); await pool.query("INSERT INTO finance_entries (user_id,transaction_id,account_id,amount_cents,created_at) VALUES (1,71,61,-10000,NOW())"); const after = await overview(); assert.deepEqual(after.hero, before.hero); assert.deepEqual(after.dimensions, before.dimensions); assert.deepEqual(after.unmapped, before.unmapped);
});
