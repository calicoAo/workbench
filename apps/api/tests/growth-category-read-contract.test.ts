import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import mysql, { type Connection, type Pool, type ResultSetHeader } from "mysql2/promise";
import { businessDateAt } from "../src/time.js";

type Overview = Awaited<ReturnType<typeof import("../src/growth.js").growthOverview>>;
const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.endsWith("_test")) throw new Error("Require an isolated TEST_DATABASE_URL ending in _test");
const source = new URL(sourceUrl), database = `workbench_growth_g1_${process.pid}_test`;
let admin: Connection, pool: Pool, app: typeof import("../src/app.js").app;
let tokens: string[];
async function api<T>(path: string, method = "GET", body?: unknown, userId = 1): Promise<T> {
  const response = await app.request(`/api${path}`, { method, headers: { Authorization: `Bearer ${tokens[userId]}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = await response.json() as { data: T; message: string };
  assert.equal(response.status, 200, json.message); return json.data;
}
async function overview(days = 7, to = "2026-10-07", userId = 1) { return api<Overview>(`/growth/overview?period=${days}&to=${to}`, "GET", undefined, userId); }
async function insert(sql: string, values: unknown[]) { const [result] = await pool.query<ResultSetHeader>(sql, values); return result.insertId; }
async function category(name: string, dimensionKey: string | null = "career", userId = 1) {
  return (await api<{ id: number }>("/task-categories", "POST", { name, color: "#8B5CF6", dimensionKey }, userId)).id;
}
async function task(categoryId: number | null, userId = 1) {
  return (await api<{ id: number }>("/tasks", "POST", { operationId: randomUUID(), title: "Historical contribution", categoryId: categoryId ?? undefined, recordTimezone: "Asia/Tokyo" }, userId)).id;
}
async function execution(taskId: number, parts: { from: string; to: string; categoryId: number | null; attribution?: number; timezone?: string; status?: number }[], userId = 1, note: string | null = "one canonical session note") {
  const sessionId = await insert("INSERT INTO timer_sessions (user_id,task_id,session_model,record_timezone,start_time,end_time,duration_minutes,status,version,note,created_at,updated_at) VALUES (?,?,1,?,?,?,999,2,1,?,NOW(),NOW())", [userId, taskId, parts[0].timezone ?? "Asia/Tokyo", parts[0].from, parts.at(-1)!.to, note]);
  const ids: number[] = [];
  for (const part of parts) {
    const timezone = part.timezone ?? "Asia/Tokyo";
    const date = businessDateAt(new Date(part.from.replace(" ", "T") + "Z"), timezone);
    ids.push(await insert("INSERT INTO timer_segments (user_id,timer_session_id,task_id,status,started_at,ended_at,business_date,record_timezone,project_attribution_status,category_id_at_occurrence,category_attribution_status,task_title_snapshot,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,'Historical contribution',1,NOW(),NOW())", [userId, sessionId, taskId, part.status ?? 1, part.from, part.status === 0 ? null : part.to, date, timezone, part.categoryId, part.attribution ?? (part.categoryId === null ? 1 : 2)]));
  }
  return { sessionId, ids };
}
async function completion(taskId: number, categoryId: number | null, date: string, lifecycle = 1, userId = 1) {
  await insert("INSERT INTO task_completion_events (user_id,task_id,category_id_at_occurrence,occurred_at,record_timezone,business_date,lifecycle_version,operation_id,source,created_at) VALUES (?,?,?,?,'Asia/Tokyo',?,?,?,1,NOW())", [userId, taskId, categoryId, date + " 01:00:00", date, lifecycle, randomUUID()]);
}
function contribution(result: Overview, id: number | null) { return result.categoryBreakdown.find((row) => row.categoryRef === (id === null ? "unassigned" : `category:${id}`))!; }
function reconcile(result: Overview) {
  const sum = (rows: { actualSeconds: number; completionEventCount: number; closedSegmentCount: number }[], field: "actualSeconds" | "completionEventCount" | "closedSegmentCount") => rows.reduce((total, row) => total + row[field], 0);
  for (const field of ["actualSeconds", "completionEventCount", "closedSegmentCount"] as const) {
    assert.equal(sum(result.categoryBreakdown, field), result.summary[field]);
    assert.equal(sum(result.dimensions, field) + result.unmapped[field], result.summary[field]);
    for (const dimension of result.dimensions) assert.equal(sum(result.categoryBreakdown.filter((row) => row.resolvedDimensionKey === dimension.dimensionKey), field), dimension[field]);
  }
  assert.equal(sum(result.trend, "actualSeconds"), result.summary.actualSeconds);
  assert.equal(sum(result.trend, "completionEventCount"), result.summary.completionEventCount);
  for (const row of result.categoryBreakdown) {
    assert.equal(sum(row.trend, "actualSeconds"), row.actualSeconds);
    assert.equal(sum(row.trend, "completionEventCount"), row.completionEventCount);
    assert.equal(row.actualMinutes, Math.floor(row.actualSeconds / 60));
  }
  for (const [index, bucket] of result.trend.entries()) for (const field of ["actualSeconds", "completionEventCount", "closedSegmentCount"] as const) assert.equal(sum(result.categoryBreakdown.map((row) => row.trend[index]), field), bucket[field]);
  assert.equal(result.summary.completedTaskCount, result.summary.completionEventCount);
  assert.ok(result.dimensions.every((row) => Number.isFinite(row.share)));
}

before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`USE \`${database}\``);
  const directory = resolve(process.cwd(), "../../db/migration");
  const version = (name: string) => { const m = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(m[1]), Number(m[2] ?? 0)]; };
  const files = (await readdir(directory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1] || a.localeCompare(b));
  for (const file of files) await admin.query(await readFile(resolve(directory, file), "utf8"));
  const url = new URL(sourceUrl); url.pathname = `/${database}`;
  process.env.NODE_ENV = "test"; process.env.DATABASE_URL = url.toString(); process.env.JWT_SECRET = "growth-g1-tests-only-secret";
  [{ pool }, { app }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js")]);
  const { signToken } = await import("../src/auth.js");
  tokens = ["", signToken({ id: 1, username: "growth", displayName: "Growth" }), signToken({ id: 2, username: "foreign", displayName: "Foreign" })];
});
beforeEach(async () => {
  await pool.query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of ["task_daily_assignments", "task_completion_events", "schedules", "timer_segments", "timer_sessions", "tasks", "reward_events", "user_growth", "habit_occurrences", "growth_dimensions", "task_categories", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("SET FOREIGN_KEY_CHECKS=1");
  await pool.query("UPDATE users SET timezone='Asia/Tokyo',deleted_at=NULL WHERE id=1");
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (2,'growth-foreign','Foreign','Asia/Tokyo',NOW(),NOW()) ON DUPLICATE KEY UPDATE timezone='Asia/Tokyo'");
  await pool.query("UPDATE user_execution_slots SET active_session_id=NULL");
  await pool.query("INSERT INTO user_execution_slots (user_id,active_session_id,version,updated_at) VALUES (2,NULL,1,NOW()) ON DUPLICATE KEY UPDATE active_session_id=NULL");
  for (const userId of [1, 2]) await pool.query("INSERT INTO growth_dimensions (user_id,dimension_key,name,color,sort_order,enabled,version,created_at,updated_at) VALUES (?,'career','事业','#5B8DEF',10,1,1,NOW(),NOW()),(?,'learning','学习','#B28DFF',20,1,1,NOW(),NOW())", [userId, userId]);
});
after(async () => { await pool?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); } });

