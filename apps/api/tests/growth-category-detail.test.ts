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
const source = new URL(sourceUrl), database = `workbench_growth_g2_${process.pid}_test`;
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

type Detail = Awaited<ReturnType<typeof import("../src/growth-category-detail.js").growthCategoryDetail>>;
async function detail(id: number | string, options: { to?: string; days?: number; taskRef?: string; cursor?: string; limit?: number; userId?: number } = {}) {
  const params = new URLSearchParams({ period: String(options.days ?? 7), to: options.to ?? "2026-10-07" });
  for (const key of ["taskRef", "cursor", "limit"] as const) if (options[key] !== undefined) params.set(key, String(options[key]));
  return api<Detail>(`/growth/categories/${typeof id === "number" ? `category:${id}` : id}?${params}`, "GET", undefined, options.userId ?? 1);
}
async function fixture() {
  const a = await category("A"), b = await category("B"), t = await task(a);
  const work = await execution(t, [{ from: "2026-10-06 14:55:00", to: "2026-10-06 15:15:00", categoryId: a }, { from: "2026-10-06 15:30:00", to: "2026-10-06 15:40:00", categoryId: a }]);
  await completion(t, a, "2026-10-07");
  return { a, b, t, work };
}
function sameMetrics(a: { actualSeconds: number; actualMinutes: number; completionEventCount: number; closedSegmentCount: number }, b: typeof a) {
  for (const key of ["actualSeconds", "actualMinutes", "completionEventCount", "closedSegmentCount"] as const) assert.equal(a[key], b[key], key);
}

