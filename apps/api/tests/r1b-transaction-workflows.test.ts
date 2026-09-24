import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test, { after, beforeEach } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
if (!new URL(testDatabaseUrl).pathname.slice(1).endsWith("_test")) throw new Error("TEST_DATABASE_URL must end in _test");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "r1b-tests-only-secret";

const [{ pool }, workSession, taskCompletion, assignments, manualActual, readModel, enums, appModule, auth] = await Promise.all([
  import("../src/db/index.js"),
  import("../src/work-session.js"),
  import("../src/task-completion.js"),
  import("../src/task-assignments.js"),
  import("../src/manual-actual.js"),
  import("../src/execution-read-model.js"),
  import("../src/enums.js"),
  import("../src/app.js"),
  import("../src/auth.js")
]);

const { startTaskSession, acceptAndStartTask, pauseWorkSession, resumeWorkSession, finishWorkSession, cancelWorkSession } = workSession;
const { completeTask, reopenTask, archiveTask } = taskCompletion;
const { acceptTaskForDate, releaseAssignment, replaceAssignmentsForDate, resolveContinuation } = assignments;
const { recordManualActual, correctManualActual, cancelManualActual } = manualActual;
const { actualTimeForUser, currentSessionForUser } = readModel;
const { AssignmentStatus, ContinuationState, TaskStatus, TimerStatus } = enums;
const { app } = appModule;
const { signToken } = auth;

let operationCounter = 0;
const op = () => `00000000-0000-4000-8000-${String(++operationCounter).padStart(12, "0")}`;
const at = (value: string) => new Date(value);

async function rows<T>(sql: string, values: unknown[] = []) {
  const [result] = await pool.query(sql, values);
  return result as T[];
}

async function scalar(sql: string, values: unknown[] = []) {
  const [row] = await rows<Record<string, number>>(sql, values);
  return Number(Object.values(row)[0]);
}

async function insertTask(title = "R1B task", status = TaskStatus.TODO) {
  const [result] = await pool.query(
    `INSERT INTO tasks (user_id, category_id, title, priority, difficulty, status, pinned, progress_percent, version, sort_order, created_at, updated_at)
     VALUES (1, 1, ?, 2, 2, ?, 0, 0, 1, 1, '2026-09-18 00:00:00', '2026-09-18 00:00:00')`,
    [title, status]
  );
  return Number((result as { insertId: number }).insertId);
}

async function insertAssignment(taskId: number, taskDate = "2026-09-18", state = ContinuationState.PENDING) {
  const [result] = await pool.query(
    `INSERT INTO task_daily_assignments
      (user_id, task_id, task_date, assignment_status, record_timezone, sort_order, continuation_state, version, created_at, updated_at)
     VALUES (1, ?, ?, 0, 'Asia/Shanghai', 1, ?, 1, NOW(), NOW())`,
    [taskId, taskDate, state]
  );
  return Number((result as { insertId: number }).insertId);
}

beforeEach(async () => {
  await pool.query("DROP TRIGGER IF EXISTS r1b_fail_session_insert");
  await pool.query("DROP TRIGGER IF EXISTS r1b_fail_reward_insert");
  await pool.query("UPDATE user_execution_slots SET active_session_id = NULL, version = version + 1 WHERE user_id = 1");
  for (const table of ["reward_events", "user_growth", "mutation_receipts", "task_completion_events", "schedule_carryovers", "schedules", "timer_segments", "timer_sessions", "task_daily_assignments", "tasks", "projects"]) {
    await pool.query(`DELETE FROM ${table}`);
  }
  await pool.query("UPDATE users SET timezone = 'Asia/Shanghai' WHERE id = 1");
});

after(async () => {
  await pool.query("DROP TRIGGER IF EXISTS r1b_fail_session_insert");
  await pool.query("DROP TRIGGER IF EXISTS r1b_fail_reward_insert");
  await pool.end();
});

test("V19 retains its frozen R1A migration bytes", async () => {
  const contents = await readFile(resolve(process.cwd(), "../../db/migration/V19__add_vnext_domain_semantics.sql"));
  assert.equal(createHash("sha256").update(contents).digest("hex"), "daac9ac8adf77651d04b6bd0c26280471f61554204424972ef13154ff543feda");
});

