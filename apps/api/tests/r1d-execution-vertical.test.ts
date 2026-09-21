import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
if (!new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("TEST_DATABASE_URL must end in _test");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "r1d-tests-only-secret";

const [{ pool }, publishing, assignments, workSession, readModel, appModule, auth] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/task-publishing.js"),
  import("../src/task-assignments.js"),
  import("../src/work-session.js"),
  import("../src/execution-read-model.js"),
  import("../src/app.js"),
  import("../src/auth.js")
]);

let operationCounter = 0;
const op = () => `10000000-0000-4000-8000-${String(++operationCounter).padStart(12, "0")}`;
const headers = { Authorization: `Bearer ${auth.signToken({ id: 1, username: "owner", displayName: "Owner" })}`, "Content-Type": "application/json" };

async function rows<T>(sql: string, values: unknown[] = []) { const [result] = await pool.query(sql, values); return result as T[]; }
async function scalar(sql: string, values: unknown[] = []) { const [row] = await rows<Record<string, number>>(sql, values); return Number(Object.values(row)[0]); }
async function insertTask(title: string) {
  const [result] = await pool.query(`INSERT INTO tasks (user_id, category_id, title, priority, difficulty, status, pinned, progress_percent, version, sort_order, created_at, updated_at) VALUES (1, 1, ?, 2, 2, 0, 0, 0, 1, 1, NOW(), NOW())`, [title]);
  return Number((result as { insertId: number }).insertId);
}

