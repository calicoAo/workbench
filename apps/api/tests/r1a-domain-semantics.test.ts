import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test, { after, before } from "node:test";
import mysql, { type Connection } from "mysql2/promise";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const sourceUrl = new URL(testDatabaseUrl);
if (!sourceUrl.pathname.slice(1).endsWith("_test")) throw new Error("TEST_DATABASE_URL must end in _test");

const suffix = `${process.pid}`;
const freshDatabase = `workbench_r1a_fresh_${suffix}_test`;
const fixtureDatabase = `workbench_r1a_fixture_${suffix}_test`;
const v20FixtureDatabase = `workbench_r1a_v20_${suffix}_test`;
const migrationDirectory = resolve(process.cwd(), "../../db/migration");
let admin: Connection;
let closeExecutionPool: (() => Promise<void>) | undefined;

function migrationVersion(name: string) {
  const match = /^V(\d+)(?:_(\d+))?__/.exec(name);
  if (!match) return [Number.MAX_SAFE_INTEGER, 0];
  return [Number(match[1]), Number(match[2] ?? 0)];
}

async function migrationFiles() {
  return (await readdir(migrationDirectory))
    .filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name))
    .sort((left, right) => {
      const [leftMajor, leftMinor] = migrationVersion(left);
      const [rightMajor, rightMinor] = migrationVersion(right);
      return leftMajor - rightMajor || leftMinor - rightMinor;
    });
}

async function applyMigrations(connection: Connection, database: string, maximumMajor = Number.MAX_SAFE_INTEGER, minimumMajor = 1) {
  await connection.query(`USE \`${database}\``);
  for (const name of await migrationFiles()) {
    if (migrationVersion(name)[0] > maximumMajor || migrationVersion(name)[0] < minimumMajor) continue;
    await connection.query(await readFile(resolve(migrationDirectory, name), "utf8"));
  }
}

async function scalar(connection: Connection, sql: string, values: unknown[] = []) {
  const [rows] = await connection.query(sql, values);
  return Number(Object.values((rows as Record<string, unknown>[])[0])[0]);
}

async function seedProductionLikeFixture(connection: Connection) {
  await connection.query("USE `" + fixtureDatabase + "`");
  for (let index = 1; index <= 21; index += 1) {
    const done = index <= 11;
    await connection.query(
      `INSERT INTO tasks (user_id, category_id, title, priority, difficulty, status, pinned, progress_percent, sort_order, completed_at, created_at, updated_at)
       VALUES (1, 1, ?, 2, 2, ?, 0, ?, ?, ?, '2026-09-01 01:00:00', '2026-09-01 01:00:00')`,
      [`Fixture task ${index}`, done ? 2 : 0, done ? 100 : 0, index, done ? `2026-09-${String(index).padStart(2, "0")} 01:00:00` : null]
    );
  }
  for (let index = 0; index < 72; index += 1) {
    await connection.query(
      `INSERT INTO task_daily_assignments (user_id, task_id, task_date, sort_order, created_at, updated_at)
       VALUES (1, ?, DATE_ADD('2026-06-01', INTERVAL ? DAY), 1, '2026-09-01 01:00:00', '2026-09-01 01:00:00')`,
      [(index % 21) + 1, index]
    );
  }
  for (let index = 1; index <= 11; index += 1) {
    await connection.query(
      `INSERT INTO timer_sessions (user_id, task_id, category_id, start_time, end_time, duration_minutes, status, created_at, updated_at)
       VALUES (1, ?, 1, '2026-08-01 01:00:00', '2026-08-01 02:00:00', 60, 1, '2026-08-01 01:00:00', '2026-08-01 02:00:00')`,
      [index]
    );
    await connection.query(
      `INSERT INTO schedules (user_id, task_id, category_id, schedule_date, start_time, end_time, title, completed, kind, source, source_id, created_at, updated_at)
       VALUES (1, ?, 1, DATE_ADD('2026-08-01', INTERVAL ? DAY), '09:00:00', '10:00:00', ?, 1, 1, 1, NULL, '2026-08-01 01:00:00', '2026-08-01 02:00:00')`,
      [index, index - 1, `Legacy timer ${index}`]
    );
  }
  await connection.query(
    `INSERT INTO reward_events (user_id, event_key, source_type, source_id, event_date, xp_delta, coin_delta, reason, created_at)
     VALUES (1, 'fixture:reward', 'fixture', '1', '2026-08-01', 1, 1, 'fixture', '2026-08-01 01:00:00')`
  );
  await connection.query(
    `INSERT INTO quick_notes (user_id, note_date, title, content, tag, created_at, updated_at)
     VALUES (1, '2026-08-01', 'Fixture note', 'Preserve this note through forward migrations', 'fixture', '2026-08-02 01:00:00', '2026-08-02 01:00:00')`
  );
}

