import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "r2c-tests-only-secret";
mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-21T04:00:00.000Z") });

const [{ pool }, { app }, auth] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
let counter = 0;
const op = () => `83000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
const headersFor = (id: number) => ({ Authorization: `Bearer ${auth.signToken({ id, username: `user-${id}`, displayName: `User ${id}` })}`, "Content-Type": "application/json" });
async function api<T>(path: string, init: RequestInit = {}, userId = 1) { const response = await app.request(`/api${path}`, { ...init, headers: { ...headersFor(userId), ...(init.headers ?? {}) } }); const json = await response.json() as { data: T; message: string }; return { response, data: json.data, message: json.message }; }
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Record<string, unknown>[])[0])[0]); }
async function createHabit(input: Record<string, unknown> = {}, operationId = op(), userId = 1) { return api<{ id: number; version: number }>("/habits", { method: "POST", body: JSON.stringify({ operationId, name: "阅读", startDate: "2026-09-01", recordMode: 0, taskCompletionEnabled: true, rule: { frequencyType: 0 }, targetValue: 1, ...input }) }, userId); }

beforeEach(async () => {
  for (const table of ["habit_task_links", "habit_occurrences", "habit_goal_versions", "habit_rule_versions", "habit_definitions", "water_records", "morning_writings", "sleep_records", "task_daily_assignments", "task_completion_events", "schedules", "timer_segments", "timer_sessions", "tasks", "reward_events", "user_growth", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("UPDATE user_execution_slots SET active_session_id=NULL");
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (933,'r2c-isolation','R2C Isolation','Asia/Shanghai',NOW(),NOW()) ON DUPLICATE KEY UPDATE deleted_at=NULL, timezone='Asia/Shanghai'");
});

after(async () => { await pool.end(); mock.timers.reset(); });

test("create is receipt-idempotent, isolated, and persists normalized rule and goal", async () => {
  const operationId = op(); const first = await createHabit({}, operationId); const replay = await createHabit({}, operationId);
  assert.equal(first.response.status, 200); assert.deepEqual(replay.data, first.data);
  assert.equal(await scalar("SELECT COUNT(*) FROM habit_definitions"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM habit_rule_versions"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM habit_goal_versions"), 1);
  const other = await api<unknown[]>("/habits", {}, 933); assert.deepEqual(other.data, []);
});

test("daily and weekday expectations derive pending, missed, completed and skipped without pre-generation", async () => {
  const daily = await createHabit();
  const pending = await api<{ items: Array<{ id: number; status: string }> }>("/habits/summary?date=2026-09-21"); assert.equal(pending.data.items.find((item) => item.id === daily.data.id)?.status, "PENDING");
  const missed = await api<{ items: Array<{ id: number; status: string }> }>("/habits/summary?date=2026-09-20"); assert.equal(missed.data.items.find((item) => item.id === daily.data.id)?.status, "MISSED");
  assert.equal(await scalar("SELECT COUNT(*) FROM habit_occurrences"), 0);
  const weekdays = await createHabit({ name: "工作日拉伸", rule: { frequencyType: 1, weekdayMask: 31 }, taskCompletionEnabled: false });
  const sunday = await api<{ items: Array<{ id: number }> }>("/habits/summary?date=2026-09-20"); assert.equal(sunday.data.items.some((item) => item.id === weekdays.data.id), false);
  const skipped = await api<{ version: number; status: number }>(`/habits/${daily.data.id}/occurrences`, { method: "POST", body: JSON.stringify({ operationId: op(), occurrenceDate: "2026-09-21", recordTimezone: "Asia/Shanghai", expectedVersion: 0, skipped: true, skipReason: "休息" }) });
  assert.equal(skipped.data.status, 2); assert.equal(await scalar("SELECT COUNT(*) FROM habit_occurrences WHERE record_timezone='Asia/Shanghai' AND skip_reason='休息'"), 1);
});

test("count, quantity and minutes preserve values and derive partial/completed", async () => {
  for (const [mode, name, value, target] of [[1, "俯卧撑", 6, 10], [2, "蔬菜", 250.5, 500], [3, "冥想", 12, 20]] as const) {
    const habit = await createHabit({ name, recordMode: mode, unit: mode === 3 ? "分钟" : "次", targetValue: target, taskCompletionEnabled: false });
    const partial = await api<{ version: number; status: number; actualValue: number }>(`/habits/${habit.data.id}/occurrences`, { method: "POST", body: JSON.stringify({ operationId: op(), occurrenceDate: "2026-09-21", recordTimezone: "Asia/Shanghai", expectedVersion: 0, actualValue: value }) });
    assert.equal(partial.data.status, 0); assert.equal(partial.data.actualValue, value);
    const complete = await api<{ status: number }>(`/habits/${habit.data.id}/occurrences`, { method: "POST", body: JSON.stringify({ operationId: op(), occurrenceDate: "2026-09-21", recordTimezone: "Asia/Shanghai", expectedVersion: 1, actualValue: target }) });
    assert.equal(complete.data.status, 1);
    const stale = await api(`/habits/${habit.data.id}/occurrences`, { method: "POST", body: JSON.stringify({ operationId: op(), occurrenceDate: "2026-09-21", recordTimezone: "Asia/Shanghai", expectedVersion: 1, actualValue: target + 1 }) });
    assert.equal(stale.response.status, 409);
  }
});

test("weekly N is one Monday-based week target and never creates daily missed rows", async () => {
  const habit = await createHabit({ name: "力量训练", rule: { frequencyType: 2, weeklyTarget: 3 }, taskCompletionEnabled: false });
  const empty = await api<{ items: Array<{ id: number; completed: number; status: string }> }>("/habits/summary?date=2026-09-14");
  const emptyItem = empty.data.items.find((row) => row.id === habit.data.id); assert.deepEqual([emptyItem?.completed, emptyItem?.status], [0, "IN_PROGRESS"]);
  for (const occurrenceDate of ["2026-09-14", "2026-09-16"]) await api(`/habits/${habit.data.id}/occurrences`, { method: "POST", body: JSON.stringify({ operationId: op(), occurrenceDate, recordTimezone: "Asia/Shanghai", expectedVersion: 0 }) });
  const summary = await api<{ weekFrom: string; weekTo: string; items: Array<{ id: number; completed: number; weeklyTarget: number; status: string }> }>("/habits/summary?date=2026-09-20");
  const item = summary.data.items.find((row) => row.id === habit.data.id); assert.deepEqual([summary.data.weekFrom, summary.data.weekTo, item?.completed, item?.weeklyTarget, item?.status], ["2026-09-14", "2026-09-20", 2, 3, "IN_PROGRESS"]);
  await api(`/habits/${habit.data.id}/occurrences`, { method: "POST", body: JSON.stringify({ operationId: op(), occurrenceDate: "2026-09-18", recordTimezone: "Asia/Shanghai", expectedVersion: 0 }) });
  const complete = await api<{ items: Array<{ id: number; completed: number; status: string }> }>("/habits/summary?date=2026-09-20");
  const completeItem = complete.data.items.find((row) => row.id === habit.data.id); assert.deepEqual([completeItem?.completed, completeItem?.status], [3, "COMPLETED"]);
  assert.equal(await scalar("SELECT COUNT(*) FROM habit_occurrences WHERE habit_id=?", [habit.data.id]), 3);
});

test("future rule and goal revisions preserve historical evaluation and reject stale versions", async () => {
  const habit = await createHabit({ targetValue: 1 });
  const immediate = await api<{ version: number }>(`/habits/${habit.data.id}/rule`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 1, effectiveFrom: "2026-09-21", rule: { frequencyType: 1, weekdayMask: 31 } }) }); assert.equal(immediate.data.version, 2);
  const goal = await api<{ version: number }>(`/habits/${habit.data.id}/goal`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 2, effectiveFrom: "2026-09-22", targetValue: 2 }) }); assert.equal(goal.data.version, 3);
  const rule = await api<{ version: number }>(`/habits/${habit.data.id}/rule`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 3, effectiveFrom: "2026-09-23", rule: { frequencyType: 1, weekdayMask: 21 } }) }); assert.equal(rule.data.version, 4);
  const stale = await api(`/habits/${habit.data.id}/state`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 3, effectiveFrom: "2026-09-24", action: "disable" }) }); assert.equal(stale.response.status, 409);
  assert.equal(await scalar("SELECT COUNT(*) FROM habit_goal_versions WHERE habit_id=?", [habit.data.id]), 2); assert.equal(await scalar("SELECT COUNT(*) FROM habit_rule_versions WHERE habit_id=?", [habit.data.id]), 3);
  const old = await api<{ items: Array<{ id: number; targetValue: number; frequencyType: number }> }>("/habits/summary?date=2026-09-20"); const oldItem = old.data.items.find((item) => item.id === habit.data.id); assert.deepEqual([oldItem?.targetValue, oldItem?.frequencyType], [1, 0]);
});

test("Habit to Task is unique and binary Task completion writes one occurrence in the same retry-safe workflow", async () => {
  const habit = await createHabit(); const operationId = op();
  const first = await api<{ taskId: number }>(`/habits/${habit.data.id}/task`, { method: "POST", body: JSON.stringify({ operationId, occurrenceDate: "2026-09-21", recordTimezone: "Asia/Shanghai" }) });
  const replay = await api<{ taskId: number }>(`/habits/${habit.data.id}/task`, { method: "POST", body: JSON.stringify({ operationId, occurrenceDate: "2026-09-21", recordTimezone: "Asia/Shanghai" }) }); assert.equal(replay.data.taskId, first.data.taskId);
  assert.equal(await scalar("SELECT COUNT(*) FROM habit_task_links"), 1); assert.equal(await scalar("SELECT COUNT(*) FROM tasks WHERE id=?", [first.data.taskId]), 1);
  const completeOp = op(); const completed = await api(`/tasks/${first.data.taskId}/complete`, { method: "PUT", body: JSON.stringify({ operationId: completeOp, expectedVersion: 1 }) }); assert.equal(completed.response.status, 200);
  const completedReplay = await api(`/tasks/${first.data.taskId}/complete`, { method: "PUT", body: JSON.stringify({ operationId: completeOp, expectedVersion: 1 }) }); assert.equal(completedReplay.response.status, 200);
  assert.equal(await scalar("SELECT COUNT(*) FROM habit_occurrences WHERE habit_id=? AND status=1 AND source=1", [habit.data.id]), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_type='TASK' AND source_id=?", [String(first.data.taskId)]), 1);
  const numeric = await createHabit({ name: "步数", recordMode: 1, targetValue: 10000, taskCompletionEnabled: false }); const numericTask = await api<{ taskId: number }>(`/habits/${numeric.data.id}/task`, { method: "POST", body: JSON.stringify({ operationId: op(), occurrenceDate: "2026-09-21", recordTimezone: "Asia/Shanghai" }) }); await api(`/tasks/${numericTask.data.taskId}/complete`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) }); assert.equal(await scalar("SELECT COUNT(*) FROM habit_occurrences WHERE habit_id=?", [numeric.data.id]), 0);
});

test("Water, Morning Writing and Sleep remain specialized read-only projections", async () => {
  await pool.query("INSERT INTO water_records (user_id,water_date,cups,target_cups,created_at,updated_at) VALUES (1,'2026-09-21',6,8,NOW(),NOW())");
  await pool.query("INSERT INTO morning_writings (user_id,writing_date,content,created_at,updated_at) VALUES (1,'2026-09-21','morning body',NOW(),NOW())");
  await pool.query("INSERT INTO sleep_records (user_id,sleep_date,sleep_start,wake_time,duration_minutes,quality_score,created_at,updated_at) VALUES (1,'2026-09-21','2026-09-20 15:00:00','2026-09-20 23:00:00',480,4,NOW(),NOW())");
  const summary = await api<{ specialized: { water: { cups: number; status: string }; morningWriting: { completed: boolean }; sleep: { recorded: boolean; durationMinutes: number } } }>("/habits/summary?date=2026-09-21");
  assert.deepEqual(summary.data.specialized, { water: { cups: 6, targetCups: 8, status: "PARTIAL" }, morningWriting: { completed: true }, sleep: { recorded: true, durationMinutes: 480, qualityScore: 4 } });
  assert.equal(await scalar("SELECT COUNT(*) FROM habit_occurrences"), 0);
});

test("search indexes definitions only, export preserves versions and archive keeps history", async () => {
  const habit = await createHabit({ name: "Needle Habit" }); await createHabit({ name: "Private Needle" }, op(), 933);
  const foreignDetail = await api(`/habits/${habit.data.id}`, {}, 933); assert.equal(foreignDetail.response.status, 404);
  await api(`/habits/${habit.data.id}/occurrences`, { method: "POST", body: JSON.stringify({ operationId: op(), occurrenceDate: "2026-09-21", recordTimezone: "Asia/Shanghai", expectedVersion: 0 }) });
  await api(`/habits/${habit.data.id}/state`, { method: "PUT", body: JSON.stringify({ operationId: op(), expectedVersion: 1, effectiveFrom: "2026-09-22", action: "archive" }) });
  const search = await api<{ items: Array<{ type: string; id: number; deepLink: string }> }>("/search?q=Needle&type=habit"); assert.deepEqual(search.data.items.map((item) => item.id), [habit.data.id]); assert.equal(search.data.items[0].deepLink, `/routines?habit=${habit.data.id}`);
  const exported = await api<{ recordCount: number; content: string }>("/exports/habits?format=json&includeTrash=false"); assert.match(exported.data.content, /habit_definition/); assert.match(exported.data.content, /habit_rule_version/); assert.match(exported.data.content, /habit_goal_version/); assert.match(exported.data.content, /habit_occurrence/); assert.doesNotMatch(exported.data.content, /Private Needle/);
  assert.equal(await scalar("SELECT COUNT(*) FROM habit_occurrences WHERE habit_id=?", [habit.data.id]), 1);
});
