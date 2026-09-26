import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "g5b-tests-only-secret";

const [{ pool }, { app }, auth] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
let counter = 0;
const op = () => `60000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const headersFor = (id: number) => ({ Authorization: `Bearer ${auth.signToken({ id, username: `user-${id}`, displayName: `User ${id}` })}`, "Content-Type": "application/json" });
async function api<T>(path: string, init: RequestInit = {}, userId = 1) { const response = await app.request(`/api${path}`, { ...init, headers: { ...headersFor(userId), ...(init.headers ?? {}) } }); const json = await response.json() as { data: T; message: string }; return { response, data: json.data, message: json.message }; }
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Record<string, unknown>[])[0])[0]); }
async function createNote(content = "Private original note", userId = 1) { return api<{ id: number; version: number }>("/quick-notes", { method: "POST", body: JSON.stringify({ operationId: op(), noteDate: "2026-09-20", title: "Source note", content, tag: "private" }) }, userId); }
function conversion(operationId: string, values: Record<string, unknown> = {}) { return { operationId, title: "Confirmed action", description: "Explicit action summary", difficulty: 2, priority: 2, estimatedMinutes: 25, recordTimezone: "Asia/Shanghai", ...values }; }

beforeEach(async () => {
  for (const table of ["quick_note_task_links", "task_daily_assignments", "task_completion_events", "schedules", "timer_segments", "timer_sessions", "tasks", "projects", "quick_notes", "journals", "morning_writings", "reward_events", "user_growth", "mutation_receipts", "user_settings"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("UPDATE users SET display_name = username, timezone = 'Asia/Shanghai' WHERE id IN (1, 930)");
  await pool.query("UPDATE task_categories SET enabled = 1 WHERE user_id = 1");
  await pool.query("INSERT INTO users (id, username, display_name, timezone, created_at, updated_at) VALUES (930, 'g5b-isolation', 'Isolation', 'Asia/Shanghai', NOW(), NOW()) ON DUPLICATE KEY UPDATE deleted_at = NULL");
});

after(async () => { await pool.query("UPDATE task_categories SET enabled = 1 WHERE user_id = 1"); await pool.query("DELETE FROM quick_note_task_links WHERE user_id = 930"); await pool.query("DELETE FROM quick_notes WHERE user_id = 930"); await pool.end(); });

test("convert creates one Task and stable private source relation", async () => {
  const note = await createNote("Never expose this body through Task");
  const converted = await api<{ id: number; assignmentId: number | null; task: { description: string } }>(`/quick-notes/${note.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify(conversion(op())) });
  assert.equal(converted.response.status, 200); assert.equal(converted.data.assignmentId, null); assert.equal(converted.data.task.description, "Explicit action summary");
  assert.equal(await scalar("SELECT COUNT(*) FROM tasks"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM quick_note_task_links"), 1);
  const detail = await api<Record<string, unknown>>(`/tasks/${converted.data.id}`); const serialized = JSON.stringify(detail.data);
  assert.match(serialized, /QUICK_NOTE/); assert.doesNotMatch(serialized, /Never expose this body|private/);
});