test("01 two Categories in one Dimension reconcile exactly with G1 and detail", async () => {
 const { a,b,t } = await fixture(); await execution(t,[{from:"2026-10-06 01:00:00",to:"2026-10-06 01:00:59",categoryId:b}]);
 const result=await overview();reconcile(result);for(const id of [a,b])sameMetrics((await detail(id)).category,contribution(result,id));
 assert.equal((await detail(a)).category.actualSeconds+(await detail(b)).category.actualSeconds,result.dimensions[0].actualSeconds);
});
test("02 task aggregates and detail trend reuse the entire G1 fact set",async()=>{const {a}=await fixture();const d=await detail(a);const o=await overview();assert.deepEqual(d.category,contribution(o,a));sameMetrics(d.tasks[0],d.category);});
test("03 unmapped category is independently readable",async()=>{const a=await category("unmapped",null);const t=await task(a);await execution(t,[{from:"2026-10-06 01:00:00",to:"2026-10-06 01:01:00",categoryId:a}]);const d=await detail(a);assert.equal(d.category.unmappedReason,"NO_MAPPING");assert.equal(d.category.actualSeconds,60);assert.equal(d.dimension,null);});
test("04 existing zero-activity Category is a valid empty detail, missing is 404",async()=>{const a=await category("empty");const d=await detail(a);assert.equal(d.category.actualSeconds,0);assert.deepEqual(d.tasks,[]);const response=await app.request('/api/growth/categories/category:999999?period=7&to=2026-10-07',{headers:{Authorization:`Bearer ${tokens[1]}`}});assert.equal(response.status,404);});
test("05 disabled Category keeps historical identity and contributions",async()=>{const {a}=await fixture();await pool.query('UPDATE task_categories SET enabled=0 WHERE id=?',[a]);const d=await detail(a);assert.equal(d.category.enabled,0);assert.equal(d.category.actualSeconds,1800);assert.equal(d.category.resolvedDimensionKey,'career');});
test("06 custom and renamed Dimension metadata is canonical",async()=>{const custom=await api<{id:number;dimensionKey:string}>('/growth/dimensions','POST',{name:'陶艺',color:'#5B8DEF',sortOrder:35});const a=await category('A',custom.dimensionKey);await api(`/growth/dimensions/${custom.id}`,'PUT',{expectedVersion:1,name:'陶艺进阶'});assert.equal((await detail(a)).dimension!.name,'陶艺进阶');});
test("07 current mapping reinterprets history without changing fact Category",async()=>{const {a}=await fixture();const snapshot=async()=>(await pool.query('SELECT category_id_at_occurrence FROM timer_segments ORDER BY id'))[0];const before=await snapshot();await api(`/growth/category-mappings/${a}`,'PUT',{dimensionKey:'learning'});const d=await detail(a);assert.equal(d.dimension!.dimensionKey,'learning');assert.equal(d.category.actualSeconds,1800);assert.deepEqual(await snapshot(),before);sameMetrics(d.category,contribution(await overview(),a));});
test("08 one Task can contribute multiple Sessions",async()=>{const {a,t}=await fixture();await execution(t,[{from:'2026-10-06 01:00:00',to:'2026-10-06 01:05:00',categoryId:a}]);const d=await detail(a,{taskRef:`task:${t}`});assert.equal(d.sessions.length,2);assert.equal(d.executions.length,3);assert.equal(d.task!.actualSeconds,2100);});
test("09 one Session with several CLOSED Segments excludes paused gaps and envelope",async()=>{const {a,t}=await fixture();const d=await detail(a,{taskRef:`task:${t}`});assert.equal(d.sessions.length,1);assert.equal(d.executions.length,2);assert.equal(d.task!.actualSeconds,1800);assert.equal(d.task!.closedSegmentCount,2);assert.notEqual(d.task!.actualSeconds,999*60);});
test("10 midnight slices retain one stable Segment identity",async()=>{const {a,t,work}=await fixture();const d=await detail(a,{taskRef:`task:${t}`});const record=d.executions.find(e=>e.sourceId===work.ids[0])!;assert.equal(record.slices.length,2);assert.equal(record.attributedSeconds,1200);assert.equal(d.task!.closedSegmentCount,2);assert.equal(d.executions.length,2);});
test("11 partial-period seconds never replace full real Segment bounds",async()=>{const {a,t,work}=await fixture();const d=await detail(a,{taskRef:`task:${t}`,to:'2026-10-06'});const r=d.executions.find(e=>e.sourceId===work.ids[0])!;assert.equal(r.attributedSeconds,300);assert.equal(r.fullDurationSeconds,1200);assert.equal(r.startedAt,'2026-10-06T14:55:00.000Z');assert.equal(r.endedAt,'2026-10-06T15:15:00.000Z');sameMetrics(d.category,contribution(await overview(7,'2026-10-06'),a));});
test("12 current Task assignment does not replace historical fact Category",async()=>{const {a,b,t}=await fixture();await execution(t,[{from:'2026-10-06 01:00:00',to:'2026-10-06 01:01:00',categoryId:b}]);await pool.query('UPDATE tasks SET category_id=? WHERE id=?',[b,t]);assert.equal((await detail(a)).tasks[0].actualSeconds,1800);assert.equal((await detail(b)).tasks[0].actualSeconds,60);assert.equal((await detail(a)).tasks[0].taskId,(await detail(b)).tasks[0].taskId);});
test("13 CompletionEvent count differs from current DONE Task count",async()=>{const {a,t}=await fixture();await completion(t,a,'2026-10-07',2);const d=await detail(a,{taskRef:`task:${t}`});assert.equal(d.task!.completionEventCount,2);assert.equal(d.completions.length,2);assert.ok(d.completions.every(e=>e.occurredAt==='2026-10-07T01:00:00.000Z'));assert.deepEqual((await pool.query('SELECT COUNT(*) n FROM tasks WHERE status=2'))[0],[{n:0}]);});
test("14 Session note is returned once per Session and completionNote stays separate",async()=>{const {a,t,work}=await fixture();await pool.query('UPDATE tasks SET completion_note=? WHERE id=?',['Task reflection',t]);const d=await detail(a,{taskRef:`task:${t}`});assert.deepEqual(d.sessions.map(s=>[s.id,s.note]),[[work.sessionId,'one canonical session note']]);assert.equal(d.task!.completionNote,'Task reflection');assert.equal(d.executions.some(e=>Object.hasOwn(e,'note')),false);assert.equal(JSON.stringify(d).split('one canonical session note').length-1,1);});
test("15 exact seconds reconcile for 7/30/90 periods, including sub-minute work",async()=>{const {a,t}=await fixture();await execution(t,[{from:'2026-10-06 01:00:00',to:'2026-10-06 01:00:59',categoryId:a}]);for(const days of [7,30,90]){const d=await detail(a,{days});const o=await overview(days);sameMetrics(d.category,contribution(o,a));assert.equal(d.category.actualSeconds,1859);assert.equal(d.category.trend.reduce((n,b)=>n+b.actualSeconds,0),1859);}});
test("16 user timezone filtering matches G1 and keeps persisted CompletionEvent dates",async()=>{const {a,t}=await fixture();assert.equal((await detail(a,{to:'2026-10-06'})).category.actualSeconds,300);await pool.query("UPDATE users SET timezone='UTC' WHERE id=1");const d=await detail(a,{to:'2026-10-06',taskRef:`task:${t}`});sameMetrics(d.category,contribution(await overview(7,'2026-10-06'),a));assert.equal(d.category.actualSeconds,1800);assert.equal(d.category.completionEventCount,0);assert.equal(d.period.timezone,'UTC');});
test("17 authenticated own Category access succeeds; foreign and anonymous access rejected",async()=>{const a=await category('foreign','career',2);const t=await task(a,2);await execution(t,[{from:'2026-10-06 01:00:00',to:'2026-10-06 01:01:00',categoryId:a}],2);assert.equal((await detail(a,{userId:2})).category.actualSeconds,60);for(const token of [tokens[1],null]){const r=await app.request(`/api/growth/categories/category:${a}`,{headers:token?{Authorization:`Bearer ${token}`}:{}});assert.equal(r.status,token?404:401);}});
test("18 bounded Task and fact pagination traverses stable identities without duplication",async()=>{const a=await category('many');const ids=[];for(let i=0;i<23;i++){const t=await task(a);ids.push(t);await execution(t,[{from:'2026-10-06 01:00:00',to:'2026-10-06 01:01:00',categoryId:a}]);}const found:number[]=[];let cursor:string|undefined;do{const d=await detail(a,{limit:5,cursor});assert.ok(d.tasks.length<=5);found.push(...d.tasks.map(t=>t.taskId!));cursor=d.nextCursor??undefined;}while(cursor);assert.equal(found.length,23);assert.equal(new Set(found).size,23);const t=ids[0];for(let i=0;i<12;i++)await execution(t,[{from:'2026-10-06 02:00:00',to:'2026-10-06 02:01:00',categoryId:a}]);const facts:number[]=[];do{const d=await detail(a,{taskRef:`task:${t}`,limit:4,cursor});assert.ok(d.executions.length<=4);facts.push(...d.executions.map(e=>e.sourceId));cursor=d.nextCursor??undefined;}while(cursor);assert.equal(facts.length,13);assert.equal(new Set(facts).size,13);const first=await detail(a,{limit:5});const bad=await app.request(`/api/growth/categories/category:${a}?period=30&to=2026-10-07&limit=5&cursor=${first.nextCursor}`,{headers:{Authorization:`Bearer ${tokens[1]}`}});assert.equal(bad.status,400);const max=await app.request(`/api/growth/categories/category:${a}?limit=51`,{headers:{Authorization:`Bearer ${tokens[1]}`}});assert.equal(max.status,400);});
test("19 removed Category and Task retain stable historical identity without live edit link",async()=>{const {a,t}=await fixture();await pool.query('UPDATE task_categories SET deleted_at=NOW() WHERE id=?',[a]);await pool.query('UPDATE tasks SET deleted_at=NOW() WHERE id=?',[t]);const d=await detail(a,{taskRef:`task:${t}`});assert.equal(d.category.availability,'UNAVAILABLE');assert.equal(d.category.categoryId,a);assert.equal(d.task!.taskId,t);assert.equal(d.task!.available,false);assert.equal(d.task!.actualSeconds,1800);});
test("20 Growth reads never mutate Task, Segment, Session, Category or Completion facts",async()=>{const {a,t}=await fixture();const snapshot=async()=>Promise.all(['tasks','timer_segments','timer_sessions','task_categories','task_completion_events'].map(async table=>(await pool.query(`SELECT * FROM ${table} ORDER BY id`))[0]));const before=await snapshot();await overview();await detail(a);await detail(a,{taskRef:`task:${t}`});assert.deepEqual(await snapshot(),before);});
test("21 unassigned and unknown buckets expose canonical source identities",async()=>{const {a,t}=await fixture();await execution(t,[{from:'2026-10-06 01:00:00',to:'2026-10-06 01:01:00',categoryId:null,attribution:0}]);await execution(t,[{from:'2026-10-06 02:00:00',to:'2026-10-06 02:01:00',categoryId:null,attribution:1}]);for(const ref of ['unknown','unassigned']){const d=await detail(ref,{taskRef:`task:${t}`});assert.equal(d.task!.actualSeconds,60);sameMetrics(d.category,(await overview()).categoryBreakdown.find(c=>c.categoryRef===ref)!);}assert.equal((await detail(a)).category.actualSeconds,1800);});