test("one and multiple mapped Categories retain exact seconds before minute rounding", async () => {
  const a = await category("A"), b = await category("B"), t = await task(a);
  await execution(t, [{ from: "2026-10-06 01:00:00", to: "2026-10-06 01:00:59", categoryId: a }, { from: "2026-10-06 02:00:00", to: "2026-10-06 02:00:59", categoryId: b }]);
  await completion(t, a, "2026-10-06");
  await pool.query("UPDATE tasks SET category_id=? WHERE id=?", [b, t]);
  const result = await overview(); reconcile(result);
  assert.equal(contribution(result, a).actualSeconds, 59); assert.equal(contribution(result, b).actualSeconds, 59);
  assert.equal(contribution(result, a).actualMinutes, 0); assert.equal(result.summary.actualMinutes, 1);
  assert.equal(result.summary.closedSegmentCount, 2); assert.equal(contribution(result, a).completionEventCount, 1);
  assert.equal(result.dimensions.find((row) => row.dimensionKey === "career")!.actualSeconds, 118);
});

test("unmapped, disabled, unavailable, unassigned and unknown identities remain explicit", async () => {
  const a = await category("unmapped", null), disabled = await category("disabled"), t = await task(a);
  await pool.query("UPDATE task_categories SET enabled=0 WHERE id=?", [disabled]);
  for (const [id, attribution] of [[a, 2], [disabled, 2], [null, 1], [null, 0], [999999, 2]] as const) await execution(t, [{ from: "2026-10-06 01:00:00", to: "2026-10-06 01:01:00", categoryId: id, attribution }]);
  await completion(t, null, "2026-10-06");
  const result = await overview(); reconcile(result);
  assert.equal(contribution(result, a).unmappedReason, "NO_MAPPING");
  assert.equal(contribution(result, disabled).enabled, 0); assert.equal(contribution(result, disabled).resolvedDimensionKey, "career");
  assert.equal(contribution(result, null).actualSeconds, 60); assert.equal(contribution(result, null).completionEventCount, 1);
  assert.equal(result.categoryBreakdown.find((row) => row.categoryRef === "unknown")!.unmappedReason, "UNKNOWN_ATTRIBUTION");
  assert.equal(contribution(result, 999999).availability, "UNAVAILABLE"); assert.equal(contribution(result, 999999).name, null);
  assert.equal(result.summary.actualSeconds, 300);
});

