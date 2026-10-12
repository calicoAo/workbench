import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.endsWith("_test")) throw new Error("Require an isolated TEST_DATABASE_URL ending in _test");
const source = new URL(sourceUrl), database = `workbench_growth_g4_${process.pid}_test`;
let admin: Connection, pool: Pool, app: typeof import("../src/app.js").app;
let token: string, foreignToken: string;
type Category = { id: number; name: string; color: string; dimensionKey: string | null; targetMinutes: number };
async function api<T>(path: string, method = "GET", body?: unknown, status = 200, auth = token): Promise<T> {
  const response = await app.request(`/api${path}`, { method, headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = await response.json() as { data: T; message: string };
  assert.equal(response.status, status, json.message); return json.data;
}
before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await admin.query(`USE \`${database}\``);
  const directory = resolve(process.cwd(), "../../db/migration");
  const version = (name: string) => { const m = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(m[1]), Number(m[2] ?? 0)]; };
  const migrations = (await readdir(directory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1] || a.localeCompare(b));
  for (const migration of migrations) await admin.query(await readFile(resolve(directory, migration), "utf8"));
  const appUrl = new URL(sourceUrl); appUrl.pathname = `/${database}`;
  process.env.NODE_ENV = "test"; process.env.DATABASE_URL = appUrl.toString(); process.env.JWT_SECRET = "bounty-category-tests-only-secret";
  [{ pool }, { app }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js")]);
  const { signToken } = await import("../src/auth.js"); token = signToken({ id: 1, username: "bounty", displayName: "Bounty" });
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (991,'bounty-foreign','Foreign','Asia/Shanghai',NOW(),NOW())");
  foreignToken = signToken({ id: 991, username: "bounty-foreign", displayName: "Foreign" });
});
after(async () => { await pool?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); } });

