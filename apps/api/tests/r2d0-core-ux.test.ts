import assert from "node:assert/strict";
import test, { after } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "r2d0-tests-only-secret";

const [{ pool }, { app }, auth] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
let counter = 0;
const username = () => `r2d0_${Date.now()}_${++counter}`;
const headersFor = (id: number) => ({ Authorization: `Bearer ${auth.signToken({ id, username: `user-${id}`, displayName: `User ${id}` })}`, "Content-Type": "application/json" });
async function api<T>(path: string, init: RequestInit = {}, userId = 1) { const response = await app.request(`/api${path}`, { ...init, headers: { ...headersFor(userId), ...(init.headers ?? {}) } }); const json = await response.json() as { data: T; message: string }; return { response, data: json.data, message: json.message }; }
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Record<string, unknown>[])[0])[0]); }

after(async () => { await pool.end(); });

test("registration seeds seven general categories and explicit opt-in writing slots without changing existing preferences", async () => {
  const [existingBefore] = await pool.query("SELECT slot_key,enabled,sort_order FROM writing_slots WHERE user_id=1 ORDER BY slot_key");
  const name = username();
  const response = await app.request("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: name, password: "r2d0-secure", displayName: "R2D0" }) });
  assert.equal(response.status, 200);
  const payload = await response.json() as { data: { user: { id: number } } };
  const [categories] = await pool.query("SELECT name,color,dimension_key FROM task_categories WHERE user_id=? ORDER BY sort_order", [payload.data.user.id]);
  assert.deepEqual((categories as Array<{ name: string }>).map((row) => row.name), ["工作", "学习", "创作", "生活", "健康", "社交", "其他"]);
  assert.equal((categories as Array<{ name: string }>).some((row) => /stock|投资/i.test(row.name)), false);
  const [slots] = await pool.query("SELECT slot_key,enabled,sort_order FROM writing_slots WHERE user_id=? ORDER BY sort_order", [payload.data.user.id]);
  assert.deepEqual((slots as Array<{ slot_key: string; enabled: number }>).map((row) => [row.slot_key, Number(row.enabled)]), [["MORNING_WRITING", 0], ["JOURNAL", 0], ["STOCK_REVIEW", 0]]);
  const [existingAfter] = await pool.query("SELECT slot_key,enabled,sort_order FROM writing_slots WHERE user_id=1 ORDER BY slot_key");
  assert.deepEqual(existingAfter, existingBefore);
  await pool.query("DELETE FROM writing_slots WHERE user_id=?", [payload.data.user.id]);
  await pool.query("DELETE FROM user_execution_slots WHERE user_id=?", [payload.data.user.id]);
  await pool.query("DELETE FROM growth_dimensions WHERE user_id=?", [payload.data.user.id]);
  await pool.query("DELETE FROM task_categories WHERE user_id=?", [payload.data.user.id]);
  await pool.query("DELETE FROM users WHERE id=?", [payload.data.user.id]);
});

test("category accepts no Growth mapping and normalizes a precise color", async () => {
  const created = await api<{ id: number; color: string; dimensionKey: string | null }>("/task-categories", { method: "POST", body: JSON.stringify({ name: "自由探索", color: "#a1b2c3", dimensionKey: null, targetMinutes: 6000 }) });
  assert.equal(created.response.status, 200); assert.equal(created.data.color, "#A1B2C3"); assert.equal(created.data.dimensionKey, null);
  const invalid = await api("/task-categories", { method: "POST", body: JSON.stringify({ name: "坏颜色", color: "red" }) });
  assert.equal(invalid.response.status, 400);
});

test("disabled writing slots preserve History, Search, Export, and owner records", async () => {
  await pool.query("INSERT INTO morning_writings (user_id,writing_date,content,created_at,updated_at) VALUES (1,'2026-09-21','morning',NOW(),NOW()) ON DUPLICATE KEY UPDATE content='morning'");
  await pool.query("INSERT INTO journals (user_id,journal_date,record_timezone,content,created_at,updated_at) VALUES (1,'2026-09-21','Asia/Shanghai','journal',NOW(),NOW()) ON DUPLICATE KEY UPDATE content='journal'");
  await pool.query("INSERT INTO stock_reviews (user_id,review_date,market_summary,created_at,updated_at) VALUES (1,'2026-09-21','review',NOW(),NOW()) ON DUPLICATE KEY UPDATE market_summary='review'");
  const updated = await api<{ writingSlots: Array<{ slotKey: string; enabled: boolean }> }>("/settings", { method: "PATCH", body: JSON.stringify({ writingSlots: [{ slotKey: "JOURNAL", enabled: false, sortOrder: 10 }, { slotKey: "MORNING_WRITING", enabled: false, sortOrder: 20 }, { slotKey: "STOCK_REVIEW", enabled: false, sortOrder: 30 }] }) });
  assert.equal(updated.response.status, 200); assert.equal(updated.data.writingSlots.every((slot) => !slot.enabled), true);
  assert.deepEqual([await scalar("SELECT COUNT(*) FROM morning_writings WHERE user_id=1"), await scalar("SELECT COUNT(*) FROM journals WHERE user_id=1"), await scalar("SELECT COUNT(*) FROM stock_reviews WHERE user_id=1")], [1, 1, 1]);
  const history = await api<Array<{ content: string | null }>>("/journals/list?limit=50");
  assert.equal(history.data.some((row) => row.content === "journal"), true);
  const search = await api<{ items: Array<{ type: string }> }>("/search?q=journal&type=journal");
  assert.deepEqual(search.data.items.map((item) => item.type), ["journal"]);
  const exported = await api<{ content: string }>("/exports/writing?format=json&includeTrash=false");
  assert.match(exported.data.content, /journal/);
});

test("sleep is keyed by wake date and stores explicit timezone", async () => {
  const saved = await api<{ sleepDate: string; durationMinutes: number }>("/sleep-records", { method: "POST", body: JSON.stringify({ sleepStartDate: "2026-09-20", sleepStartTime: "23:30", wakeDate: "2026-09-21", wakeTime: "07:30", recordTimezone: "Asia/Shanghai", qualityScore: 4 }) });
  assert.equal(saved.response.status, 200); assert.equal(saved.data.sleepDate, "2026-09-21"); assert.equal(saved.data.durationMinutes, 480);
  assert.equal(await scalar("SELECT COUNT(*) FROM sleep_records WHERE user_id=1 AND sleep_date='2026-09-21' AND record_timezone='Asia/Shanghai'"), 1);
  const invalid = await api("/sleep-records", { method: "POST", body: JSON.stringify({ sleepStartDate: "2026-09-21", sleepStartTime: "09:00", wakeDate: "2026-09-21", wakeTime: "08:00", recordTimezone: "Asia/Shanghai" }) });
  assert.equal(invalid.response.status, 400);
});

test("Manual Actual candidates are accepted assignments for the requested date", async () => {
  await pool.query("DELETE FROM task_daily_assignments WHERE user_id=1");
  await pool.query("DELETE FROM tasks WHERE user_id=1");
  await pool.query("INSERT INTO tasks (user_id,title,priority,difficulty,status,pinned,progress_percent,version,sort_order,completion_sequence,created_at,updated_at) VALUES (1,'Accepted',2,2,0,0,0,1,10,0,NOW(),NOW()),(1,'Other day',2,2,0,0,0,1,20,0,NOW(),NOW()),(1,'Released',2,2,0,0,0,1,30,0,NOW(),NOW())");
  const [rows] = await pool.query("SELECT id,title FROM tasks WHERE user_id=1"); const ids = new Map((rows as Array<{ id: number; title: string }>).map((row) => [row.title, row.id]));
  await pool.query("INSERT INTO task_daily_assignments (user_id,task_id,task_date,assignment_status,record_timezone,sort_order,continuation_state,version,created_at,updated_at) VALUES (1,?,'2026-09-21',0,'Asia/Shanghai',10,0,1,NOW(),NOW()),(1,?,'2026-09-20',0,'Asia/Shanghai',20,0,1,NOW(),NOW()),(1,?,'2026-09-21',1,'Asia/Shanghai',30,0,1,NOW(),NOW())", [ids.get("Accepted"), ids.get("Other day"), ids.get("Released")]);
  const result = await api<{ taskIds: number[] }>("/task-days?date=2026-09-21");
  assert.deepEqual(result.data.taskIds, [ids.get("Accepted")]);
});