before(async () => {
  admin = await mysql.createConnection({
    host: sourceUrl.hostname,
    port: Number(sourceUrl.port || 3306),
    user: decodeURIComponent(sourceUrl.username),
    password: decodeURIComponent(sourceUrl.password),
    multipleStatements: true,
    timezone: "Z"
  });
  await admin.query(`CREATE DATABASE \`${freshDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`CREATE DATABASE \`${fixtureDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`CREATE DATABASE \`${v20FixtureDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await applyMigrations(admin, freshDatabase);
  await applyMigrations(admin, fixtureDatabase, 18);
  await seedProductionLikeFixture(admin);
  await applyMigrations(admin, fixtureDatabase, 22, 19);
  await applyMigrations(admin, v20FixtureDatabase, 19);
  await admin.query(`USE \`${v20FixtureDatabase}\``);
  const [sessionResult] = await admin.query(
    `INSERT INTO timer_sessions (user_id, task_id, session_model, record_timezone, start_time, end_time, duration_minutes, status, created_at, updated_at)
     VALUES (1, 1, 1, 'Asia/Shanghai', '2026-09-18 01:00:00', '2026-09-18 01:30:00', 30, 2, NOW(), NOW())`
  );
  const sessionId = Number((sessionResult as { insertId: number }).insertId);
  const [segmentResult] = await admin.query(
    `INSERT INTO timer_segments (user_id, timer_session_id, task_id, status, started_at, ended_at, business_date, record_timezone,
     project_attribution_status, category_attribution_status, task_title_snapshot)
     VALUES (1, ?, 1, 1, '2026-09-18 01:00:00', '2026-09-18 01:30:00', '2026-09-18', 'Asia/Shanghai', 1, 1, 'V19 projection')`,
    [sessionId]
  );
  const segmentId = Number((segmentResult as { insertId: number }).insertId);
  await admin.query(
    `INSERT INTO schedules (user_id, task_id, schedule_date, record_timezone, start_time, end_time, actual_started_at, actual_ended_at,
     title, completed, kind, source, source_id, actual_time_class, timer_session_id, timer_segment_id, slice_date,
     project_attribution_status, category_attribution_status, created_at, updated_at)
     VALUES (1, 1, '2026-09-18', 'Asia/Shanghai', '09:00:00', '09:30:00', '2026-09-18 01:00:00', '2026-09-18 01:30:00',
     'V19 projection', 1, 1, 1, 'v19-projection', 3, ?, ?, '2026-09-18', 1, 1, NOW(), NOW())`,
    [sessionId, segmentId]
  );
  await applyMigrations(admin, v20FixtureDatabase, 20, 20);
});

after(async () => {
  await closeExecutionPool?.();
  await admin.query(`DROP DATABASE IF EXISTS \`${freshDatabase}\``);
  await admin.query(`DROP DATABASE IF EXISTS \`${fixtureDatabase}\``);
  await admin.query(`DROP DATABASE IF EXISTS \`${v20FixtureDatabase}\``);
  await admin.end();
});