test("operationId replays an identical request and rejects changed parameters", async () => {
  const taskId = await insertTask();
  const operationId = op();
  const command = { userId: 1, operationId, taskId, taskDate: "2026-09-18", recordTimezone: "Asia/Shanghai" };
  const first = await acceptTaskForDate(command);
  assert.deepEqual(await acceptTaskForDate(command), first);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM mutation_receipts WHERE committed_at IS NOT NULL"), 1);
  await assert.rejects(
    () => acceptTaskForDate({ ...command, taskDate: "2026-09-19" }),
    (error: unknown) => (error as { status?: number }).status === 409
  );
});

test("a failed command rolls back its receipt and can be retried exactly once", async () => {
  const taskId = await insertTask();
  const operationId = op();
  await pool.query("CREATE TRIGGER r1b_fail_session_insert BEFORE INSERT ON timer_sessions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected session failure'");
  const command = { userId: 1, operationId, taskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") };
  await assert.rejects(() => acceptAndStartTask(command), /injected session failure/);
  assert.equal(await scalar("SELECT COUNT(*) FROM mutation_receipts"), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_sessions"), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments"), 0);
  await pool.query("DROP TRIGGER r1b_fail_session_insert");
  const result = await acceptAndStartTask(command);
  assert.deepEqual(await acceptAndStartTask(command), result);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_sessions"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_segments"), 1);
});

test("the execution slot serializes concurrent starts", async () => {
  const firstTask = await insertTask("first");
  const secondTask = await insertTask("second");
  const results = await Promise.allSettled([
    acceptAndStartTask({ userId: 1, operationId: op(), taskId: firstTask, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") }),
    acceptAndStartTask({ userId: 1, operationId: op(), taskId: secondTask, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") })
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_sessions"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM user_execution_slots WHERE user_id = 1 AND active_session_id IS NOT NULL"), 1);
});

test("paused sessions retain the slot while finish and cancel release it", async () => {
  const taskId = await insertTask();
  const started = await acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") });
  const paused = await pauseWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: 1, now: at("2026-09-18T01:10:00Z") });
  const blockedTaskId = await insertTask("blocked");
  await assert.rejects(
    () => acceptAndStartTask({ userId: 1, operationId: op(), taskId: blockedTaskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:11:00Z") }),
    (error: unknown) => (error as { status?: number }).status === 409
  );
  await finishWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: paused.version, now: at("2026-09-18T01:12:00Z") });
  assert.equal(await scalar("SELECT COUNT(*) FROM user_execution_slots WHERE user_id = 1 AND active_session_id IS NULL"), 1);

  const second = await acceptAndStartTask({ userId: 1, operationId: op(), taskId: await insertTask("cancelled"), expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T02:00:00Z") });
  await cancelWorkSession({ userId: 1, operationId: op(), sessionId: second.id, expectedVersion: 1, now: at("2026-09-18T02:05:00Z") });
  assert.equal(await scalar("SELECT COUNT(*) FROM user_execution_slots WHERE user_id = 1 AND active_session_id IS NULL"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_segments WHERE timer_session_id = ? AND status = 2", [second.id]), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_id = ?", [String(second.id)]), 0);
});

test("slot/session inconsistency is an explicit repair conflict", async () => {
  const taskId = await insertTask();
  const started = await acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") });
  await pool.query("UPDATE user_execution_slots SET active_session_id = NULL WHERE user_id = 1");
  await assert.rejects(
    () => pauseWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: 1, now: at("2026-09-18T01:05:00Z") }),
    (error: unknown) => (error as Error).message.includes("repair")
  );
  assert.equal(await scalar("SELECT status FROM timer_sessions WHERE id = ?", [started.id]), TimerStatus.RUNNING);
});

test("pause/resume cycles create exact segments and exclude pause gaps", async () => {
  const taskId = await insertTask();
  const started = await acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") });
  const pause1 = await pauseWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: 1, now: at("2026-09-18T01:10:00Z") });
  const resumeOp1 = op();
  const resume1 = await resumeWorkSession({ userId: 1, operationId: resumeOp1, sessionId: started.id, expectedVersion: pause1.version, now: at("2026-09-18T01:20:00Z") });
  assert.deepEqual(await resumeWorkSession({ userId: 1, operationId: resumeOp1, sessionId: started.id, expectedVersion: pause1.version, now: at("2026-09-18T01:20:00Z") }), resume1);
  const pause2 = await pauseWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: resume1.version, now: at("2026-09-18T01:30:00Z") });
  const resumeOp2 = op();
  const resume2 = await resumeWorkSession({ userId: 1, operationId: resumeOp2, sessionId: started.id, expectedVersion: pause2.version, now: at("2026-09-18T01:40:00Z") });
  assert.deepEqual(await resumeWorkSession({ userId: 1, operationId: resumeOp2, sessionId: started.id, expectedVersion: pause2.version, now: at("2026-09-18T01:40:00Z") }), resume2);
  const finish = await finishWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: resume2.version, now: at("2026-09-18T01:50:00Z") });
  assert.equal(finish.durationSeconds, 1800);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_segments WHERE timer_session_id = ?", [started.id]), 3);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_segments WHERE timer_session_id = ? AND status = 1", [started.id]), 3);
});

