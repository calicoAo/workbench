import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "r2a-tests-only-secret";

const [{ pool }, { app }, auth] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
let counter = 0;
const op = () => `70000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const headersFor = (id: number) => ({ Authorization: `Bearer ${auth.signToken({ id, username: `user-${id}`, displayName: `User ${id}` })}`, "Content-Type": "application/json" });
async function api<T>(path: string, init: RequestInit = {}, userId = 1) { const response = await app.request(`/api${path}`, { ...init, headers: { ...headersFor(userId), ...(init.headers ?? {}) } }); const json = await response.json() as { data: T; message: string }; return { response, data: json.data, message: json.message }; }
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Record<string, unknown>[])[0])[0]); }
async function createProject(name = "导游考试", userId = 1) { return api<{ id: number; version: number; status: number }>("/projects", { method: "POST", body: JSON.stringify({ name, description: `${name} description`, priority: 3, startDate: "2026-09-01", targetDate: "2026-12-31", notes: `${name} notes` }) }, userId); }
async function createTask(projectId: number | null, title = "第三章练习", userId = 1) { return api<{ id: number; version: number }>("/tasks", { method: "POST", body: JSON.stringify({ operationId: op(), title, projectId, priority: 2, difficulty: 2, recordTimezone: "Asia/Shanghai" }) }, userId); }

beforeEach(async () => {
  for (const table of ["quick_note_task_links", "task_daily_assignments", "task_completion_events", "schedules", "timer_segments", "timer_sessions", "tasks", "projects", "reward_events", "user_growth", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("UPDATE user_execution_slots SET active_session_id=NULL");
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (931,'r2a-isolation','R2A Isolation','Asia/Shanghai',NOW(),NOW()) ON DUPLICATE KEY UPDATE deleted_at=NULL, timezone='Asia/Shanghai'");
  await pool.query("INSERT INTO user_execution_slots (user_id,active_session_id,version,updated_at) VALUES (931,NULL,1,NOW()) ON DUPLICATE KEY UPDATE active_session_id=NULL, version=version+1");
});

after(async () => { await pool.end(); });

test("create, update, optimistic conflict, archive and restore preserve lifecycle", async () => {
  const created = await createProject();
  assert.equal(created.response.status, 200); assert.equal(created.data.status, 0);
  const updated = await api<{ version: number }>(`/projects/${created.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, description: "新版说明" }) });
  assert.equal(updated.data.version, 2);
  const conflict = await api(`/projects/${created.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, name: "过期写入" }) });
  assert.equal(conflict.response.status, 409);
  const archived = await api<{ version: number }>(`/projects/${created.data.id}/archive`, { method: "PUT", body: JSON.stringify({ expectedVersion: 2 }) });
  assert.equal(archived.data.version, 3);
  const restored = await api<{ version: number }>(`/projects/${created.data.id}/restore`, { method: "PUT", body: JSON.stringify({ expectedVersion: 3 }) });
  assert.equal(restored.data.version, 4); assert.equal(await scalar("SELECT archived_at IS NULL FROM projects WHERE id=?", [created.data.id]), 1);
});

test("completion with unfinished Tasks requires explicit KEEP and never mutates Tasks", async () => {
  const project = await createProject(); const task = await createTask(project.data.id);
  const blocked = await api(`/projects/${project.data.id}/status`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, status: 3 }) });
  assert.equal(blocked.response.status, 409);
  const completed = await api<{ status: number }>(`/projects/${project.data.id}/status`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, status: 3, unfinishedTaskPolicy: "KEEP" }) });
  assert.equal(completed.data.status, 3);
  assert.equal(await scalar("SELECT status FROM tasks WHERE id=?", [task.data.id]), 0);
});

test("archive preserves Task and occurrence time", async () => {
  const project = await createProject(); const task = await createTask(project.data.id);
  await pool.query("INSERT INTO timer_sessions (user_id,task_id,session_model,record_timezone,start_time,duration_minutes,status,version,created_at,updated_at) VALUES (1,?,1,'Asia/Shanghai',NOW(),60,2,1,NOW(),NOW())", [task.data.id]);
  const sessionId = await scalar("SELECT MAX(id) FROM timer_sessions");
  await pool.query("INSERT INTO timer_segments (user_id,timer_session_id,task_id,status,started_at,ended_at,business_date,record_timezone,project_id_at_occurrence,project_attribution_status,category_attribution_status,task_title_snapshot,version,created_at,updated_at) VALUES (1,?,?,1,'2026-09-10 00:00:00','2026-09-10 01:00:00','2026-09-10','Asia/Shanghai',?,2,1,'第三章练习',1,NOW(),NOW())", [sessionId, task.data.id, project.data.id]);
  await api(`/projects/${project.data.id}/archive`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1 }) });
  assert.equal(await scalar("SELECT COUNT(*) FROM tasks WHERE id=?", [task.data.id]), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_segments WHERE project_id_at_occurrence=?", [project.data.id]), 1);
});

test("Task project change is blocked while running, allowed paused, and resume freezes new Project", async () => {
  const x = await createProject("Project X"), y = await createProject("Project Y"); const task = await createTask(x.data.id);
  const started = await api<{ sessionId: number; segmentId: number; version: number; taskVersion: number }>("/timer-sessions/accept-and-start", { method: "POST", body: JSON.stringify({ operationId: op(), taskId: task.data.id, expectedTaskVersion: 1, taskDate: "2026-09-21", recordTimezone: "Asia/Shanghai" }) });
  const blocked = await api(`/tasks/${task.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: started.data.taskVersion, projectId: y.data.id }) });
  assert.equal(blocked.response.status, 409);
  const paused = await api<{ version: number }>(`/timer-sessions/${started.data.sessionId}/pause`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) });
  const moved = await api<{ version: number }>(`/tasks/${task.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: started.data.taskVersion, projectId: y.data.id }) });
  assert.equal(moved.response.status, 200);
  const resumed = await api<{ segmentId: number; version: number }>(`/timer-sessions/${started.data.sessionId}/resume`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: paused.data.version }) });
  const [rows] = await pool.query("SELECT id,project_id_at_occurrence FROM timer_segments WHERE timer_session_id=? ORDER BY id", [started.data.sessionId]);
  assert.deepEqual((rows as Array<{ id: number; project_id_at_occurrence: number }>).map((row) => Number(row.project_id_at_occurrence)), [x.data.id, y.data.id]);
  await api(`/timer-sessions/${started.data.sessionId}/finish`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: resumed.data.version, completeTask: false }) });
});

test("X 10h then Y 1h remains occurrence-attributed and timer projections are not double counted", async () => {
  const x = await createProject("Project X"), y = await createProject("Project Y"); const task = await createTask(x.data.id);
  await pool.query("INSERT INTO timer_sessions (user_id,task_id,session_model,record_timezone,start_time,duration_minutes,status,version,created_at,updated_at) VALUES (1,?,1,'Asia/Shanghai','2026-09-10 00:00:00',660,2,1,NOW(),NOW())", [task.data.id]);
  const sessionId = await scalar("SELECT MAX(id) FROM timer_sessions");
  await pool.query("INSERT INTO timer_segments (user_id,timer_session_id,task_id,status,started_at,ended_at,business_date,record_timezone,project_id_at_occurrence,project_attribution_status,category_attribution_status,task_title_snapshot,version,created_at,updated_at) VALUES (1,?,?,1,'2026-09-10 00:00:00','2026-09-10 10:00:00','2026-09-10','Asia/Shanghai',?,2,1,'Attribution task',1,NOW(),NOW()),(1,?,?,1,'2026-09-11 00:00:00','2026-09-11 01:00:00','2026-09-11','Asia/Shanghai',?,2,1,'Attribution task',1,NOW(),NOW())", [sessionId, task.data.id, x.data.id, sessionId, task.data.id, y.data.id]);
  const [segments] = await pool.query("SELECT id,project_id_at_occurrence,started_at,ended_at,business_date FROM timer_segments WHERE timer_session_id=? ORDER BY id", [sessionId]);
  for (const segment of segments as Array<{ id: number; project_id_at_occurrence: number; started_at: Date; ended_at: Date; business_date: Date | string }>) { const day = segment.business_date instanceof Date ? segment.business_date.toISOString().slice(0, 10) : segment.business_date.slice(0, 10); await pool.query("INSERT INTO schedules (user_id,task_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,source_id,actual_time_class,include_in_actual_time,timer_session_id,timer_segment_id,slice_date,project_id_at_occurrence,project_attribution_status,category_attribution_status,version,created_at,updated_at) VALUES (1,?,?,?,?,?,?,?,'Projection',1,1,1,1,?,3,0,?,?,?,?,2,1,1,NOW(),NOW())", [task.data.id, day, "Asia/Shanghai", "00:00:00", segment.project_id_at_occurrence === x.data.id ? "10:00:00" : "01:00:00", segment.started_at, segment.ended_at, `segment:${segment.id}`, sessionId, segment.id, day, segment.project_id_at_occurrence]); }
  await pool.query("UPDATE tasks SET project_id=? WHERE id=?", [y.data.id, task.data.id]);
  const xDetail = await api<{ project: { actualSeconds: number } }>(`/projects/${x.data.id}`), yDetail = await api<{ project: { actualSeconds: number } }>(`/projects/${y.data.id}`);
  assert.equal(xDetail.data.project.actualSeconds, 36000); assert.equal(yDetail.data.project.actualSeconds, 3600);
});

test("Manual Actual keeps explicit historical Project after Task moves", async () => {
  const x = await createProject("Project X"), y = await createProject("Project Y"); const task = await createTask(x.data.id);
  const actual = await api<{ id: number }>("/schedules", { method: "POST", body: JSON.stringify({ operationId: op(), scheduleDate: "2026-09-15", startTime: "09:00", endTime: "11:00", recordTimezone: "Asia/Shanghai", kind: 1, taskId: task.data.id, projectIdAtOccurrence: x.data.id, title: "复习", includeInActualTime: true }) });
  assert.equal(actual.response.status, 200);
  await api(`/tasks/${task.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, projectId: y.data.id }) });
  assert.equal(await scalar("SELECT project_id_at_occurrence FROM schedules WHERE id=?", [actual.data.id]), x.data.id);
  const xDetail = await api<{ project: { actualSeconds: number } }>(`/projects/${x.data.id}`), yDetail = await api<{ project: { actualSeconds: number } }>(`/projects/${y.data.id}`);
  assert.equal(xDetail.data.project.actualSeconds, 7200); assert.equal(yDetail.data.project.actualSeconds, 0);
});