test("convert-and-accept, lost-response replay, and changed fingerprint stay atomic", async () => {
  const note = await createNote(); const operationId = op(); const body = conversion(operationId, { acceptDate: "2026-09-20" });
  const first = await api<{ id: number; assignmentId: number }>(`/quick-notes/${note.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify(body) });
  const replay = await api<typeof first.data>(`/quick-notes/${note.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify(body) });
  assert.equal(replay.data.id, first.data.id); assert.equal(replay.data.assignmentId, first.data.assignmentId);
  assert.equal(await scalar("SELECT COUNT(*) FROM tasks"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM quick_note_task_links"), 1);
  const changed = await api(`/quick-notes/${note.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify({ ...body, description: "Changed summary" }) });
  assert.equal(changed.response.status, 409);
});

test("double click and source unique cannot create a second direct Task", async () => {
  const note = await createNote();
  const [left, right] = await Promise.all([api(`/quick-notes/${note.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify(conversion(op())) }), api(`/quick-notes/${note.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify(conversion(op())) })]);
  assert.deepEqual([left.response.status, right.response.status].sort(), [200, 409]); assert.equal(await scalar("SELECT COUNT(*) FROM tasks"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM quick_note_task_links"), 1);
});

test("Note and Task lifecycle do not cascade across the source relation", async () => {
  const note = await createNote(); const converted = await api<{ id: number }>(`/quick-notes/${note.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify(conversion(op())) });
  await api(`/quick-notes/${note.data.id}`, { method: "DELETE", body: JSON.stringify({ expectedVersion: note.data.version }) });
  assert.equal(await scalar("SELECT COUNT(*) FROM tasks WHERE id = ?", [converted.data.id]), 1);
  await api(`/tasks/${converted.data.id}/archive`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) });
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_notes WHERE id = ?", [note.data.id]), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_note_task_links WHERE quick_note_id = ?", [note.data.id]), 1);
  const secondNote = await createNote("Second independent source"); const secondTask = await api<{ id: number }>(`/quick-notes/${secondNote.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify(conversion(op())) });
  await api(`/tasks/${secondTask.data.id}`, { method: "DELETE", body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) });
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_notes WHERE id = ? AND deleted_at IS NULL", [secondNote.data.id]), 1);
});

test("search isolates users, covers stable fields, filters, and paginates deterministically", async () => {
  await pool.query("INSERT INTO tasks (user_id,title,description,priority,difficulty,status,pinned,progress_percent,version,sort_order,completion_sequence,created_at,updated_at) VALUES (1,'Needle Task','task description needle',2,2,0,0,0,1,1,0,NOW(),NOW()),(930,'Other Needle','private other user',2,2,0,0,0,1,1,0,NOW(),NOW())");
  await pool.query("INSERT INTO journals (user_id,journal_date,record_timezone,content,created_at,updated_at) VALUES (1,'2026-09-18','Asia/Shanghai','journal needle',NOW(),NOW())");
  await pool.query("INSERT INTO morning_writings (user_id,writing_date,content,created_at,updated_at) VALUES (1,'2026-09-17','morning needle',NOW(),NOW())");
  await pool.query("INSERT INTO schedules (user_id,schedule_date,record_timezone,start_time,end_time,title,note,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,version,created_at,updated_at) VALUES (1,'2026-09-19','Asia/Shanghai','09:00:00','10:00:00','Calendar needle','schedule note',0,0,0,0,0,1,1,NOW(),NOW())");
  for (let index = 0; index < 23; index++) await pool.query("INSERT INTO quick_notes (user_id,note_date,record_timezone,title,content,tag,version,created_at,updated_at) VALUES (1,?,'Asia/Shanghai',?,?,'needle-tag',1,DATE_ADD('2026-09-01', INTERVAL ? SECOND),DATE_ADD('2026-09-01', INTERVAL ? SECOND))", [index % 2 ? "2026-09-20" : "2026-09-16", `Needle ${index}`, `body needle ${index}`, index, index]);
  const first = await api<{ items: Array<{ type: string; date: string; deepLink: string }>; nextCursor: string }>("/search?q=needle&limit=10"); assert.equal(first.data.items.length, 10); assert.ok(first.data.nextCursor); assert.ok(first.data.items.every((item) => item.deepLink.startsWith("/"))); assert.ok(first.data.items.every((item) => item.deepLink.includes(`date=${item.date}`)));
  const second = await api<{ items: Array<{ type: string }>; nextCursor: string | null }>(`/search?q=needle&limit=10&cursor=${encodeURIComponent(first.data.nextCursor)}`); assert.equal(second.data.items.length, 10);
  const taskOnly = await api<{ items: Array<{ type: string }> }>("/search?q=needle&type=task"); assert.deepEqual(taskOnly.data.items.map((item) => item.type), ["task"]);
  for (const type of ["journal", "morning_writing", "schedule"] as const) { const filtered = await api<{ items: Array<{ type: string }> }>(`/search?q=needle&type=${type}`); assert.deepEqual(filtered.data.items.map((item) => item.type), [type]); }
  const dated = await api<{ items: Array<{ date: string }> }>("/search?q=needle&from=2026-09-18&to=2026-09-19"); assert.ok(dated.data.items.every((item) => item.date >= "2026-09-18" && item.date <= "2026-09-19"));
  const isolated = await api<{ items: unknown[] }>("/search?q=private", {}, 1); assert.equal(isolated.data.items.length, 0);
});

test("search excludes soft-deleted records and covers Note title/body/tag", async () => {
  const active = await createNote("search body value"); await createNote("deleted body value");
  const [deleted] = await pool.query("SELECT MAX(id) id FROM quick_notes"); const deletedId = Number((deleted as Array<{ id: number }>)[0].id); await pool.query("UPDATE quick_notes SET deleted_at=NOW() WHERE id=?", [deletedId]);
  for (const term of ["Source note", "search body", "private"]) { const result = await api<{ items: Array<{ id: number }> }>(`/search?q=${encodeURIComponent(term)}&type=quick_note`); assert.deepEqual(result.data.items.map((item) => item.id), [active.data.id]); }
  const excluded = await api<{ items: unknown[] }>("/search?q=deleted&type=quick_note"); assert.equal(excluded.data.items.length, 0);
});

test("domain exports preserve text, counts, source relation, and trash policy", async () => {
  const note = await createNote("Markdown body\nsecond line"); await api(`/quick-notes/${note.data.id}/convert-to-task`, { method: "POST", body: JSON.stringify(conversion(op())) });
  const json = await api<{ recordCount: number; content: string }>("/exports/writing?format=json&includeTrash=false"); const parsed = JSON.parse(json.data.content) as { records: Array<Record<string, unknown>> }; assert.equal(json.data.recordCount, parsed.records.length); assert.match(json.data.content, /linkedTaskId/);
  const markdown = await api<{ content: string }>("/exports/writing?format=markdown&includeTrash=false"); assert.match(markdown.data.content, /Markdown body\nsecond line/);
  const csv = await api<{ recordCount: number; content: string }>("/exports/tasks?format=csv&includeTrash=false"); assert.equal(csv.data.recordCount, 1); assert.match(csv.data.content, /Confirmed action/);
  await api(`/quick-notes/${note.data.id}`, { method: "DELETE", body: JSON.stringify({ expectedVersion: 1 }) });
  const withoutTrash = await api<{ content: string }>("/exports/writing?format=json&includeTrash=false"); const withTrash = await api<{ content: string }>("/exports/writing?format=json&includeTrash=true"); assert.doesNotMatch(withoutTrash.data.content, /Markdown body/); assert.match(withTrash.data.content, /Markdown body/);
});

test("settings update future defaults and category disable preserves historical references", async () => {
  const [categoryRows] = await pool.query("SELECT id FROM task_categories WHERE user_id=1 LIMIT 1"); const categoryId = Number((categoryRows as Array<{ id: number }>)[0].id);
  await pool.query("INSERT INTO tasks (user_id,category_id,title,priority,difficulty,status,pinned,progress_percent,version,sort_order,completion_sequence,created_at,updated_at) VALUES (1,?,'Historical category task',2,2,0,0,0,1,1,0,NOW(),NOW())", [categoryId]);
  const updated = await api<{ profile: { displayName: string; timezone: string }; appearance: { reducedMotion: boolean; fontScale: number; locale: string }; rewards: { show: boolean } }>("/settings", { method: "PATCH", body: JSON.stringify({ displayName: "New Name", timezone: "Europe/London", reducedMotion: true, showRewards: false, fontScale: 110, locale: "en" }) });
  assert.equal(updated.data.profile.displayName, "New Name"); assert.equal(updated.data.profile.timezone, "Europe/London");
  assert.equal(updated.data.appearance.fontScale, 110);
  assert.equal(updated.data.appearance.locale, "en");
  await api(`/task-categories/${categoryId}`, { method: "PUT", body: JSON.stringify({ enabled: false }) });
  assert.equal(await scalar("SELECT category_id FROM tasks WHERE title='Historical category task'"), categoryId); assert.equal(await scalar("SELECT enabled FROM task_categories WHERE id=?", [categoryId]), 0);
});