test("cross-midnight segments produce one projection per business date", async () => {
  await pool.query("UPDATE users SET timezone = 'Asia/Shanghai' WHERE id = 1");
  const taskId = await insertTask();
  const started = await acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T15:50:00Z") });
  const finished = await finishWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: 1, now: at("2026-09-18T16:10:00Z") });
  assert.equal(finished.durationSeconds, 1200);
  const projections = await rows<{ sliceDate: string }>("SELECT DATE_FORMAT(slice_date, '%Y-%m-%d') AS sliceDate FROM schedules WHERE timer_session_id = ? ORDER BY slice_date", [started.id]);
  assert.deepEqual(projections.map((row) => row.sliceDate), ["2026-09-18", "2026-09-19"]);
});

test("finish replay is stable, defaults to time-only, and rewards once", async () => {
  const taskId = await insertTask();
  const started = await acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") });
  const operationId = op();
  const command = { userId: 1, operationId, sessionId: started.id, expectedVersion: 1, now: at("2026-09-18T01:30:00Z") };
  const first = await finishWorkSession(command);
  assert.deepEqual(await finishWorkSession(command), first);
  assert.equal(first.taskCompleted, false);
  assert.equal(await scalar("SELECT status FROM tasks WHERE id = ?", [taskId]), TaskStatus.IN_PROGRESS);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE event_key = ?", [`timer:1:${started.id}`]), 1);
  await assert.rejects(
    () => finishWorkSession({ ...command, operationId: op() }),
    (error: unknown) => (error as { status?: number }).status === 409
  );
});

test("authenticated Timer routes enforce the R1B command contract", async () => {
  const taskId = await insertTask();
  await insertAssignment(taskId);
  const headers = {
    Authorization: `Bearer ${signToken({ id: 1, username: "owner", displayName: "Owner" })}`,
    "Content-Type": "application/json"
  };
  const startedResponse = await app.request("/api/timer-sessions/start", {
    method: "POST",
    headers,
    body: JSON.stringify({ operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-18" })
  });
  assert.equal(startedResponse.status, 200);
  const started = (await startedResponse.json()) as { data: { id: number; version: number } };
  const finishResponse = await app.request(`/api/timer-sessions/${started.data.id}/finish`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ operationId: op(), expectedVersion: started.data.version })
  });
  assert.equal(finishResponse.status, 200);
  const finished = (await finishResponse.json()) as { data: { taskCompleted: boolean; status: number } };
  assert.equal(finished.data.taskCompleted, false);
  assert.equal(finished.data.status, TimerStatus.FINISHED);
});

