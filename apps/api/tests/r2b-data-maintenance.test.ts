import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "r2b-tests-only-secret";

const [{ pool }, { app }, auth] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
let counter = 0;
const op = () => `82000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const headersFor = (id: number) => ({ Authorization: `Bearer ${auth.signToken({ id, username: `user-${id}`, displayName: `User ${id}` })}`, "Content-Type": "application/json" });
async function api<T>(path: string, init: RequestInit = {}, userId = 1) { const response = await app.request(`/api${path}`, { ...init, headers: { ...headersFor(userId), ...(init.headers ?? {}) } }); const json = await response.json() as { data: T; message: string }; return { response, data: json.data, message: json.message }; }
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Record<string, unknown>[])[0])[0]); }
async function createNote(content = "项目素材", userId = 1) { return api<{ id: number; version: number }>("/quick-notes", { method: "POST", body: JSON.stringify({ operationId: op(), noteDate: "2026-09-21", title: content, content, tag: "material" }) }, userId); }
async function createProject(name = "导游考试", userId = 1) { return api<{ id: number; version: number }>("/projects", { method: "POST", body: JSON.stringify({ name, priority: 2 }) }, userId); }
async function removeNote(id: number, expectedVersion = 1) { return api<{ version: number }>(`/quick-notes/${id}`, { method: "DELETE", body: JSON.stringify({ expectedVersion }) }); }

beforeEach(async () => {
  for (const table of ["quick_note_task_links", "quick_notes", "task_daily_assignments", "task_completion_events", "schedules", "timer_segments", "timer_sessions", "tasks", "projects", "reward_events", "user_growth", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (932,'r2b-isolation','R2B Isolation','Asia/Shanghai',NOW(),NOW()) ON DUPLICATE KEY UPDATE deleted_at=NULL, timezone='Asia/Shanghai'");
});

after(async () => { await pool.end(); });

test("Trash contains only deleted eligible records and is user/type scoped", async () => {
  const deleted = await createNote("Deleted note"); await removeNote(deleted.data.id);
  const active = await createNote("Active note");
  const archived = await createNote("Archived note"); await api(`/quick-notes/${archived.data.id}/archive`, { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) });
  const project = await createProject("Archived Project"); await api(`/projects/${project.data.id}/archive`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1 }) });
  const foreign = await createNote("Foreign deleted", 932); await api(`/quick-notes/${foreign.data.id}`, { method: "DELETE", body: JSON.stringify({ expectedVersion: 1 }) }, 932);

  const all = await api<{ items: Array<{ id: number; type: string; excerpt: string }>; supportedTypes: string[] }>("/trash?type=all");
  assert.deepEqual(all.data.items.map((item) => item.id), [deleted.data.id]);
  assert.deepEqual(all.data.supportedTypes, ["quick_note"]);
  assert.equal(all.data.items[0].type, "quick_note");
  assert.equal("content" in all.data.items[0], false);
  const filtered = await api<{ items: Array<{ id: number }> }>("/trash?type=quick_note");
  assert.deepEqual(filtered.data.items.map((item) => item.id), [deleted.data.id]);
  assert.equal((await api("/trash?type=task")).response.status, 400);
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_notes WHERE id=? AND deleted_at IS NULL", [active.data.id]), 1);
});

test("Trash cursor pagination is deterministic by deletedAt then id", async () => {
  const ids: number[] = [];
  for (const title of ["One", "Two", "Three"]) { const note = await createNote(title); ids.push(note.data.id); await removeNote(note.data.id); }
  await pool.query("UPDATE quick_notes SET deleted_at='2026-09-21 12:00:00' WHERE id IN (?,?,?)", ids);
  const first = await api<{ items: Array<{ id: number }>; nextCursor: string | null }>("/trash?limit=2");
  assert.deepEqual(first.data.items.map((item) => item.id), [...ids].sort((a, b) => b - a).slice(0, 2));
  assert.ok(first.data.nextCursor);
  const second = await api<{ items: Array<{ id: number }>; nextCursor: string | null }>(`/trash?limit=2&cursor=${encodeURIComponent(first.data.nextCursor!)}`);
  assert.deepEqual(second.data.items.map((item) => item.id), [Math.min(...ids)]);
  assert.equal(second.data.nextCursor, null);
});

test("Trash restore dispatch is replay-safe, returns to normal reads/search, and never re-awards", async () => {
  const note = await createNote("Restorable needle"); await removeNote(note.data.id);
  const operationId = op();
  const body = JSON.stringify({ operationId, expectedVersion: 2 });
  const restored = await api<{ type: string; id: number; version: number }>(`/trash/quick_note/${note.data.id}/restore`, { method: "POST", body });
  const replay = await api<{ type: string; id: number; version: number }>(`/trash/quick_note/${note.data.id}/restore`, { method: "POST", body });
  assert.deepEqual(replay.data, restored.data);
  assert.equal(restored.data.version, 3);
  assert.equal((await api<{ items: unknown[] }>("/trash")).data.items.length, 0);
  assert.deepEqual((await api<{ items: Array<{ id: number }> }>("/quick-notes?state=active")).data.items.map((item) => item.id), [note.data.id]);
  assert.deepEqual((await api<{ items: Array<{ id: number }> }>("/search?q=Restorable&type=quick_note")).data.items.map((item) => item.id), [note.data.id]);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_type='quick_note' AND source_id=?", [String(note.data.id)]), 1);
  assert.equal(await scalar("SELECT xp_total FROM user_growth WHERE user_id=1"), 6);
});

test("concurrent restore with distinct operations has one winner and one explicit conflict", async () => {
  const note = await createNote("Concurrent restore"); await removeNote(note.data.id);
  const [left, right] = await Promise.all([
    api(`/trash/quick_note/${note.data.id}/restore`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 2 }) }),
    api(`/trash/quick_note/${note.data.id}/restore`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 2 }) })
  ]);
  assert.deepEqual([left.response.status, right.response.status].sort(), [200, 409]);
  assert.equal(await scalar("SELECT version FROM quick_notes WHERE id=?", [note.data.id]), 3);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_type='quick_note'"), 1);
});

test("QuickNote association can set, change, and clear without Task, time, or reward side effects", async () => {
  const x = await createProject("Project X"), y = await createProject("Project Y"), note = await createNote();
  const before = { tasks: await scalar("SELECT COUNT(*) FROM tasks"), schedules: await scalar("SELECT COUNT(*) FROM schedules"), segments: await scalar("SELECT COUNT(*) FROM timer_segments"), rewards: await scalar("SELECT COUNT(*) FROM reward_events") };
  const linked = await api<{ projectId: number; version: number }>(`/quick-notes/${note.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, projectId: x.data.id }) });
  assert.equal(linked.data.projectId, x.data.id);
  const moved = await api<{ projectId: number; version: number }>(`/quick-notes/${note.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 2, projectId: y.data.id }) });
  assert.equal(moved.data.projectId, y.data.id);
  const cleared = await api<{ projectId: number | null }>(`/quick-notes/${note.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 3, projectId: null }) });
  assert.equal(cleared.data.projectId, null);
  assert.deepEqual({ tasks: await scalar("SELECT COUNT(*) FROM tasks"), schedules: await scalar("SELECT COUNT(*) FROM schedules"), segments: await scalar("SELECT COUNT(*) FROM timer_segments"), rewards: await scalar("SELECT COUNT(*) FROM reward_events") }, before);
});