beforeEach(async () => {
  await pool.query("DROP TRIGGER IF EXISTS r1d_fail_assignment_insert");
  await pool.query("UPDATE user_execution_slots SET active_session_id = NULL, version = version + 1 WHERE user_id = 1");
  for (const table of ["reward_events", "user_growth", "mutation_receipts", "task_completion_events", "schedules", "timer_segments", "timer_sessions", "task_daily_assignments", "tasks"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("UPDATE users SET timezone = 'Asia/Shanghai' WHERE id = 1");
});

after(async () => { await pool.query("DROP TRIGGER IF EXISTS r1d_fail_assignment_insert"); await pool.end(); });

test("V21 exposes Assignment focus and Planned lifecycle constraints", async () => {
  assert.equal(await scalar("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'task_daily_assignments' AND column_name = 'focus_rank'"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'schedules' AND column_name IN ('lifecycle_state','rescheduled_from_schedule_id')"), 2);
});

test("publish-and-accept is atomic, replayable, and rolls back on assignment failure", async () => {
  const command = { userId: 1, operationId: op(), title: "Atomic bounty", priority: 2 as const, difficulty: 2 as const, estimatedMinutes: 25, progressPercent: 0, acceptDate: "2026-09-20", recordTimezone: "Asia/Shanghai" };
  const first = await publishing.publishTask(command);
  assert.deepEqual(await publishing.publishTask(command), first);
  assert.equal(await scalar("SELECT COUNT(*) FROM tasks WHERE title = 'Atomic bounty'"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE task_id = ?", [first.id]), 1);

  await pool.query("CREATE TRIGGER r1d_fail_assignment_insert BEFORE INSERT ON task_daily_assignments FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected assignment failure'");
  await assert.rejects(() => publishing.publishTask({ ...command, operationId: op(), title: "Rolled back bounty" }), /injected assignment failure/);
  assert.equal(await scalar("SELECT COUNT(*) FROM tasks WHERE title = 'Rolled back bounty'"), 0);
  await pool.query("DROP TRIGGER r1d_fail_assignment_insert");
});

test("focus rank belongs to Assignment, is limited to three, and can be reordered", async () => {
  const taskIds = await Promise.all([1, 2, 3, 4].map((value) => insertTask(`Focus ${value}`)));
  await assignments.replaceAssignmentsForDate({ userId: 1, taskDate: "2026-09-20", taskIds, focusTaskIds: taskIds.slice(0, 3), recordTimezone: "Asia/Shanghai" });
  const first = await rows<{ taskId: number; focusRank: number | null }>("SELECT task_id AS taskId, focus_rank AS focusRank FROM task_daily_assignments ORDER BY focus_rank IS NULL, focus_rank");
  assert.deepEqual(first.slice(0, 3), taskIds.slice(0, 3).map((taskId, index) => ({ taskId, focusRank: index + 1 })));
  await assignments.replaceAssignmentsForDate({ userId: 1, taskDate: "2026-09-20", taskIds, focusTaskIds: [taskIds[2], taskIds[0]], recordTimezone: "Asia/Shanghai" });
  const reordered = await rows<{ taskId: number; focusRank: number }>("SELECT task_id AS taskId, focus_rank AS focusRank FROM task_daily_assignments WHERE focus_rank IS NOT NULL ORDER BY focus_rank");
  assert.deepEqual(reordered, [{ taskId: taskIds[2], focusRank: 1 }, { taskId: taskIds[0], focusRank: 2 }]);
});

test("finish records optional progress and note but leaves Task incomplete", async () => {
  const taskId = await insertTask("Progress finish");
  const started = await workSession.acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-20", now: new Date("2026-09-20T01:00:00Z") });
  const finished = await workSession.finishWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: 1, expectedTaskVersion: started.taskVersion, progressPercent: 45, note: "first pass", now: new Date("2026-09-20T01:30:00Z") });
  assert.equal(finished.taskCompleted, false);
  assert.equal(await scalar("SELECT status FROM tasks WHERE id = ?", [taskId]), 1);
  assert.equal(await scalar("SELECT progress_percent FROM tasks WHERE id = ?", [taskId]), 45);
  assert.equal((await rows<{ note: string }>("SELECT note FROM timer_sessions WHERE id = ?", [started.id]))[0].note, "first pass");
  const daily = await readModel.dailyExecutionForUser(1, "2026-09-20", "Asia/Shanghai");
  assert.equal(daily.summary.focusedSeconds, 1800);
  assert.equal(daily.summary.actualSeconds, 1800);
  assert.equal(daily.summary.completedAssignments, 0);
});

test("a 23:50 to 00:20 Session is attributed as 10m plus 20m in its timezone", async () => {
  const taskId = await insertTask("Cross-day execution");
  const started = await workSession.acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-20", recordTimezone: "Asia/Shanghai", now: new Date("2026-09-20T15:50:00Z") });
  await workSession.finishWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: 1, now: new Date("2026-09-20T16:20:00Z") });
  const dayA = await readModel.dailyExecutionForUser(1, "2026-09-20", "Asia/Shanghai");
  const dayB = await readModel.dailyExecutionForUser(1, "2026-09-21", "Asia/Shanghai");
  assert.equal(dayA.summary.focusedSeconds, 10 * 60);
  assert.equal(dayB.summary.focusedSeconds, 20 * 60);
  assert.equal(dayA.summary.actualSeconds + dayB.summary.actualSeconds, 30 * 60);
});

test("Planned schedules use explicit pending, rescheduled, and cancelled lifecycle", async () => {
  const createdResponse = await appModule.app.request("/api/schedules", { method: "POST", headers, body: JSON.stringify({ operationId: op(), scheduleDate: "2026-09-20", startTime: "09:00", endTime: "10:00", kind: 0, title: "Plan" }) });
  assert.equal(createdResponse.status, 200);
  const created = (await createdResponse.json()) as { data: { id: number; version: number; lifecycleState: number } };
  assert.equal(created.data.lifecycleState, 0);
  const movedResponse = await appModule.app.request(`/api/schedules/${created.data.id}/reschedule`, { method: "POST", headers, body: JSON.stringify({ operationId: op(), expectedVersion: created.data.version, scheduleDate: "2026-09-21", startTime: "10:00", endTime: "11:00", recordTimezone: "Asia/Shanghai", title: "Moved plan" }) });
  assert.equal(movedResponse.status, 200);
  const moved = (await movedResponse.json()) as { data: { id: number; sourceId: number } };
  assert.equal(await scalar("SELECT lifecycle_state FROM schedules WHERE id = ?", [created.data.id]), 3);
  assert.equal(await scalar("SELECT rescheduled_from_schedule_id FROM schedules WHERE id = ?", [moved.data.id]), created.data.id);
  const cancelledResponse = await appModule.app.request(`/api/schedules/${moved.data.id}`, { method: "DELETE", headers, body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) });
  assert.equal(cancelledResponse.status, 200);
  assert.equal(await scalar("SELECT lifecycle_state FROM schedules WHERE id = ?", [moved.data.id]), 2);
});