test("direct completion retries, reopen creates a second event, and first reward remains unique", async () => {
  const taskId = await insertTask();
  const operationId = op();
  const first = await completeTask({ userId: 1, operationId, taskId, expectedVersion: 1, completedAt: at("2026-09-18T01:00:00Z") });
  assert.deepEqual(await completeTask({ userId: 1, operationId, taskId, expectedVersion: 1, completedAt: at("2026-09-18T01:00:00Z") }), first);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_completion_events WHERE task_id = ?", [taskId]), 1);
  await reopenTask({ userId: 1, operationId: op(), taskId, expectedVersion: 2 });
  await completeTask({ userId: 1, operationId: op(), taskId, expectedVersion: 3, completedAt: at("2026-09-20T01:00:00Z") });
  assert.equal(await scalar("SELECT COUNT(*) FROM task_completion_events WHERE task_id = ?", [taskId]), 2);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE event_key = ?", [`task_done:1:${taskId}`]), 1);
});

test("complete-and-finish commits time, completion, rewards, and slot release atomically", async () => {
  const taskId = await insertTask();
  const started = await acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") });
  const result = await finishWorkSession({ userId: 1, operationId: op(), sessionId: started.id, expectedVersion: 1, completeTask: true, expectedTaskVersion: started.taskVersion, now: at("2026-09-18T01:30:00Z") });
  assert.equal(result.taskCompleted, true);
  assert.equal(await scalar("SELECT status FROM tasks WHERE id = ?", [taskId]), TaskStatus.DONE);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_completion_events WHERE task_id = ?", [taskId]), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE source_id IN (?, ?)", [String(taskId), String(started.id)]), 2);
  assert.equal(await scalar("SELECT COUNT(*) FROM user_execution_slots WHERE user_id = 1 AND active_session_id IS NULL"), 1);
});