test("custom rename and current mapping changes reclassify history without rewriting occurrences", async () => {
  const custom = await api<{ id: number; dimensionKey: string }>("/growth/dimensions", "POST", { name: "陶艺", color: "#8B5CF6", sortOrder: 35 });
  const a = await category("mapped", custom.dimensionKey), t = await task(a);
  await execution(t, [{ from: "2026-10-06 01:00:00", to: "2026-10-06 01:10:00", categoryId: a }]); await completion(t, a, "2026-10-06");
  await api(`/growth/dimensions/${custom.id}`, "PUT", { expectedVersion: 1, name: "陶艺进阶" });
  let result = await overview(); reconcile(result); assert.equal(result.dimensions.find((row) => row.dimensionKey === custom.dimensionKey)!.name, "陶艺进阶");
  await api(`/growth/category-mappings/${a}`, "PUT", { dimensionKey: "learning" });
  result = await overview(); reconcile(result); assert.equal(contribution(result, a).resolvedDimensionKey, "learning");
  assert.equal(result.dimensions.find((row) => row.dimensionKey === custom.dimensionKey)!.actualSeconds, 0);
  const [events] = await pool.query("SELECT category_id_at_occurrence FROM task_completion_events"); assert.deepEqual(events, [{ category_id_at_occurrence: a }]);
  const [segments] = await pool.query("SELECT category_id_at_occurrence FROM timer_segments"); assert.deepEqual(segments, [{ category_id_at_occurrence: a }]);
  await api(`/growth/dimensions/${custom.id}`, "PUT", { expectedVersion: 2, enabled: false });
  // Legacy stale mappings are read safely even when configuration is no longer available.
  await pool.query("UPDATE task_categories SET dimension_key=? WHERE id=?", [custom.dimensionKey, a]);
  result = await overview(); reconcile(result); assert.equal(contribution(result, a).unmappedReason, "DIMENSION_DISABLED");
  await pool.query("UPDATE task_categories SET dimension_key='missing_key' WHERE id=?", [a]);
  assert.equal(contribution(await overview(), a).unmappedReason, "DIMENSION_UNAVAILABLE");
});

test("completion events survive reopen, differ from DONE Task count and do not imply duration or XP", async () => {
  const a = await category("complete"), t = await task(a);
  await api(`/tasks/${t}/complete`, "PUT", { operationId: randomUUID(), expectedVersion: 1, completionNote: "Task reflection" });
  await api(`/tasks/${t}/reopen`, "PUT", { operationId: randomUUID(), expectedVersion: 2 });
  await api(`/tasks/${t}/complete`, "PUT", { operationId: randomUUID(), expectedVersion: 3 });
  await api(`/tasks/${t}/reopen`, "PUT", { operationId: randomUUID(), expectedVersion: 4 });
  const now = businessDateAt(new Date(), "Asia/Tokyo"), result = await overview(7, now); reconcile(result);
  assert.equal(result.summary.completionEventCount, 2); assert.equal(result.summary.actualSeconds, 0); assert.equal(result.summary.closedSegmentCount, 0);
  const [done] = await pool.query("SELECT COUNT(*) n FROM tasks WHERE status=2"); assert.deepEqual(done, [{ n: 0 }]);
  const rewards = await api<{ growth: Overview["hero"] }>("/rewards"); assert.deepEqual(result.hero, rewards.growth);
  assert.equal(Object.hasOwn(contribution(result, a), "xpTotal"), false);
});

