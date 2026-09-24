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

  const [{ pool }, enums, dailyCarryover, appModule, auth] = await Promise.all([
    import("../src/db/index.js"),
    import("../src/enums.js"),
    import("../src/daily-carryover.js"),
    import("../src/app.js"),
    import("../src/auth.js")
  ]);
  const { applyDailyCarryover } = dailyCarryover;
  const { app } = appModule;
  const { signToken } = auth;
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

  async function insertDailyAssignment(taskId: number, taskDate: string, userId = 1) {
    const now = new Date("2026-09-18T01:00:00.000Z");
    await pool.query(
      `INSERT INTO task_daily_assignments (user_id, task_id, task_date, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [userId, taskId, taskDate, now, now]
    );
  }

  async function insertPlannedSchedule(taskId: number, scheduleDate: string, userId = 1) {
    const now = new Date("2026-09-18T01:00:00.000Z");
    const [result] = await pool.query(
      `INSERT INTO schedules
        (user_id, task_id, category_id, schedule_date, start_time, end_time, title, completed, kind, source, source_id, created_at, updated_at)
       VALUES (?, ?, 7, ?, '09:00:00', '10:00:00', 'Carryover plan', 0, 0, 2, NULL, ?, ?)`,
      [userId, taskId, scheduleDate, now, now]
    );
    return Number((result as { insertId: number }).insertId);
  }

  function authHeaders(userId = 1) {
    return { Authorization: `Bearer ${signToken({ id: userId, username: `user-${userId}`, displayName: `User ${userId}` })}` };
  }

  async function getDashboard(targetDate: string, userId = 1) {
    const response = await app.request(`/api/dashboard?date=${targetDate}`, { headers: authHeaders(userId) });
    assert.equal(response.status, 200);
    return (await response.json()) as {
      data: {
        dailyTaskIds: number[];
        schedules: Array<{ taskId: number | null }>;
        growth: { level: number; xpTotal: number; coins: number; xpInLevel: number; xpForNextLevel: number };
      };
    };
  }

  async function getRewards(userId = 1) {
    const response = await app.request("/api/rewards", { headers: authHeaders(userId) });
    assert.equal(response.status, 200);
    return (await response.json()) as {
      data: { growth: { level: number; xpTotal: number; coins: number; xpInLevel: number; xpForNextLevel: number } };
    };
  }

  const readTables = [
    "ai_insights",
    "decision_records",
    "journals",
    "media_watch_records",
    "morning_writings",
    "psychological_bridges",
    "quick_notes",
    "reward_events",
    "reward_items",
    "reward_redemptions",
    "schedule_carryovers",
    "schedules",
    "sleep_records",
    "stock_reviews",
    "task_categories",
    "task_daily_assignments",
    "task_completion_events",
    "tasks",
    "timer_segments",
    "timer_sessions",
    "mutation_receipts",
    "user_execution_slots",
    "user_growth",
    "users",
    "weekly_summaries",
    "water_records"
  ] as const;

  const updatedAtTables = [
    { table: "ai_insights", key: "id" },
    { table: "decision_records", key: "id" },
    { table: "journals", key: "id" },
    { table: "media_watch_records", key: "id" },
    { table: "morning_writings", key: "id" },
    { table: "psychological_bridges", key: "id" },
    { table: "quick_notes", key: "id" },
    { table: "reward_items", key: "id" },
    { table: "schedules", key: "id" },
    { table: "sleep_records", key: "id" },
    { table: "stock_reviews", key: "id" },
    { table: "task_categories", key: "id" },
    { table: "task_daily_assignments", key: "id" },
    { table: "tasks", key: "id" },
    { table: "timer_segments", key: "id" },
    { table: "timer_sessions", key: "id" },
    { table: "user_execution_slots", key: "user_id" },
    { table: "user_growth", key: "user_id" },
    { table: "users", key: "id" },
    { table: "weekly_summaries", key: "id" },
    { table: "water_records", key: "id" }
  ] as const;

  async function readPuritySnapshot() {
    const counts = Object.fromEntries(
      await Promise.all(readTables.map(async (table) => [table, await scalar(`SELECT COUNT(*) FROM ${table}`)] as const))
    );
    const updatedAt = Object.fromEntries(
      await Promise.all(
        updatedAtTables.map(async ({ table, key }) => [
          table,
          await rows<{ rowKey: string; updatedAt: Date }>(`SELECT CAST(${key} AS CHAR) AS rowKey, updated_at AS updatedAt FROM ${table} ORDER BY ${key}`)
        ] as const)
      )
    );
    return { counts, updatedAt };
  }

  // Test the real migration schema; never replace it with fixture DDL.
  beforeEach(async () => {
    await pool.query("DROP TRIGGER IF EXISTS fail_reward_insert");
    await pool.query("DROP TRIGGER IF EXISTS fail_carryover_marker_insert");
    await pool.query("UPDATE user_execution_slots SET active_session_id = NULL WHERE user_id = 1");
    for (const table of ["reward_events", "user_growth", "mutation_receipts", "task_completion_events", "schedule_carryovers", "schedules", "timer_segments", "timer_sessions", "task_daily_assignments", "tasks", "projects"]) {
      await pool.query(`DELETE FROM ${table}`);
    }
  });
  after(async () => {
    await pool.query("DROP TRIGGER IF EXISTS fail_reward_insert");
    await pool.query("DROP TRIGGER IF EXISTS fail_carryover_marker_insert");
    await pool.end();
  });

  test("Dashboard GET is observational and does not initialize carryover or growth", async () => {
    const taskId = await insertTask();
    await insertDailyAssignment(taskId, "2026-09-17");
    await insertPlannedSchedule(taskId, "2026-09-17");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await getDashboard("2026-09-18");
      assert.deepEqual(response.data.dailyTaskIds, []);
      assert.equal(response.data.schedules.length, 0);
      assert.deepEqual(response.data.growth, { level: 1, xpTotal: 0, coins: 0, xpInLevel: 0, xpForNextLevel: 50 });
    }

    assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE task_date = '2026-09-18'"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE schedule_date = '2026-09-18'"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedule_carryovers WHERE carry_date = '2026-09-18'"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM user_growth"), 0);
  });

  test("Rewards and Dashboard GETs preserve business row counts and update timestamps", async () => {
    const taskId = await insertTask();
    await insertDailyAssignment(taskId, "2026-09-17");
    await insertPlannedSchedule(taskId, "2026-09-17");

    const emptyGrowthSnapshot = await readPuritySnapshot();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rewards = await getRewards();
      const dashboard = await getDashboard("2026-09-18");
      assert.deepEqual(rewards.data.growth, { level: 1, xpTotal: 0, coins: 0, xpInLevel: 0, xpForNextLevel: 50 });
      assert.deepEqual(dashboard.data.growth, rewards.data.growth);
    }
    assert.deepEqual(await readPuritySnapshot(), emptyGrowthSnapshot);

    const growthTimestamp = new Date("2026-09-18T01:30:00.000Z");
    await pool.query(
      "INSERT INTO user_growth (user_id, level, xp_total, coins, created_at, updated_at) VALUES (1, 2, 75, 9, ?, ?)",
      [growthTimestamp, growthTimestamp]
    );
    const existingGrowthSnapshot = await readPuritySnapshot();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rewards = await getRewards();
      const dashboard = await getDashboard("2026-09-18");
      assert.deepEqual(rewards.data.growth, { level: 2, xpTotal: 75, coins: 9, xpInLevel: 25, xpForNextLevel: 200 });
      assert.deepEqual(dashboard.data.growth, rewards.data.growth);
    }
    assert.deepEqual(await readPuritySnapshot(), existingGrowthSnapshot);
  });

  test("Daily carryover endpoint is retry-safe and Dashboard returns the prepared state", async () => {
    const taskId = await insertTask();
    const fromScheduleId = await insertPlannedSchedule(taskId, "2026-09-17");
    await insertDailyAssignment(taskId, "2026-09-17");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.request("/api/daily-carryovers", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: "2026-09-18" })
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { code: 0, message: "ok", data: { targetDate: "2026-09-18" } });
    }

    assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE task_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE schedule_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedule_carryovers WHERE from_schedule_id = ? AND carry_date = '2026-09-18'", [fromScheduleId]), 1);
    const dashboard = await getDashboard("2026-09-18");
    assert.deepEqual(dashboard.data.dailyTaskIds, [taskId]);
    assert.equal(dashboard.data.schedules.filter((schedule) => schedule.taskId === taskId).length, 1);
  });

  test("Concurrent daily carryover does not duplicate assignments, plans, or markers", async () => {
    const taskId = await insertTask();
    await insertDailyAssignment(taskId, "2026-09-17");
    await insertPlannedSchedule(taskId, "2026-09-17");

    const command = { userId: 1, targetDate: "2026-09-18" };
    await Promise.all([applyDailyCarryover(command), applyDailyCarryover(command)]);

    assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE user_id = 1 AND task_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE user_id = 1 AND schedule_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedule_carryovers WHERE user_id = 1 AND carry_date = '2026-09-18'"), 1);
  });

  test("Daily carryover isolates users and target dates", async () => {
    const userOneTaskId = await insertTask(1);
    const userTwoTaskId = await insertTask(2);
    await insertDailyAssignment(userOneTaskId, "2026-09-17", 1);
    await insertDailyAssignment(userTwoTaskId, "2026-09-17", 2);
    await insertPlannedSchedule(userOneTaskId, "2026-09-17", 1);
    await insertPlannedSchedule(userTwoTaskId, "2026-09-17", 2);

    await applyDailyCarryover({ userId: 1, targetDate: "2026-09-18" });

    assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE user_id = 1 AND task_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE user_id = 1 AND schedule_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE user_id = 2 AND task_date = '2026-09-18'"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE user_id = 2 AND schedule_date = '2026-09-18'"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE task_date = '2026-09-19'"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE schedule_date = '2026-09-19'"), 0);
  });

  test("Independent assignment commit survives plan rollback and the command retry completes safely", async () => {
    const taskId = await insertTask();
    await insertDailyAssignment(taskId, "2026-09-17");
    await insertPlannedSchedule(taskId, "2026-09-17");
    await pool.query(
      "CREATE TRIGGER fail_carryover_marker_insert BEFORE INSERT ON schedule_carryovers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced carryover marker failure'"
    );

    await assert.rejects(
      () => applyDailyCarryover({ userId: 1, targetDate: "2026-09-18" }),
      /forced carryover marker failure/
    );
    assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE task_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE schedule_date = '2026-09-18'"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedule_carryovers WHERE carry_date = '2026-09-18'"), 0);

    await pool.query("DROP TRIGGER fail_carryover_marker_insert");
    await applyDailyCarryover({ userId: 1, targetDate: "2026-09-18" });
    assert.equal(await scalar("SELECT COUNT(*) FROM task_daily_assignments WHERE task_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedules WHERE schedule_date = '2026-09-18'"), 1);
    assert.equal(await scalar("SELECT COUNT(*) FROM schedule_carryovers WHERE carry_date = '2026-09-18'"), 1);
  });
}