test("failure inside complete-and-finish rolls back every fact and receipt", async () => {
  const taskId = await insertTask();
  const started = await acceptAndStartTask({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") });
  await pool.query("CREATE TRIGGER r1b_fail_reward_insert BEFORE INSERT ON reward_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected reward failure'");
  const operationId = op();
  await assert.rejects(
    () => finishWorkSession({ userId: 1, operationId, sessionId: started.id, expectedVersion: 1, completeTask: true, expectedTaskVersion: started.taskVersion, now: at("2026-09-18T01:30:00Z") }),
    /injected reward failure/
  );
  assert.equal(await scalar("SELECT status FROM timer_sessions WHERE id = ?", [started.id]), TimerStatus.RUNNING);
  assert.equal(await scalar("SELECT status FROM timer_segments WHERE timer_session_id = ?", [started.id]), 0);
  assert.equal(await scalar("SELECT status FROM tasks WHERE id = ?", [taskId]), TaskStatus.IN_PROGRESS);
  assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE timer_session_id = ?", [started.id]), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_completion_events"), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM mutation_receipts WHERE operation_id = ?", [operationId]), 0);
});

test("assignment accept is stable and release preserves historical time", async () => {
  const taskId = await insertTask();
  const accepted = await acceptTaskForDate({ userId: 1, operationId: op(), taskId, taskDate: "2026-09-18", recordTimezone: "Asia/Shanghai" });
  const acceptedAgain = await acceptTaskForDate({ userId: 1, operationId: op(), taskId, taskDate: "2026-09-18", recordTimezone: "Asia/Shanghai" });
  assert.equal(acceptedAgain.id, accepted.id);
  await recordManualActual({ userId: 1, operationId: op(), taskId, title: "time", startedAt: at("2026-09-18T01:00:00Z"), endedAt: at("2026-09-18T01:30:00Z"), recordTimezone: "Asia/Shanghai", includeInActualTime: true });
  await releaseAssignment({ userId: 1, operationId: op(), assignmentId: accepted.id, expectedVersion: accepted.version });
  assert.equal(await scalar("SELECT assignment_status FROM task_daily_assignments WHERE id = ?", [accepted.id]), AssignmentStatus.RELEASED);
  assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE task_id = ? AND deleted_at IS NULL", [taskId]), 1);
});

test("legacy daily selection delegates to the Assignment owner without deleting history", async () => {
  const firstTask = await insertTask("first daily");
  const secondTask = await insertTask("second daily");
  await replaceAssignmentsForDate({ userId: 1, taskDate: "2026-09-18", taskIds: [firstTask, secondTask], recordTimezone: "Asia/Shanghai" });
  await pool.query("UPDATE task_daily_assignments SET continuation_state = 4 WHERE task_id = ?", [firstTask]);
  await replaceAssignmentsForDate({ userId: 1, taskDate: "2026-09-18", taskIds: [secondTask], recordTimezone: "Asia/Shanghai" });
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE task_date = '2026-09-18'"), 2);
  assert.equal(await scalar("SELECT assignment_status FROM task_daily_assignments WHERE task_id = ?", [firstTask]), AssignmentStatus.RELEASED);
  assert.equal(await scalar("SELECT continuation_state FROM task_daily_assignments WHERE task_id = ?", [firstTask]), ContinuationState.DISMISSED);
  assert.equal(await scalar("SELECT assignment_status FROM task_daily_assignments WHERE task_id = ?", [secondTask]), AssignmentStatus.ACCEPTED);
});

test("continuation resolutions are atomic and preserve one target assignment", async () => {
  const taskId = await insertTask();
  const firstSource = await insertAssignment(taskId, "2026-09-16");
  const secondSource = await insertAssignment(taskId, "2026-09-17");
  const carried = await resolveContinuation({
    userId: 1,
    operationId: op(),
    sources: [{ id: firstSource, expectedVersion: 1 }, { id: secondSource, expectedVersion: 1 }],
    resolution: ContinuationState.CARRIED_FORWARD,
    targetDate: "2026-09-18",
    targetTimezone: "Asia/Shanghai"
  });
  assert.ok(carried.targetAssignmentId);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE task_id = ? AND task_date = '2026-09-18'", [taskId]), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE id IN (?, ?) AND continuation_state = 2", [firstSource, secondSource]), 2);

  const rescheduleSource = await insertAssignment(taskId, "2026-09-19");
  const rescheduled = await resolveContinuation({ userId: 1, operationId: op(), sources: [{ id: rescheduleSource, expectedVersion: 1 }], resolution: ContinuationState.RESCHEDULED, targetDate: "2026-09-20", targetTimezone: "Asia/Shanghai", startTime: "09:00", endTime: "10:00" });
  assert.ok(rescheduled.targetAssignmentId);
  assert.ok(rescheduled.targetScheduleId);
  assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE id = ? AND kind = 0", [rescheduled.targetScheduleId]), 1);
});

test("continuation version conflict performs no partial update", async () => {
  const taskId = await insertTask();
  const first = await insertAssignment(taskId, "2026-09-16");
  const second = await insertAssignment(taskId, "2026-09-17");
  await pool.query("UPDATE task_daily_assignments SET version = 2 WHERE id = ?", [second]);
  await assert.rejects(
    () => resolveContinuation({ userId: 1, operationId: op(), sources: [{ id: first, expectedVersion: 1 }, { id: second, expectedVersion: 1 }], resolution: ContinuationState.DISMISSED }),
    (error: unknown) => (error as { status?: number }).status === 409
  );
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE id IN (?, ?) AND continuation_state = 1", [first, second]), 2);
});

