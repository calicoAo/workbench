import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
if (!new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("TEST_DATABASE_URL must end in _test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "g5a-tests-only-secret";

const [{ pool }, appModule, auth] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/app.js"),
  import("../src/auth.js")
]);

let operationCounter = 0;
const op = () => `50000000-0000-4000-8000-${String(++operationCounter).padStart(12, "0")}`;
const headersFor = (id: number) => ({ Authorization: `Bearer ${auth.signToken({ id, username: `user-${id}`, displayName: `User ${id}` })}`, "Content-Type": "application/json" });
const headers = headersFor(1);

async function rows<T>(sql: string, values: unknown[] = []) { const [result] = await pool.query(sql, values); return result as T[]; }
async function scalar(sql: string, values: unknown[] = []) { const [row] = await rows<Record<string, number>>(sql, values); return Number(Object.values(row)[0]); }
async function request<T>(path: string, init: RequestInit = {}, authHeaders = headers) {
  const suffix = path === "/" ? "" : path.startsWith("/?") ? path.slice(1) : path;
  const response = await appModule.app.request(`/api/quick-notes${suffix}`, { ...init, headers: { ...authHeaders, ...(init.headers ?? {}) } });
  const json = await response.json() as { data: T; message: string };
  return { response, data: json.data, message: json.message };
}
async function createNote(values: Record<string, unknown> = {}) {
  return request<QuickNote & { reward: { xp: number; coins: number } }>("/", { method: "POST", body: JSON.stringify({ operationId: op(), content: "Body only note", ...values }) });
}

type QuickNote = {
  id: number;
  noteDate: string;
  title: string | null;
  content: string;
  tag: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
  createdAt: string;
};

beforeEach(async () => {
  await pool.query("DROP TRIGGER IF EXISTS g5a_fail_reward_insert");
  for (const table of ["quick_notes", "reward_events", "user_growth", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("UPDATE users SET timezone = 'Asia/Shanghai' WHERE id = 1");
  await pool.query(`INSERT INTO users (id, username, display_name, timezone, created_at, updated_at) VALUES (920, 'g5a-isolation', 'Isolation', 'Asia/Shanghai', NOW(), NOW()) ON DUPLICATE KEY UPDATE deleted_at = NULL`);
});

after(async () => {
  await pool.query("DROP TRIGGER IF EXISTS g5a_fail_reward_insert");
  await pool.query("DELETE FROM quick_notes WHERE user_id = 920");
  await pool.end();
});

test("V22 exposes the Quick Note lifecycle columns and query indexes", async () => {
  assert.equal(await scalar("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'quick_notes' AND column_name IN ('archived_at','version')"), 2);
  assert.equal(await scalar("SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'quick_notes' AND index_name LIKE 'idx_quick_notes_user_%'"), 3);
});

test("body-only create is atomic, replayable, and rewards exactly once", async () => {
  const operationId = op();
  const body = { operationId, content: "A thought captured without metadata" };
  const first = await request<QuickNote & { reward: { xp: number; coins: number } }>("/", { method: "POST", body: JSON.stringify(body) });
  assert.equal(first.response.status, 200);
  assert.equal(first.data.content, body.content);
  assert.equal(first.data.title, null);
  assert.deepEqual(first.data.reward, { xp: 6, coins: 2, reason: "记录随手记" });
  const replay = await request<typeof first.data>("/", { method: "POST", body: JSON.stringify(body) });
  assert.equal(replay.data.id, first.data.id);
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_notes"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_type = 'quick_note'"), 1);
  assert.equal(await scalar("SELECT xp_total FROM user_growth WHERE user_id = 1"), 6);
  assert.equal(await scalar("SELECT coins FROM user_growth WHERE user_id = 1"), 2);
  assert.equal(await scalar("SELECT COUNT(*) FROM mutation_receipts WHERE operation_id = ? AND committed_at IS NOT NULL", [operationId]), 1);

  const conflict = await request<null>("/", { method: "POST", body: JSON.stringify({ ...body, content: "Changed retry" }) });
  assert.equal(conflict.response.status, 409);
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_notes"), 1);
});

test("reward insertion failure rolls the note, growth, and receipt back", async () => {
  await pool.query("CREATE TRIGGER g5a_fail_reward_insert BEFORE INSERT ON reward_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected quick note reward failure'");
  const operationId = op();
  const failed = await request<null>("/", { method: "POST", body: JSON.stringify({ operationId, content: "Must roll back" }) });
  assert.equal(failed.response.status, 500);
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_notes"), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events"), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM user_growth"), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM mutation_receipts"), 0);
  await pool.query("DROP TRIGGER g5a_fail_reward_insert");
  const retry = await request<QuickNote>("/", { method: "POST", body: JSON.stringify({ operationId, content: "Must roll back" }) });
  assert.equal(retry.response.status, 200);
  assert.equal(await scalar("SELECT COUNT(*) FROM quick_notes"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events"), 1);
});

test("edit uses expectedVersion and a concurrent edit returns 409", async () => {
  const created = await createNote({ title: "Original", tag: "idea", noteDate: "2026-09-19" });
  const edited = await request<QuickNote>(`/${created.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, title: "Edited", content: "Edited body" }) });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.data.version, 2);
  assert.equal(edited.data.content, "Edited body");
  const stale = await request<null>(`/${created.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, content: "Stale body" }) });
  assert.equal(stale.response.status, 409);
  const detail = await request<QuickNote>(`/${created.data.id}`);
  assert.equal(detail.data.content, "Edited body");
});