test('canonical partial Category mapping reinterprets public execution history without changing facts or metadata', async () => {
  const config = await api<any>('/growth/dimensions');
  const x = config.dimensions.find((d: any) => d.dimensionKey === 'career');
  const y = await api<any>('/growth/dimensions','POST',{name:'Custom craftsmanship',color:'#78D9D0',sortOrder:71});
  await api(`/growth/dimensions/${y.id}`,'PUT',{expectedVersion:y.version,name:'Craftsmanship renamed'});
  const category = await api<any>('/task-categories','POST',{name:'Source identity A',color:'#123ABC',icon:'original-icon',targetMinutes:12345,dimensionKey:x.dimensionKey});
  const initial = await api<any>('/growth/overview');
  const task = await api<any>('/tasks','POST',{operationId:randomUUID(),title:'Canonical historical Task',categoryId:category.id,acceptDate:initial.period.to,recordTimezone:initial.period.timezone});
  let taskData = (await api<any>(`/tasks/${task.id}`)).task;
  const session = await api<any>('/timer-sessions/start','POST',{operationId:randomUUID(),taskId:task.id,expectedTaskVersion:taskData.version,taskDate:initial.period.to,recordTimezone:initial.period.timezone});
  let current = await api<any>('/timer-sessions/current');
  await new Promise(resolve => setTimeout(resolve,1100));
  await api(`/timer-sessions/${session.sessionId}/pause`,'PUT',{operationId:randomUUID(),expectedVersion:current.version});
  current=await api<any>('/timer-sessions/current');
  await api(`/timer-sessions/${session.sessionId}/resume`,'PUT',{operationId:randomUUID(),expectedVersion:current.version});
  current=await api<any>('/timer-sessions/current');
  await new Promise(resolve => setTimeout(resolve,1100));
  taskData=(await api<any>(`/tasks/${task.id}`)).task;
  await api(`/timer-sessions/${session.sessionId}/finish`,'PUT',{operationId:randomUUID(),expectedVersion:current.version,completeTask:true,expectedTaskVersion:taskData.version,note:'One Session-owned note',completionNote:'Separate Task reflection'});
  await api(`/task-categories/${category.id}`,'PUT',{enabled:false});
  const read = () => api<any>('/growth/overview');
  const detail = () => api<any>(`/growth/categories/category:${category.id}?period=30&to=${initial.period.to}&taskRef=task:${task.id}`);
  const before=await read(), detailBefore=await detail();
  const snapshot = async () => {
    const result: Record<string,unknown> = {};
    for(const table of ['tasks','timer_sessions','timer_segments','schedules','task_completion_events','task_daily_assignments','reward_events','user_growth']) {
      result[table]=(await pool.query(`SELECT * FROM ${table} WHERE user_id=1 ORDER BY ${table === 'user_growth' ? 'user_id' : 'id'}`))[0];
    }
    return result;
  };
  const factsBefore=await snapshot();
  const metadata = () => pool.query('SELECT id,user_id,name,color,icon,target_minutes,sort_order,enabled FROM task_categories WHERE id=?',[category.id]).then(([rows])=>rows);
  const metadataBefore=await metadata();
  assert.equal(detailBefore.category.actualSeconds>0,true);assert.equal(detailBefore.category.closedSegmentCount,2);
  assert.equal(detailBefore.sessions.length,1);assert.equal(detailBefore.completions.length,1);
  await api(`/task-categories/${category.id}`,'PUT',{dimensionKey:y.dimensionKey});
  const after=await read(), detailAfter=await detail();
  const dim=(data:any,key:string)=>data.dimensions.find((d:any)=>d.dimensionKey===key);
  for(const field of ['actualSeconds','completionEventCount','closedSegmentCount']) {
    assert.equal(dim(after,x.dimensionKey)[field],dim(before,x.dimensionKey)[field]-detailBefore.category[field]);
    assert.equal(dim(after,y.dimensionKey)[field],dim(before,y.dimensionKey)[field]+detailBefore.category[field]);
    assert.equal(after.summary[field],before.summary[field]);
    assert.equal(detailAfter.category[field],detailBefore.category[field]);
  }
  assert.equal(detailAfter.dimension.name,'Craftsmanship renamed');assert.equal(detailAfter.dimension.dimensionKey,y.dimensionKey);
  assert.deepEqual(detailAfter.executions,detailBefore.executions);assert.deepEqual(detailAfter.sessions,detailBefore.sessions);assert.deepEqual(detailAfter.completions,detailBefore.completions);assert.deepEqual(detailAfter.task,detailBefore.task);
  assert.deepEqual(await snapshot(),factsBefore);assert.deepEqual(await metadata(),metadataBefore);assert.deepEqual(after.hero,before.hero);
  const saved=(await api<any[]>('/task-categories?includeDisabled=true')).find(row=>row.id===category.id);
  assert.equal(saved.dimensionKey,y.dimensionKey);assert.equal(saved.targetMinutes,12345);assert.equal(saved.icon,'original-icon');assert.equal(saved.enabled,0);
  const totals=after.dimensions.reduce((sum:number,d:any)=>sum+d.actualSeconds,after.unmapped.actualSeconds);assert.equal(totals,after.summary.actualSeconds);

  await api('/growth/dimensions','GET',undefined,200,foreignToken);
  const foreign=await api<any>('/growth/dimensions','POST',{name:'Foreign only',color:'#123456',sortOrder:72},200,foreignToken);
  await api(`/task-categories/${category.id}`,'PUT',{dimensionKey:foreign.dimensionKey},400);
  await api(`/task-categories/${category.id}`,'PUT',{dimensionKey:foreign.dimensionKey},404,foreignToken);
  assert.equal((await detail()).category.dimensionKey,y.dimensionKey);
  const linked=await api<any>('/task-categories','POST',{name:'Second dependent Category',dimensionKey:y.dimensionKey});
  // A failed optimistic version check must leave both dependent mappings intact.
  await api(`/growth/dimensions/${y.id}`,'PUT',{expectedVersion:1,enabled:false},409);
  assert.equal((await detail()).category.dimensionKey,y.dimensionKey);
  await api(`/growth/dimensions/${y.id}`,'PUT',{expectedVersion:2,enabled:false});
  const definitions=await api<any[]>('/task-categories?includeDisabled=true');
  assert.equal(definitions.find(c=>c.id===category.id).dimensionKey,null);assert.equal(definitions.find(c=>c.id===linked.id).dimensionKey,null);
  await api(`/task-categories/${category.id}`,'PUT',{dimensionKey:y.dimensionKey},400);
  const unmapped=await read();assert.equal(unmapped.categoryBreakdown.find((c:any)=>c.categoryId===category.id).resolvedDimensionKey,null);
  assert.deepEqual(await snapshot(),factsBefore);assert.deepEqual(await metadata(),metadataBefore);
  assert.deepEqual((await api<any>('/growth/overview','GET',undefined,200,foreignToken)).categoryBreakdown.filter((c:any)=>c.categoryId===category.id),[]);
  // Preserve the existing mapping endpoint as a compatibility contract.
  await api(`/growth/category-mappings/${category.id}`,'PUT',{dimensionKey:'career'});
  await api(`/task-categories/${category.id}`,'PUT',{dimensionKey:null});
  assert.deepEqual(await snapshot(),factsBefore);
});