test("deferred visibility, dismissal, completion, archive, and reopen preserve resolution", async () => {
  const taskId = await insertTask();
  const deferred = await insertAssignment(taskId, "2026-09-16");
  await resolveContinuation({ userId: 1, operationId: op(), sources: [{ id: deferred, expectedVersion: 1 }], resolution: ContinuationState.DEFERRED, targetDate: "2026-09-20", targetTimezone: "Asia/Shanghai" });
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE id = ? AND continuation_state = 3 AND continuation_target_date <= '2026-09-19'", [deferred]), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE id = ? AND continuation_state = 3 AND continuation_target_date <= '2026-09-20'", [deferred]), 1);
  const dismissed = await insertAssignment(taskId, "2026-09-17");
  await resolveContinuation({ userId: 1, operationId: op(), sources: [{ id: dismissed, expectedVersion: 1 }], resolution: ContinuationState.DISMISSED });
  const pending = await insertAssignment(taskId, "2026-09-18");
  await completeTask({ userId: 1, operationId: op(), taskId, expectedVersion: 1, completedAt: at("2026-09-18T03:00:00Z") });
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE id IN (?, ?, ?) AND continuation_state = 4", [deferred, dismissed, pending]), 3);
  await reopenTask({ userId: 1, operationId: op(), taskId, expectedVersion: 2 });
  assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE id IN (?, ?, ?) AND continuation_state = 4", [deferred, dismissed, pending]), 3);

  const archiveTaskId = await insertTask("archive");
  const archivePending = await insertAssignment(archiveTaskId, "2026-09-18");
  await archiveTask({ userId: 1, operationId: op(), taskId: archiveTaskId, expectedVersion: 1 });
  assert.equal(await scalar("SELECT continuation_state FROM task_daily_assignments WHERE id = ?", [archivePending]), ContinuationState.DISMISSED);
});

test("Manual Actual is independent, correctable, cancellable, and overlap-aware", async () => {
  const taskId = await insertTask();
  const recorded = await recordManualActual({ userId: 1, operationId: op(), taskId, title: "manual", startedAt: at("2026-09-18T01:00:00Z"), endedAt: at("2026-09-18T01:30:00Z"), recordTimezone: "Asia/Shanghai", includeInActualTime: true });
  assert.equal(await scalar("SELECT status FROM tasks WHERE id = ?", [taskId]), TaskStatus.TODO);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_segments"), 0);
  let actual = await actualTimeForUser(1, "2026-09-18", "Asia/Shanghai");
  assert.equal(actual.reduce((total, entry) => total + entry.durationSeconds, 0), 1800);
  await correctManualActual({ userId: 1, operationId: op(), scheduleId: recorded.id, expectedVersion: 1, taskId, title: "manual", startedAt: at("2026-09-18T01:00:00Z"), endedAt: at("2026-09-18T02:00:00Z"), recordTimezone: "Asia/Shanghai", includeInActualTime: true });
  actual = await actualTimeForUser(1, "2026-09-18", "Asia/Shanghai");
  assert.equal(actual.reduce((total, entry) => total + entry.durationSeconds, 0), 3600);

  const excluded = await recordManualActual({ userId: 1, operationId: op(), title: "overlap note", startedAt: at("2026-09-18T01:15:00Z"), endedAt: at("2026-09-18T01:45:00Z"), recordTimezone: "Asia/Shanghai", includeInActualTime: false });
  assert.equal((await actualTimeForUser(1, "2026-09-18", "Asia/Shanghai")).length, 1);
  await assert.rejects(
    () => recordManualActual({ userId: 1, operationId: op(), title: "bad overlap", startedAt: at("2026-09-18T01:15:00Z"), endedAt: at("2026-09-18T01:45:00Z"), recordTimezone: "Asia/Shanghai", includeInActualTime: true }),
    (error: unknown) => (error as { status?: number }).status === 409
  );
  await cancelManualActual({ userId: 1, operationId: op(), scheduleId: excluded.id, expectedVersion: 1 });
  assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE id = ? AND deleted_at IS NOT NULL", [excluded.id]), 1);
});

test("Manual Actual plus completion is one atomic workflow", async () => {
  const taskId = await insertTask();
  const result = await recordManualActual({ userId: 1, operationId: op(), taskId, expectedTaskVersion: 1, completeTask: true, startedAt: at("2026-09-18T01:00:00Z"), endedAt: at("2026-09-18T01:30:00Z"), recordTimezone: "Asia/Shanghai", includeInActualTime: true });
  assert.equal(result.taskCompleted, true);
  assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE task_id = ?", [taskId]), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM task_completion_events WHERE task_id = ?", [taskId]), 1);

  const failingTask = await insertTask("manual rollback");
  await pool.query("CREATE TRIGGER r1b_fail_reward_insert BEFORE INSERT ON reward_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected reward failure'");
  await assert.rejects(() => recordManualActual({ userId: 1, operationId: op(), taskId: failingTask, expectedTaskVersion: 1, completeTask: true, startedAt: at("2026-09-18T03:00:00Z"), endedAt: at("2026-09-18T03:30:00Z"), recordTimezone: "Asia/Shanghai", includeInActualTime: true }), /injected reward failure/);
  assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE task_id = ?", [failingTask]), 0);
  assert.equal(await scalar("SELECT status FROM tasks WHERE id = ?", [failingTask]), TaskStatus.TODO);
});