test("22 Manual and Legacy Actual detail expose full intervals without Segment counts", async () => {
 const a=await category('actual'),t=await task(a);
 for(const kind of [1,2]) await pool.query("INSERT INTO schedules (user_id,task_id,category_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,project_attribution_status,category_id_at_occurrence,category_attribution_status,version,created_at,updated_at) VALUES (1,?,?,'2026-10-06','Asia/Tokyo','23:55:00','00:15:00','2026-10-06 14:55:00','2026-10-06 15:15:00','Manual history',1,1,1,0,?,1,1,?,2,1,NOW(),NOW())",[t,a,kind,a]);
 const d=await detail(a,{taskRef:`task:${t}`,to:'2026-10-06'});sameMetrics(d.category,contribution(await overview(7,'2026-10-06'),a));assert.equal(d.task!.actualSeconds,600);assert.equal(d.task!.closedSegmentCount,0);assert.deepEqual(d.executions.map(e=>e.source).sort(),['LEGACY_ACTUAL','MANUAL_ACTUAL']);assert.ok(d.executions.every(e=>e.attributedSeconds===300&&e.fullDurationSeconds===1200));assert.deepEqual(d.sessions,[]);
});
test("23 missing retained Task metadata keeps the historical source identity",async()=>{const {a,t}=await fixture();await pool.query('SET FOREIGN_KEY_CHECKS=0');await pool.query('DELETE FROM tasks WHERE id=?',[t]);await pool.query('SET FOREIGN_KEY_CHECKS=1');const d=await detail(a,{taskRef:`task:${t}`});assert.equal(d.task!.taskId,t);assert.equal(d.task!.available,false);assert.equal(d.task!.actualSeconds,1800);assert.equal(d.task!.title,'Historical contribution');});