test("one midnight Segment contributes two daily slices but one period Segment and no Note payload", async () => {
  const a = await category("night"), t = await task(a);
  const work = await execution(t, [{ from: "2026-10-06 14:55:00", to: "2026-10-06 15:15:00", categoryId: a }]);
  const result = await overview(); reconcile(result);
  assert.equal(result.summary.actualSeconds, 1200); assert.equal(result.summary.closedSegmentCount, 1);
  assert.deepEqual(result.trend.slice(-2).map((row) => [row.actualSeconds, row.closedSegmentCount]), [[300, 1], [900, 1]]);
  assert.equal(JSON.stringify(result).includes("one canonical session note"), false);
  const [notes] = await pool.query("SELECT id,note FROM timer_sessions WHERE id=?", [work.sessionId]); assert.deepEqual(notes, [{ id: work.sessionId, note: "one canonical session note" }]);
});

test("two Segments exclude pause gaps, count closed paused work and preserve per-Segment categories", async () => {
  const a = await category("A"), b = await category("B"), t = await task(a);
  const work = await execution(t, [{ from: "2026-10-06 14:55:00", to: "2026-10-06 15:05:00", categoryId: a }, { from: "2026-10-06 15:10:00", to: "2026-10-06 15:20:00", categoryId: b }]);
  await pool.query("UPDATE timer_sessions SET status=1,end_time=NULL WHERE id=?", [work.sessionId]);
  const result = await overview(); reconcile(result); assert.equal(result.summary.actualSeconds, 1200); assert.equal(result.summary.closedSegmentCount, 2);
  assert.equal(contribution(result, a).actualSeconds, 600); assert.equal(contribution(result, b).actualSeconds, 600);
  assert.deepEqual(result.trend.slice(-2).map((row) => row.actualSeconds), [300, 900]);
});

test("multiple midnight Segments count source IDs across slices and grouped 7/30/90 trends", async () => {
  const a = await category("multi-night"), t = await task(a);
  await execution(t, [{ from: "2026-10-05 14:55:00", to: "2026-10-05 15:15:00", categoryId: a }, { from: "2026-10-06 14:55:00", to: "2026-10-06 15:15:00", categoryId: a }]);
  for (const days of [7, 30, 90]) { const result = await overview(days); reconcile(result); assert.equal(result.summary.actualSeconds, 2400); assert.equal(result.summary.closedSegmentCount, 2); }
  assert.equal((await overview()).trend.reduce((sum, row) => sum + row.closedSegmentCount, 0), 4);
});

test("period clips both boundary intervals and excludes ineligible days without rounding slices", async () => {
  const a = await category("clipped"), t = await task(a);
  await execution(t, [{ from: "2026-09-30 14:55:00", to: "2026-09-30 15:15:00", categoryId: a }, { from: "2026-10-07 14:55:00", to: "2026-10-07 15:15:00", categoryId: a }, { from: "2026-10-08 01:00:00", to: "2026-10-08 02:00:00", categoryId: a }]);
  await completion(t, a, "2026-09-30"); await completion(t, a, "2026-10-01", 2); await completion(t, a, "2026-10-08", 3);
  const result = await overview(); reconcile(result); assert.equal(result.summary.actualSeconds, 1200); assert.equal(result.summary.closedSegmentCount, 2); assert.equal(result.summary.completionEventCount, 1);
  assert.equal(result.trend[0].actualSeconds, 900); assert.equal(result.trend.at(-1)!.actualSeconds, 300);
});