test("timezone snapshots remain stable across setting changes", async () => {
  const firstTask = await insertTask("Shanghai");
  const first = await acceptAndStartTask({ userId: 1, operationId: op(), taskId: firstTask, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T01:00:00Z") });
  await pool.query("UPDATE users SET timezone = 'Asia/Tokyo' WHERE id = 1");
  await finishWorkSession({ userId: 1, operationId: op(), sessionId: first.id, expectedVersion: 1, now: at("2026-09-18T01:05:00Z") });
  assert.equal((await rows<{ timezone: string }>("SELECT record_timezone AS timezone FROM timer_sessions WHERE id = ?", [first.id]))[0].timezone, "Asia/Shanghai");
  const secondTask = await insertTask("Tokyo");
  const second = await acceptAndStartTask({ userId: 1, operationId: op(), taskId: secondTask, expectedTaskVersion: 1, taskDate: "2026-09-18", now: at("2026-09-18T02:00:00Z") });
  assert.equal((await rows<{ timezone: string }>("SELECT record_timezone AS timezone FROM timer_sessions WHERE id = ?", [second.id]))[0].timezone, "Asia/Tokyo");
});

test("legacy PAUSED sessions remain frozen, unlinked, and once-counted", async () => {
  const taskId = await insertTask();
  for (let index = 0; index < 11; index += 1) {
    await pool.query(
      `INSERT INTO timer_sessions (user_id, task_id, session_model, record_timezone, category_id, start_time, end_time, duration_minutes, status, created_at, updated_at)
       VALUES (1, ?, 0, 'Asia/Shanghai', 1, DATE_ADD('2026-09-18 01:00:00', INTERVAL ? HOUR), DATE_ADD('2026-09-18 01:30:00', INTERVAL ? HOUR), 30, 1, NOW(), NOW())`,
      [taskId, index, index]
    );
    await pool.query(
      `INSERT INTO schedules (user_id, task_id, category_id, schedule_date, record_timezone, start_time, end_time, actual_started_at, actual_ended_at,
       title, completed, kind, source, source_id, actual_time_class, include_in_actual_time, project_attribution_status, category_id_at_occurrence, category_attribution_status, created_at, updated_at)
       VALUES (1, ?, 1, '2026-09-18', 'Asia/Shanghai', '09:00:00', '09:30:00', DATE_ADD('2026-09-18 01:00:00', INTERVAL ? HOUR), DATE_ADD('2026-09-18 01:30:00', INTERVAL ? HOUR),
       'legacy', 1, 1, 1, NULL, 2, 1, 1, 1, 2, NOW(), NOW())`,
      [taskId, index, index]
    );
  }
  assert.equal(await currentSessionForUser(1), null);
  assert.equal(await scalar("SELECT COUNT(*) FROM timer_segments"), 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE actual_time_class = 2 AND timer_session_id IS NULL AND timer_segment_id IS NULL"), 11);
  const actual = await actualTimeForUser(1, "2026-09-18", "Asia/Shanghai");
  assert.equal(actual.filter((entry) => entry.source === "LEGACY_ACTUAL").length, 11);
  const legacySessionId = (await rows<{ id: number }>("SELECT id FROM timer_sessions ORDER BY id LIMIT 1"))[0].id;
  await assert.rejects(
    () => resumeWorkSession({ userId: 1, operationId: op(), sessionId: legacySessionId, expectedVersion: 1, now: at("2026-09-18T12:30:00Z") }),
    (error: unknown) => (error as { status?: number }).status === 409
  );
});