test("archive, unarchive, soft delete, and restore preserve one reward", async () => {
  const created = await createNote();
  const archived = await request<QuickNote>(`/${created.data.id}/archive`, { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) });
  assert.equal(archived.data.version, 2);
  assert.ok(archived.data.archivedAt);
  const archivedList = await request<{ items: QuickNote[] }>("/?state=archived");
  assert.deepEqual(archivedList.data.items.map((item) => item.id), [created.data.id]);

  const unarchived = await request<QuickNote>(`/${created.data.id}/unarchive`, { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) });
  assert.equal(unarchived.data.version, 3);
  const deleted = await request<QuickNote>(`/${created.data.id}`, { method: "DELETE", body: JSON.stringify({ expectedVersion: 3 }) });
  assert.equal(deleted.data.version, 4);
  assert.ok(deleted.data.deletedAt);
  assert.equal((await request<{ items: QuickNote[] }>("/?state=active")).data.items.length, 0);
  assert.equal((await request<{ items: QuickNote[] }>("/?state=deleted")).data.items.length, 1);
  const restored = await request<QuickNote>(`/${created.data.id}/restore`, { method: "POST", body: JSON.stringify({ expectedVersion: 4 }) });
  assert.equal(restored.data.version, 5);
  assert.equal(restored.data.deletedAt, null);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_type = 'quick_note'"), 1);
  assert.equal(await scalar("SELECT xp_total FROM user_growth WHERE user_id = 1"), 6);
});

test("cursor pagination traverses more than 100 notes without gaps or duplicates", async () => {
  const values: unknown[] = [];
  const placeholders = Array.from({ length: 105 }, (_, index) => {
    values.push(1, index % 2 ? "2026-09-19" : "2026-09-18", `Fixture ${index}`, index === 42 ? "needle content" : `content ${index}`, index % 3 ? "idea" : "work", index);
    return "(?, ?, 'Asia/Shanghai', ?, ?, ?, 1, DATE_ADD('2026-09-01 00:00:00', INTERVAL ? SECOND), DATE_ADD('2026-09-01 00:00:00', INTERVAL ? SECOND))";
  });
  const expandedValues = values.flatMap((value, index) => index % 6 === 5 ? [value, value] : [value]);
  await pool.query(`INSERT INTO quick_notes (user_id, note_date, record_timezone, title, content, tag, version, created_at, updated_at) VALUES ${placeholders.join(",")}`, expandedValues);

  const ids = new Set<number>();
  let cursor: string | null = null;
  do {
    const page: { response: Response; data: { items: QuickNote[]; nextCursor: string | null }; message: string } = await request<{ items: QuickNote[]; nextCursor: string | null }>(`/?limit=37${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    page.data.items.forEach((item) => ids.add(item.id));
    cursor = page.data.nextCursor;
  } while (cursor);
  assert.equal(ids.size, 105);
  assert.equal((await request<{ items: QuickNote[] }>("/?keyword=needle")).data.items.length, 1);
  assert.equal((await request<{ items: QuickNote[] }>("/?tag=work&limit=100")).data.items.length, 35);
  assert.equal((await request<{ items: QuickNote[] }>("/?from=2026-09-19&to=2026-09-19&limit=100")).data.items.length, 52);
});

test("noteDate remains independent from createdAt and archived filtering is stable", async () => {
  const first = await createNote({ noteDate: "2026-09-18", content: "Backdated thought", tag: "history" });
  const second = await createNote({ noteDate: "2026-09-20", content: "Current thought", tag: "history" });
  await pool.query("UPDATE quick_notes SET created_at = '2026-09-20 18:00:00' WHERE id = ?", [first.data.id]);
  await request<QuickNote>(`/${second.data.id}/archive`, { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) });
  const detail = await request<QuickNote>(`/${first.data.id}`);
  assert.equal(detail.data.noteDate, "2026-09-18");
  assert.match(String(detail.data.createdAt), /^2026-09-20/);
  const active = await request<{ items: QuickNote[] }>("/?state=active");
  const archived = await request<{ items: QuickNote[] }>("/?state=archived");
  assert.deepEqual(active.data.items.map((item) => item.id), [first.data.id]);
  assert.deepEqual(archived.data.items.map((item) => item.id), [second.data.id]);
});

test("personal text is user-isolated for list and detail reads", async () => {
  const created = await createNote({ content: "Private text" });
  const list = await request<{ items: QuickNote[] }>("/", {}, headersFor(920));
  assert.equal(list.data.items.length, 0);
  const detail = await request<null>(`/${created.data.id}`, {}, headersFor(920));
  assert.equal(detail.response.status, 404);
});

test("Quick Note lifecycle does not write Task, Timeline, ActualTime, or a Habit domain", async () => {
  const before = {
    tasks: await scalar("SELECT COUNT(*) FROM tasks"),
    schedules: await scalar("SELECT COUNT(*) FROM schedules"),
    sessions: await scalar("SELECT COUNT(*) FROM timer_sessions"),
    segments: await scalar("SELECT COUNT(*) FROM timer_segments")
  };
  const created = await createNote({ noteDate: "2026-09-18" });
  await request<QuickNote>(`/${created.data.id}`, { method: "DELETE", body: JSON.stringify({ expectedVersion: 1 }) });
  assert.deepEqual({
    tasks: await scalar("SELECT COUNT(*) FROM tasks"),
    schedules: await scalar("SELECT COUNT(*) FROM schedules"),
    sessions: await scalar("SELECT COUNT(*) FROM timer_sessions"),
    segments: await scalar("SELECT COUNT(*) FROM timer_segments")
  }, before);
  assert.equal(await scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('habits','habit_records')"), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_type = 'quick_note'"), 1);
});