test("fresh migration exposes the frozen R1A schema and constraints", async () => {
  await admin.query(`USE \`${freshDatabase}\``);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('timer_segments','user_execution_slots','task_completion_events','mutation_receipts')"), 4);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM user_execution_slots WHERE user_id = 1 AND active_session_id IS NULL"), 1);
  await assert.rejects(() => admin.query("INSERT INTO user_execution_slots (user_id, active_session_id) VALUES (1, NULL)"), /Duplicate entry/);

  const [timer] = await admin.query(
    `INSERT INTO timer_sessions (user_id, task_id, session_model, record_timezone, start_time, duration_minutes, status, created_at, updated_at)
     VALUES (1, 1, 1, 'Asia/Tokyo', '2026-09-18 00:00:00', 0, 1, NOW(), NOW())`
  );
  const sessionId = Number((timer as { insertId: number }).insertId);
  for (const day of ["2026-09-18", "2026-09-19"]) {
    await admin.query(
      `INSERT INTO timer_segments (user_id, timer_session_id, task_id, status, started_at, ended_at, business_date, record_timezone,
       project_id_at_occurrence, project_attribution_status, category_id_at_occurrence, category_attribution_status, task_title_snapshot)
       VALUES (1, ?, 1, 1, ?, ?, ?, 'Asia/Tokyo', NULL, 1, NULL, 1, 'Fixture')`,
      [sessionId, `${day} 00:00:00`, `${day} 00:30:00`, day]
    );
  }
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM timer_segments WHERE timer_session_id = ?", [sessionId]), 2);
  const [segments] = await admin.query("SELECT id, business_date AS businessDate FROM timer_segments WHERE timer_session_id = ? ORDER BY id", [sessionId]);
  for (const segment of segments as Array<{ id: number; businessDate: Date }>) {
    const sliceDate = segment.businessDate.toISOString().slice(0, 10);
    await admin.query(
      `INSERT INTO schedules (user_id, task_id, schedule_date, record_timezone, start_time, end_time, actual_started_at, actual_ended_at,
       title, completed, kind, source, actual_time_class, include_in_actual_time, timer_session_id, timer_segment_id, slice_date,
       project_attribution_status, category_attribution_status, created_at, updated_at)
       VALUES (1, 1, ?, 'Asia/Tokyo', '09:00:00', '09:30:00', '2026-09-18 00:00:00', '2026-09-18 00:30:00',
       'Projection', 1, 1, 1, 3, 0, ?, ?, ?, 1, 1, NOW(), NOW())`,
      [sliceDate, sessionId, segment.id, sliceDate]
    );
    await assert.rejects(() => admin.query(
      `INSERT INTO schedules (user_id, task_id, schedule_date, record_timezone, start_time, end_time, actual_started_at, actual_ended_at, title, completed, kind, source,
       actual_time_class, include_in_actual_time, timer_session_id, timer_segment_id, slice_date, project_attribution_status, category_attribution_status, created_at, updated_at)
       VALUES (1, 1, ?, 'Asia/Tokyo', '09:00:00', '09:30:00', '2026-09-18 00:00:00', '2026-09-18 00:30:00', 'Duplicate', 1, 1, 1, 3, 0, ?, ?, ?, 1, 1, NOW(), NOW())`,
      [sliceDate, sessionId, segment.id, sliceDate]
    ), /Duplicate entry/);
  }

  await admin.query(
    `INSERT INTO mutation_receipts (user_id, operation_id, command_type, contract_version, request_fingerprint, request_snapshot)
     VALUES (1, 'operation-1', 'finishSession', 1, REPEAT('a', 64), JSON_OBJECT('completeTask', false))`
  );
  await assert.rejects(() => admin.query(
    `INSERT INTO mutation_receipts (user_id, operation_id, command_type, contract_version, request_fingerprint, request_snapshot)
     VALUES (1, 'operation-1', 'finishSession', 1, REPEAT('b', 64), JSON_OBJECT('completeTask', true))`
  ), /Duplicate entry/);
  const [receiptRows] = await admin.query("SELECT request_fingerprint AS fingerprint, request_snapshot AS snapshot FROM mutation_receipts WHERE operation_id = 'operation-1'");
  assert.equal((receiptRows as Array<{ fingerprint: string }>)[0].fingerprint, "a".repeat(64));
});

