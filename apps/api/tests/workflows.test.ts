import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("Set TEST_DATABASE_URL to a migrated, dedicated MySQL database ending in _test");
} else {
  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must name a dedicated database ending in _test");
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "workflow-tests-only-secret";

  const [{ pool }, taskCompletion, workSession, enums] = await Promise.all([
    import("../src/db/index.js"),
    import("../src/task-completion.js"),
    import("../src/work-session.js"),
    import("../src/enums.js")
  ]);
  const { completeTask, completeTaskWithActualTime } = taskCompletion;
  const { finishWorkSession, pauseWorkSession } = workSession;
  const { TaskStatus, TimerStatus } = enums;

  async function rows<T>(sql: string, values: unknown[] = []) {
    const [result] = await pool.query(sql, values);
    return result as T[];
  }

  async function scalar(sql: string, values: unknown[] = []) {
    const [row] = await rows<Record<string, number>>(sql, values);
    return Number(Object.values(row)[0]);
  }

  async function insertTask(userId = 1, status = TaskStatus.TODO) {
    const now = new Date("2026-09-18T01:00:00.000Z");
    const [result] = await pool.query(
      `INSERT INTO tasks (user_id, category_id, title, priority, difficulty, status, pinned, progress_percent, sort_order, created_at, updated_at)
       VALUES (?, 7, 'Workflow test task', 2, 2, ?, 0, 40, 1, ?, ?)`,
      [userId, status, now, now]
    );
    return Number((result as { insertId: number }).insertId);
  }

  async function insertTimer(taskId: number, userId = 1) {
    const start = new Date("2026-09-18T01:00:00.000Z");
    const [result] = await pool.query(
      `INSERT INTO timer_sessions (user_id, task_id, category_id, start_time, duration_minutes, status, created_at, updated_at)
       VALUES (?, ?, 7, ?, 0, ?, ?, ?)`,
      [userId, taskId, start, TimerStatus.RUNNING, start, start]
    );
    return Number((result as { insertId: number }).insertId);
  }

  // Test the real migration schema; never replace it with fixture DDL.
  beforeEach(async () => {
    await pool.query("DROP TRIGGER IF EXISTS fail_reward_insert");
    for (const table of ["reward_events", "user_growth", "schedules", "timer_sessions", "tasks"]) {
      await pool.query(`DELETE FROM ${table}`);
    }
  });
  after(async () => {
    await pool.query("DROP TRIGGER IF EXISTS fail_reward_insert");
    await pool.end();
  });

  test("Task completion persists reflection and is idempotent across retry and reopen", async () => {
    const taskId = await insertTask();
    const command = {
      userId: 1,
      taskId,
      completionKey: "task-command-1",
      scheduleDate: "2026-09-18",
      startTime: "09:00",
      endTime: "10:00",
      completionNote: "Kept the invariant small"
    };

    const first = await completeTaskWithActualTime(command);
    const retry = await completeTaskWithActualTime(command);
    assert.equal(first.scheduleId, retry.scheduleId);
    await assert.rejects(
      () => completeTaskWithActualTime({ ...command, endTime: "10:30" }),
      /completion key is already used/
    );
    const [completed] = await rows<{ status: number; completion_note: string }>("SELECT status, completion_note FROM tasks WHERE id = ?", [taskId]);
    assert.equal(completed.status, TaskStatus.DONE);
    assert.equal(completed.completion_note, command.completionNote);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE task_id = ?", [taskId]), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE event_key = ?", [`task_done:1:${taskId}`]), 1);

    await pool.query("UPDATE tasks SET status = ?, completed_at = NULL WHERE id = ?", [TaskStatus.TODO, taskId]);
    const reopened = await completeTaskWithActualTime({ ...command, completionKey: "task-command-2", startTime: "10:00", endTime: "10:30" });
    assert.equal(reopened.reward, null);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE task_id = ?", [taskId]), 2);
    assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE event_key = ?", [`task_done:1:${taskId}`]), 1);
  });

  test("Task update rolls back when reward persistence fails", async () => {
    const taskId = await insertTask();
    await pool.query("CREATE TRIGGER fail_reward_insert BEFORE INSERT ON reward_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced reward failure'");
    await assert.rejects(() => completeTask({ userId: 1, taskId, completionNote: "must roll back" }), /forced reward failure/);
    const [task] = await rows<{ status: number; completed_at: Date | null; completion_note: string | null }>(
      "SELECT status, completed_at, completion_note FROM tasks WHERE id = ?",
      [taskId]
    );
    assert.equal(task.status, TaskStatus.TODO);
    assert.equal(task.completed_at, null);
    assert.equal(task.completion_note, null);
    assert.equal(await scalar("SELECT COUNT(*) FROM user_growth"), 0);
  });

  test("Timer finish with explicit Task completion commits one combined result and replays it", async () => {
    const taskId = await insertTask();
    const sessionId = await insertTimer(taskId);
    const command = { userId: 1, sessionId, scheduleDate: "2026-09-18", startTime: "09:00", endTime: "10:00", completeTask: true };
    const first = await finishWorkSession(command);
    const retry = await finishWorkSession(command);
    assert.deepEqual(retry, first);
    assert.equal(first.taskCompleted, true);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE source = 1 AND source_id = ?", [String(sessionId)]), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE event_key IN (?, ?)", [`timer:1:${sessionId}`, `task_done:1:${taskId}`]), 2);
    const [session] = await rows<{ status: number; completion_requested: number; task_completed: number }>(
      "SELECT status, completion_requested, task_completed FROM timer_sessions WHERE id = ?",
      [sessionId]
    );
    assert.equal(session.status, TimerStatus.FINISHED);
    assert.equal(session.completion_requested, 1);
    assert.equal(session.task_completed, 1);
    const [task] = await rows<{ status: number }>("SELECT status FROM tasks WHERE id = ?", [taskId]);
    assert.equal(task.status, TaskStatus.DONE);
  });

  test("Concurrent Timer finish establishes one projection and one timer reward", async () => {
    const taskId = await insertTask();
    const sessionId = await insertTimer(taskId);
    const command = { userId: 1, sessionId, scheduleDate: "2026-09-18", startTime: "09:00", endTime: "10:00", completeTask: false };
    const [left, right] = await Promise.all([finishWorkSession(command), finishWorkSession(command)]);
    assert.equal(left.scheduleId, right.scheduleId);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE source = 1 AND source_id = ?", [String(sessionId)]), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE event_key = ?", [`timer:1:${sessionId}`]), 1);
    const [session] = await rows<{ status: number }>("SELECT status FROM timer_sessions WHERE id = ?", [sessionId]);
    assert.equal(session.status, TimerStatus.FINISHED);
    const [task] = await rows<{ status: number }>("SELECT status FROM tasks WHERE id = ?", [taskId]);
    assert.equal(task.status, TaskStatus.TODO);
  });

  test("Combined Timer finish rolls back Timer, projection, rewards, and Task when Task reward persistence fails", async () => {
    const taskId = await insertTask();
    const sessionId = await insertTimer(taskId);
    await pool.query(`CREATE TRIGGER fail_reward_insert BEFORE INSERT ON reward_events FOR EACH ROW
      BEGIN
        IF NEW.source_type = 'task' THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced task reward failure';
        END IF;
      END`);
    await assert.rejects(
      () => finishWorkSession({ userId: 1, sessionId, scheduleDate: "2026-09-18", startTime: "09:00", endTime: "10:00", completeTask: true }),
      /forced task reward failure/
    );
    const [session] = await rows<{ status: number }>("SELECT status FROM timer_sessions WHERE id = ?", [sessionId]);
    const [task] = await rows<{ status: number; completed_at: Date | null }>("SELECT status, completed_at FROM tasks WHERE id = ?", [taskId]);
    assert.equal(session.status, TimerStatus.RUNNING);
    assert.equal(task.status, TaskStatus.TODO);
    assert.equal(task.completed_at, null);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM reward_events"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM user_growth"), 0);
  });

  test("Concurrent pause is deterministic and does not duplicate projection or partial reward", async () => {
    const taskId = await insertTask();
    const sessionId = await insertTimer(taskId);
    const now = new Date("2026-09-18T02:00:00.000Z");
    const [left, right] = await Promise.all([pauseWorkSession({ userId: 1, sessionId, now }), pauseWorkSession({ userId: 1, sessionId, now })]);
    assert.equal(left.scheduleId, right.scheduleId);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE source = 1 AND source_id = ?", [String(sessionId)]), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM reward_events WHERE event_key = ?", [`task_partial:1:${sessionId}`]), 1);
    const [session] = await rows<{ status: number }>("SELECT status FROM timer_sessions WHERE id = ?", [sessionId]);
    assert.equal(session.status, TimerStatus.PAUSED);
  });

  test("Terminal command conflicts are explicit and user ownership is enforced", async () => {
    const taskId = await insertTask(1);
    const sessionId = await insertTimer(taskId, 1);
    await assert.rejects(
      () => completeTaskWithActualTime({ userId: 2, taskId, completionKey: "foreign", scheduleDate: "2026-09-18", startTime: "09:00", endTime: "10:00" }),
      /task not found/
    );
    await assert.rejects(
      () => finishWorkSession({ userId: 2, sessionId, scheduleDate: "2026-09-18", startTime: "09:00", endTime: "10:00", completeTask: false }),
      /timer session not found/
    );
    await finishWorkSession({ userId: 1, sessionId, scheduleDate: "2026-09-18", startTime: "09:00", endTime: "10:00", completeTask: false });
    await assert.rejects(
      () => finishWorkSession({ userId: 1, sessionId, scheduleDate: "2026-09-18", startTime: "09:00", endTime: "10:00", completeTask: true }),
      /different terminal result/
    );
  });
}