test("cross-user and newly archived Project associations are rejected while historical links survive archive", async () => {
  const project = await createProject("Historical material"), foreign = await createProject("Foreign", 932), note = await createNote("Linked before archive"), second = await createNote("New link attempt");
  assert.equal((await api(`/quick-notes/${note.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, projectId: foreign.data.id }) })).response.status, 404);
  await api(`/quick-notes/${note.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, projectId: project.data.id }) });
  await api(`/projects/${project.data.id}/archive`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1 }) });
  assert.equal((await api(`/quick-notes/${second.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, projectId: project.data.id }) })).response.status, 404);
  const detail = await api<{ projectId: number; linkedProject: { id: number; archivedAt: string } }>(`/quick-notes/${note.data.id}`);
  assert.equal(detail.data.projectId, project.data.id);
  assert.equal(detail.data.linkedProject.id, project.data.id);
  assert.ok(detail.data.linkedProject.archivedAt);
});

test("Project materials are owner-scoped summaries, hide deleted Notes, and preserve both owners", async () => {
  const project = await createProject(), note = await createNote("Private material body that should only appear as an excerpt");
  await api(`/quick-notes/${note.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, projectId: project.data.id }) });
  const materials = await api<{ items: Array<{ id: number; excerpt: string; deepLink: string }>; privacy: string }>(`/projects/${project.data.id}/materials`);
  assert.deepEqual(materials.data.items.map((item) => item.id), [note.data.id]);
  assert.equal(materials.data.items[0].deepLink, `/notes/${note.data.id}?date=2026-09-21`);
  assert.equal(materials.data.privacy, "FIRST_PARTY_PERSONAL_TEXT_SUMMARY");
  assert.equal((await api(`/projects/${project.data.id}/materials`, {}, 932)).response.status, 404);
  await removeNote(note.data.id, 2);
  assert.equal((await api<{ items: unknown[] }>(`/projects/${project.data.id}/materials`)).data.items.length, 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM projects WHERE id=?", [project.data.id]), 1);
  await api(`/trash/quick_note/${note.data.id}/restore`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 3 }) });
  assert.equal((await api<{ items: unknown[] }>(`/projects/${project.data.id}/materials`)).data.items.length, 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_notes WHERE id=?", [note.data.id]), 1);
});