test("production-like migration preserves legacy identity and classifies without guessing", async () => {
  await admin.query(`USE \`${fixtureDatabase}\``);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM tasks"), 21);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM task_daily_assignments"), 72);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM task_daily_assignments WHERE continuation_state = 0"), 72);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM task_daily_assignments WHERE continuation_state = 1"), 0);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM timer_sessions WHERE session_model = 0 AND status = 1"), 11);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM timer_segments"), 0);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM user_execution_slots WHERE active_session_id IS NOT NULL"), 0);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM schedules WHERE source = 1 AND source_id IS NULL AND timer_segment_id IS NULL AND actual_time_class = 2"), 11);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM reward_events"), 1);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM quick_notes WHERE content = 'Preserve this note through forward migrations' AND version = 1 AND archived_at IS NULL AND deleted_at IS NULL"), 1);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM schedules WHERE include_in_actual_time = 1"), 11);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM task_completion_events WHERE source = 0"), 11);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM task_completion_events"), 11);
  const [completionRows] = await admin.query(
    "SELECT DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s') AS occurredAt, DATE_FORMAT(business_date, '%Y-%m-%d') AS businessDate FROM task_completion_events WHERE task_id = 1"
  );
  assert.deepEqual((completionRows as Array<{ occurredAt: string; businessDate: string }>)[0], {
    occurredAt: "2026-08-31 17:00:00",
    businessDate: "2026-09-01"
  });

  await admin.query("UPDATE users SET timezone = 'Asia/Tokyo' WHERE id = 1");
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM task_daily_assignments WHERE record_timezone = 'Asia/Shanghai'"), 72);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM timer_sessions WHERE record_timezone = 'Asia/Shanghai'"), 11);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM task_completion_events WHERE record_timezone = 'Asia/Shanghai'"), 11);

  await admin.query(
    `INSERT INTO task_completion_events (user_id, task_id, occurred_at, record_timezone, business_date, lifecycle_version, operation_id, source)
     VALUES (1, 1, '2026-09-14 01:00:00', 'Asia/Tokyo', '2026-09-14', 2, 'complete-again', 1)`
  );
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM task_completion_events WHERE task_id = 1"), 2);
});

test("V20 excludes pre-existing V19 TIMER projections from aggregate truth", async () => {
  await admin.query(`USE \`${v20FixtureDatabase}\``);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM schedules WHERE actual_time_class = 3 AND include_in_actual_time = 0"), 1);
  await assert.rejects(
    () => admin.query("UPDATE schedules SET include_in_actual_time = 1 WHERE actual_time_class = 3"),
    /constraint|check/i
  );
});

test("timezone conversion is deterministic and handles DST day length", async () => {
  const { businessDateAt, businessDayBoundsUtc, localDateTimeToUtc } = await import("../src/time.js");
  const instant = new Date("2026-09-18T15:30:00.000Z");
  assert.equal(businessDateAt(instant, "UTC"), "2026-09-18");
  assert.equal(businessDateAt(instant, "Asia/Shanghai"), "2026-09-18");
  assert.equal(businessDateAt(instant, "Asia/Tokyo"), "2026-09-19");
  assert.equal(localDateTimeToUtc("2026-09-19", "00:30", "Asia/Tokyo").toISOString(), "2026-09-18T15:30:00.000Z");
  const springForward = businessDayBoundsUtc("2026-03-08", "America/New_York");
  assert.equal((springForward.end.getTime() - springForward.start.getTime()) / 3_600_000, 23);
});