test("timezone change reconciles totals/trend without moving source dates, timestamps or completion dates", async () => {
  const a = await category("timezone"), t = await task(a);
  await execution(t, [{ from: "2026-10-06 14:55:00", to: "2026-10-06 15:15:00", categoryId: a }]); await completion(t, a, "2026-10-07");
  const snapshot = async () => (await pool.query("SELECT started_at,ended_at,business_date,record_timezone,category_id_at_occurrence FROM timer_segments"))[0];
  const before = await snapshot(); assert.equal((await overview(7, "2026-10-06")).summary.actualSeconds, 300);
  await pool.query("UPDATE users SET timezone='UTC' WHERE id=1");
  const result = await overview(7, "2026-10-06"); reconcile(result); assert.equal(result.summary.actualSeconds, 1200); assert.equal(result.trend.at(-1)!.actualSeconds, 1200);
  assert.equal(result.summary.completionEventCount, 0); assert.deepEqual(await snapshot(), before);
  const [events] = await pool.query("SELECT DATE_FORMAT(business_date,'%Y-%m-%d') date FROM task_completion_events"); assert.deepEqual(events, [{ date: "2026-10-07" }]);
});

test("DST reporting day includes 25 real hours from UTC-recorded source slices", async () => {
  const a = await category("DST"), t = await task(a);
  await pool.query("UPDATE users SET timezone='America/New_York' WHERE id=1");
  await execution(t, [{ from: "2026-11-01 04:00:00", to: "2026-11-02 05:00:00", categoryId: a, timezone: "UTC" }]);
  const result = await overview(7, "2026-11-01"); reconcile(result); assert.equal(result.summary.actualSeconds, 90000); assert.equal(result.summary.closedSegmentCount, 1); assert.equal(result.trend.at(-1)!.actualSeconds, 90000);
});

test("canonical inclusion excludes projections/OPEN/VOIDED/deleted; manual/legacy are duration only", async () => {
  const a = await category("eligible"), t = await task(a);
  const work = await execution(t, [1, 0, 2, 1].map((status) => ({ from: "2026-10-06 01:00:00", to: "2026-10-06 01:01:00", categoryId: a, status })));
  await pool.query("UPDATE timer_segments SET deleted_at=NOW() WHERE id=?", [work.ids[3]]);
  for (const [kind, include] of [[1, 1], [2, 1], [3, 0], [1, 0]]) await pool.query("INSERT INTO schedules (user_id,task_id,category_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,timer_session_id,timer_segment_id,slice_date,project_attribution_status,category_id_at_occurrence,category_attribution_status,version,created_at,updated_at) VALUES (1,?,?,'2026-10-06','Asia/Tokyo','10:00:00','10:01:00','2026-10-06 01:00:00','2026-10-06 01:01:00','Actual',1,1,1,?,?,?,?,?,?,1,?,2,1,NOW(),NOW())", [t, a, kind === 3 ? 1 : 0, kind, include, kind === 3 ? work.sessionId : null, kind === 3 ? work.ids[0] : null, kind === 3 ? "2026-10-06" : null, a]);
  const result = await overview(); reconcile(result); assert.equal(result.summary.actualSeconds, 180); assert.equal(result.summary.closedSegmentCount, 1);
});

test("user isolation hides foreign metadata/events/time and missing category retains historical identity", async () => {
  const a = await category("same name"), b = await category("same name", "career", 2), t = await task(a), foreign = await task(b, 2);
  await execution(t, [{ from: "2026-10-06 01:00:00", to: "2026-10-06 01:01:00", categoryId: a }]);
  await execution(foreign, [{ from: "2026-10-06 01:00:00", to: "2026-10-06 02:00:00", categoryId: b }], 2);
  await completion(foreign, b, "2026-10-06", 1, 2);
  const result = await overview(); reconcile(result); assert.equal(result.summary.actualSeconds, 60); assert.equal(result.summary.completionEventCount, 0); assert.equal(result.categoryBreakdown.some((row) => row.categoryId === b), false);
  const other = await overview(7, "2026-10-07", 2); reconcile(other); assert.equal(other.summary.actualSeconds, 3600); assert.equal(other.summary.completionEventCount, 1);
  await pool.query("UPDATE task_categories SET deleted_at=NOW() WHERE id=?", [a]);
  const missing = contribution(await overview(), a); assert.equal(missing.categoryId, a); assert.equal(missing.availability, "UNAVAILABLE"); assert.equal(missing.actualSeconds, 60);
});