test("progress averages unarchived Tasks, DONE is 100, and empty Project is null", async () => {
  const project = await createProject(); const empty = await createProject("Empty");
  await pool.query("INSERT INTO tasks (user_id,project_id,title,priority,difficulty,status,pinned,progress_percent,version,sort_order,completion_sequence,created_at,updated_at) VALUES (1,?,'Twenty',2,2,0,0,20,1,1,0,NOW(),NOW()),(1,?,'Done',2,2,2,0,12,1,2,1,NOW(),NOW()),(1,?,'Archived',2,2,3,0,90,1,3,0,NOW(),NOW())", [project.data.id, project.data.id, project.data.id]);
  const list = await api<Array<{ id: number; taskCount: number; progressPercent: number | null }>>("/projects");
  const found = list.data.find((item) => item.id === project.data.id), noTasks = list.data.find((item) => item.id === empty.data.id);
  assert.deepEqual({ count: found?.taskCount, progress: found?.progressPercent }, { count: 2, progress: 60 });
  assert.equal(noTasks?.progressPercent, null); assert.equal(noTasks?.taskCount, 0);
});

test("search and export include Projects while user isolation holds", async () => {
  const own = await createProject("Needle Project"); await createProject("Private Needle", 931);
  const search = await api<{ items: Array<{ type: string; id: number; deepLink: string }> }>("/search?q=Needle&type=project");
  assert.deepEqual(search.data.items.map((item) => item.id), [own.data.id]); assert.equal(search.data.items[0].deepLink, `/projects/${own.data.id}`);
  const exported = await api<{ recordCount: number; content: string }>("/exports/projects?format=json&includeTrash=false");
  assert.equal(exported.data.recordCount, 1); assert.match(exported.data.content, /Needle Project/); assert.doesNotMatch(exported.data.content, /Private Needle/);
  const isolatedDetail = await api(`/projects/${own.data.id}`, {}, 931); assert.equal(isolatedDetail.response.status, 404);
});