test("ActualTime excludes TIMER projections and legacy PAUSED sessions are not current", async () => {
  await admin.query(`USE \`${fixtureDatabase}\``);
  const [sessionResult] = await admin.query(
    `INSERT INTO timer_sessions (user_id, task_id, session_model, record_timezone, start_time, end_time, duration_minutes, status, created_at, updated_at)
     VALUES (1, 1, 1, 'Asia/Shanghai', '2026-09-18 02:00:00', '2026-09-18 02:30:00', 0, 2, NOW(), NOW())`
  );
  const sessionId = Number((sessionResult as { insertId: number }).insertId);
  const [segmentResult] = await admin.query(
    `INSERT INTO timer_segments (user_id, timer_session_id, task_id, status, started_at, ended_at, business_date, record_timezone,
     project_id_at_occurrence, project_attribution_status, category_id_at_occurrence, category_attribution_status, task_title_snapshot)
     VALUES (1, ?, 1, 1, '2026-09-18 02:00:00', '2026-09-18 02:30:00', '2026-09-18', 'Asia/Shanghai', NULL, 1, NULL, 1, 'Segment')`,
    [sessionId]
  );
  const segmentId = Number((segmentResult as { insertId: number }).insertId);
  await admin.query(
    `INSERT INTO schedules (user_id, task_id, schedule_date, record_timezone, start_time, end_time, actual_started_at, actual_ended_at,
     title, completed, kind, source, actual_time_class, include_in_actual_time, timer_session_id, timer_segment_id, slice_date,
     project_attribution_status, category_attribution_status, created_at, updated_at)
     VALUES (1, 1, '2026-09-18', 'Asia/Shanghai', '10:00:00', '10:30:00', '2026-09-18 02:00:00', '2026-09-18 02:30:00',
     'Timer projection', 1, 1, 1, 3, 0, ?, ?, '2026-09-18', 1, 1, NOW(), NOW())`,
    [sessionId, segmentId]
  );
  await admin.query(
    `INSERT INTO schedules (user_id, task_id, schedule_date, record_timezone, start_time, end_time, actual_started_at, actual_ended_at,
     title, completed, kind, source, actual_time_class, project_attribution_status, category_attribution_status, created_at, updated_at)
     VALUES (1, 1, '2026-09-18', 'Asia/Shanghai', '09:00:00', '10:00:00', '2026-09-18 01:00:00', '2026-09-18 02:00:00',
     'Manual actual', 1, 1, 0, 1, 1, 1, NOW(), NOW())`
  );
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM schedules WHERE actual_time_class IN (1, 2)"), 12);
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM schedules WHERE actual_time_class = 3"), 1);
  assert.equal(await scalar(admin,
    `SELECT COUNT(*) FROM (
       SELECT id FROM timer_segments WHERE status = 1 AND deleted_at IS NULL
       UNION ALL
       SELECT id FROM schedules WHERE actual_time_class IN (1, 2) AND deleted_at IS NULL
     ) actual_time`
  ), 13);
  assert.equal(await scalar(admin, "SELECT COUNT(DISTINCT project_attribution_status) FROM schedules WHERE actual_time_class IN (1, 2)"), 2);
  assert.equal(await scalar(admin,
    `SELECT COUNT(*) FROM user_execution_slots slot
     JOIN timer_sessions session ON session.id = slot.active_session_id
     WHERE slot.user_id = 1 AND session.session_model = 1 AND session.status IN (0, 1) AND session.deleted_at IS NULL`
  ), 0);

  const readModelUrl = new URL(testDatabaseUrl);
  readModelUrl.pathname = `/${fixtureDatabase}`;
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = readModelUrl.toString();
  process.env.JWT_SECRET = "r1a-read-model-test-secret";
  const [{ actualTimeForUser, currentSessionForUser }, { pool }, { app }, { signToken }] = await Promise.all([
    import("../src/execution-read-model.js"),
    import("../src/db/index.js"),
    import("../src/app.js"),
    import("../src/auth.js")
  ]);
  closeExecutionPool = () => pool.end();
  const registration = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `r1a_${process.pid}`, password: "r1a-secret", displayName: "R1A" })
  });
  assert.equal(registration.status, 200);
  const registrationBody = await registration.json() as { data: { user: { id: number; timezone: string } } };
  assert.equal(registrationBody.data.user.timezone, "Asia/Shanghai");
  assert.equal(await scalar(admin, "SELECT COUNT(*) FROM user_execution_slots WHERE user_id = ?", [registrationBody.data.user.id]), 1);

  const headers = { Authorization: `Bearer ${signToken({ id: 1, username: "local", displayName: "Local User" })}` };
  assert.equal(await currentSessionForUser(1), null);
  assert.equal((await app.request("/api/timer-sessions/current", { headers })).status, 200);
  const [pausedResult] = await admin.query(
    `INSERT INTO timer_sessions (user_id, task_id, session_model, record_timezone, start_time, duration_minutes, status, created_at, updated_at)
     VALUES (1, 1, 1, 'Asia/Shanghai', '2026-09-18 03:00:00', 0, 1, NOW(), NOW())`
  );
  const pausedVnextId = Number((pausedResult as { insertId: number }).insertId);
  await admin.query("UPDATE user_execution_slots SET active_session_id = ? WHERE user_id = 1", [pausedVnextId]);
  assert.equal((await currentSessionForUser(1))?.id, pausedVnextId);
  const currentResponse = await app.request("/api/timer-sessions/current", { headers });
  assert.equal(currentResponse.status, 200);
  assert.equal(((await currentResponse.json()) as { data: { id: number } }).data.id, pausedVnextId);
  await admin.query("UPDATE user_execution_slots SET active_session_id = NULL WHERE user_id = 1");
  const actualTime = await actualTimeForUser(1, "2026-09-18", "Asia/Shanghai");
  assert.deepEqual(actualTime.map((entry) => entry.source).sort(), ["MANUAL_ACTUAL", "TIMER_SEGMENT"]);
  const actualResponse = await app.request("/api/timer-sessions/actual-time?date=2026-09-18&timezone=Asia%2FShanghai", { headers });
  assert.equal(actualResponse.status, 200);
  assert.deepEqual(((await actualResponse.json()) as { data: { entries: Array<{ source: string }> } }).data.entries.map((entry) => entry.source).sort(), ["MANUAL_ACTUAL", "TIMER_SEGMENT"]);
});

test("V1-V18 migration bytes retain their audited checksums", async () => {
  const expected: Record<string, string> = {
    V1: "f4fcca48fd34943dd74bfddf8d93afbff1b98d92f7e9a8ec5378b3b3af5587c2", V2: "d6186b8bbf6526e50cc8770d0d3345943e083910356b393fb20c36edb63f7e6c",
    V2_1: "1095c4796412a88bc53bc0f11c9f12aac895993058e33082a9f3a5252cee042d", V3: "177fd0317b1b218ac72265c22a8e6861c3d565df10ddec26cbf882fab8fd12b0",
    V4: "b3f883e3562e80b3812a68cf72c965fbc2d3bac0140c1c70a6dc4b076c07a630", V5: "067d65a45ae3d460b124e2809e8ef2485d490b73122eefb6bbb81ef260790560",
    V6: "ec0c5f4bf8e004608f07aa50832c1f85c1fbec6ebccbeb272bf9afe8668e05f6", V7: "98a358d6fa805ccf1f3dbda06d0af153133423105e9521bdde23c769a3375825",
    V8: "951be25cc4b06db4b6664a7d127e864a8828ae856491acc0106812b446e025d1", V9: "9aad31d3dd999d141e7dc6aea416f9abb5eefee817eedc1c5e4b0905765c5b0f",
    V10: "c9817d80750b6b2c3f21cd258ca4ca7a7c77593eea521a5eb2c780c529f1a0af", V11: "0456a8590de625f05b4e49391e646c368d0d9292e05ebd20468ecc63b1517e86",
    V12: "a0c3aa9ee3c8429265697900e1f5499efcb9cdb9668594b8d4f461379c2a6db9", V13: "e8cfb9d382bbdbe54ffd68768955f9cf7d0bbe6c0ed7ef02a24838eebdef79e2",
    V14: "bbbc29fa5770560c740953fd3970940084fcef68163816634bf58f8dfabee663", V15: "7f313156c40f6a69ff44b6283a81cac56314a557ed0bbab2e51a3a980a362fe5",
    V16: "b9d6bf0857b017ba1e3a40527aeec8b116bff8faf137fb3aef9b0e27b8371075", V17: "8f05fb6d82628d2295a2b1bffbf0081fcb8b64cc6540baff2622e9ed6fddb835",
    V18: "b03d21bc2a0adc3f8aa1d0432ae61677eea830f366418c14dcdaf6d3ae3710db"
  };
  for (const name of await migrationFiles()) {
    if (migrationVersion(name)[0] > 18) continue;
    const key = name.slice(0, name.indexOf("__"));
    const digest = createHash("sha256").update(await readFile(resolve(migrationDirectory, name))).digest("hex");
    assert.equal(digest, expected[key], `${name} changed`);
  }
});
