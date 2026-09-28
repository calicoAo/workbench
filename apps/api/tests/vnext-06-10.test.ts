import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl);
const fresh = `workbench_vnext_fresh_${process.pid}_test`;
const upgrade = `workbench_vnext_upgrade_${process.pid}_test`;
const migrationDirectory = resolve(process.cwd(), process.cwd().endsWith("/apps/api") ? "../../db/migration" : "db/migration");
let admin: Connection;
let pool: Pool;
let app: typeof import("../src/app.js").app;
let signToken: typeof import("../src/auth.js").signToken;
let token = "";

function version(name: string) { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; }
async function migrate(database: string, from = 1, through = Number.MAX_SAFE_INTEGER) {
  const names = (await readdir(migrationDirectory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((left, right) => version(left)[0] - version(right)[0] || version(left)[1] - version(right)[1]);
  await admin.query(`USE \`${database}\``);
  for (const name of names) if (version(name)[0] >= from && version(name)[0] <= through) await admin.query(await readFile(resolve(migrationDirectory, name), "utf8"));
}
async function api<T = any>(path: string, init: RequestInit = {}) {
  const response = await app.request(`http://localhost/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = await response.json() as { data: T; message: string };
  return { response, data: body.data, message: body.message };
}
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Array<Record<string, unknown>>)[0])[0]); }
function localDate(timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function shiftDate(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
async function insertActual(date: string, minutes: number) {
  const [rows] = await pool.query("SELECT id FROM task_categories WHERE user_id=1 AND name='工作'");
  const categoryId = Number((rows as Array<{ id: number }>)[0].id);
  const hours = String(Math.floor(minutes / 60) + 9).padStart(2, "0");
  const rest = String(minutes % 60).padStart(2, "0");
  const end = `${hours}:${rest}:00`;
  const [result] = await pool.query("INSERT INTO schedules (user_id,category_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,project_attribution_status,category_id_at_occurrence,category_attribution_status,version,created_at,updated_at) VALUES (1,?,?,'Asia/Shanghai','09:00:00',?,CONCAT(?,' 01:00:00'),DATE_ADD(CONCAT(?,' 01:00:00'), INTERVAL ? MINUTE),'真实投入',1,1,1,0,1,1,1,?,2,1,NOW(),NOW())", [categoryId, date, end, date, date, minutes, categoryId]);
  return Number((result as { insertId: number }).insertId);
}

before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${fresh}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`CREATE DATABASE \`${upgrade}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await migrate(fresh);
  await migrate(upgrade, 1, 36);
  await admin.query(`USE \`${upgrade}\``);
  await admin.query("UPDATE users SET display_name='Upgrade Hero' WHERE id=1");
  await migrate(upgrade, 37, 38);
  const url = new URL(sourceUrl); url.pathname = `/${fresh}`;
  process.env.NODE_ENV = "test"; process.env.DATABASE_URL = url.toString(); process.env.JWT_SECRET = "vnext-06-10-tests-only";
  [{ pool }, { app }, { signToken }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
  token = signToken({ id: 1, username: "vnext", displayName: "VNext" });
});

beforeEach(async () => {
  await pool.query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of ["period_reviews", "daily_adventure_snapshots", "hero_daily_entries", "hero_daily_statuses", "onboarding_flow_progress", "journals", "water_records", "habit_occurrences", "habit_definitions", "task_completion_events", "task_daily_assignments", "schedules", "timer_segments", "timer_sessions", "tasks", "reward_events", "user_growth", "growth_dimensions", "task_categories", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("SET FOREIGN_KEY_CHECKS=1");
  await pool.query("UPDATE users SET display_name='Local User', timezone='Asia/Shanghai', deleted_at=NULL WHERE id=1");
  await pool.query("UPDATE hero_profiles SET display_name='Local User', birth_date=NULL, title=NULL, version=1, updated_at=NOW() WHERE user_id=1");
  await pool.query("INSERT INTO growth_dimensions (user_id,dimension_key,name,icon_key,color,sort_order,enabled,version,created_at,updated_at) VALUES (1,'career','事业','briefcase','#3B82F6',10,1,1,NOW(),NOW())");
  await pool.query("INSERT INTO task_categories (user_id,name,color,icon,dimension_key,target_minutes,sort_order,enabled,created_at,updated_at) VALUES (1,'工作','#3B82F6','briefcase','career',6000,10,1,NOW(),NOW())");
});

after(async () => {
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS \`${fresh}\``);
  await admin?.query(`DROP DATABASE IF EXISTS \`${upgrade}\``);
  await admin?.end();
});

test("V37-V38 migrate fresh and upgrade V36 while preserving users", async () => {
  const [tables] = await admin.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='${fresh}' AND table_name IN ('hero_profiles','hero_daily_statuses','hero_daily_entries','daily_adventure_snapshots','period_reviews')`);
  assert.equal((tables as unknown[]).length, 5);
  await admin.query(`USE \`${upgrade}\``);
  const [profiles] = await admin.query("SELECT display_name displayName FROM hero_profiles WHERE user_id=1");
  assert.equal((profiles as Array<{ displayName: string }>)[0].displayName, "Upgrade Hero");
});

test("Hero uses Rewards progress and gates one daily entry behind onboarding", async () => {
  const today = localDate("Asia/Shanghai");
  await pool.query("INSERT INTO user_growth (user_id,level,xp_total,coins,created_at,updated_at) VALUES (1,99,180,27,NOW(),NOW())");
  const profile = await api<any>("/hero");
  const rewards = await api<any>("/rewards");
  assert.deepEqual(profile.data.progress, rewards.data.growth);
  assert.equal((await api<any>("/hero/profile", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, birthDate: shiftDate(today, 1) }) })).response.status, 400);
  assert.equal((await api<any>("/hero/profile", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, birthDate: today }) })).response.status, 200);
  assert.equal((await api<any>(`/hero?date=${today}`)).data.earthOnlineDay, 1);

  await pool.query("INSERT INTO onboarding_flow_progress (user_id,flow_id,flow_version,status,current_step_id,updated_at) VALUES (1,'core-loop',1,'NOT_STARTED','publish',NOW())");
  const blocked = await api<any>("/hero/daily-entry/claim", { method: "POST", body: JSON.stringify({ businessDate: today }) });
  assert.deepEqual([blocked.data.claimed, blocked.data.reason], [false, "ONBOARDING"]);
  await pool.query("UPDATE onboarding_flow_progress SET status='SKIPPED', current_step_id=NULL, skipped_at=NOW() WHERE user_id=1");
  const claims = await Promise.all([api<any>("/hero/daily-entry/claim", { method: "POST", body: JSON.stringify({ businessDate: today }) }), api<any>("/hero/daily-entry/claim", { method: "POST", body: JSON.stringify({ businessDate: today }) })]);
  assert.equal(claims.filter((item) => item.data.claimed).length, 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM hero_daily_entries WHERE user_id=1 AND business_date=?", [today]), 1);
  assert.deepEqual((await api<any>("/hero/daily-entry/claim", { method: "POST", body: JSON.stringify({ businessDate: today }) })).data, { claimed: false, reason: "ALREADY_ENTERED" });
});

test("legacy users are eligible, status is correctable, and timezone dates are enforced", async () => {
  await pool.query("UPDATE users SET timezone='America/Los_Angeles' WHERE id=1");
  const today = localDate("America/Los_Angeles");
  assert.equal((await api<any>("/hero/daily-entry/claim", { method: "POST", body: JSON.stringify({ businessDate: today }) })).data.claimed, true);
  assert.equal((await api<any>("/hero/daily-status", { method: "PUT", body: JSON.stringify({ businessDate: today, periodTimezone: "Asia/Shanghai", statusKey: "GOOD", expectedVersion: 0 }) })).response.status, 409);
  const created = await api<any>("/hero/daily-status", { method: "PUT", body: JSON.stringify({ businessDate: today, periodTimezone: "America/Los_Angeles", statusKey: "GOOD", expectedVersion: 0 }) });
  assert.equal(created.data.version, 1);
  const corrected = await api<any>("/hero/daily-status", { method: "PUT", body: JSON.stringify({ businessDate: today, periodTimezone: "America/Los_Angeles", statusKey: "TIRED", expectedVersion: 1 }) });
  assert.deepEqual([corrected.data.version, corrected.data.statusKey], [2, "TIRED"]);
  assert.equal((await api<any>("/hero/daily-entry/claim", { method: "POST", body: JSON.stringify({ businessDate: shiftDate(today, -1) }) })).response.status, 409);
});

test("Calendar and Growth derive ActualTime summaries without stored scores", async () => {
  await insertActual("2026-09-28", 90);
  const calendar = await api<any>("/schedules/summary?from=2026-09-01&to=2026-09-30&timezone=Asia%2FShanghai");
  assert.equal(calendar.data.days.find((item: any) => item.businessDate === "2026-09-28").actualMinutes, 90);
  const growth = await api<any>("/growth/overview?period=30&to=2026-09-28");
  assert.equal(growth.data.summary.actualMinutes, 90);
  assert.equal(growth.data.trend.reduce((sum: number, item: any) => sum + item.actualMinutes, 0), 90);
  assert.equal("activityScore" in growth.data, false);
});

test("Adventure snapshots are private, deterministic, idempotent, stale-aware, and timezone-versioned", async () => {
  const scheduleId = await insertActual("2026-09-28", 60);
  const secret = "PRIVATE JOURNAL BODY MUST NOT LEAK";
  await pool.query("INSERT INTO journals (user_id,journal_date,content,created_at,updated_at) VALUES (1,'2026-09-28',?,NOW(),NOW())", [secret]);
  const first = await api<any>("/adventure/snapshots/2026-09-28/regenerate", { method: "POST" });
  assert.deepEqual([first.data.version, first.data.snapshotPayload.actualTime.totalMinutes, first.data.snapshotPayload.writing.journalSaved], [1, 60, true]);
  assert.equal(JSON.stringify(first.data).includes(secret), false);
  const replay = await api<any>("/adventure/snapshots/2026-09-28/regenerate", { method: "POST" });
  assert.deepEqual([replay.data.id, replay.data.version], [first.data.id, 1]);

  await pool.query("UPDATE schedules SET end_time='10:30:00', actual_ended_at=DATE_ADD(actual_started_at, INTERVAL 90 MINUTE), updated_at=NOW() WHERE id=?", [scheduleId]);
  const stale = await api<any>("/adventure/snapshots/2026-09-28");
  assert.deepEqual([stale.data.stale, stale.data.snapshot.status], [true, "STALE"]);
  const regenerated = await api<any>("/adventure/snapshots/2026-09-28/regenerate", { method: "POST" });
  assert.deepEqual([regenerated.data.version, regenerated.data.snapshotPayload.actualTime.totalMinutes], [2, 90]);

  await pool.query("UPDATE users SET timezone='America/Los_Angeles' WHERE id=1");
  assert.equal((await api<any>("/adventure/snapshots/2026-09-28")).data.stale, true);
  const timezoneRegeneration = await api<any>("/adventure/snapshots/2026-09-28/regenerate", { method: "POST" });
  assert.deepEqual([timezoneRegeneration.data.version, timezoneRegeneration.data.periodTimezone], [3, "America/Los_Angeles"]);
});

test("Period review preserves user text across deterministic regeneration and rejects stale revisions", async () => {
  await insertActual("2026-09-28", 45);
  const first = await api<any>("/adventure/period-reviews/regenerate", { method: "POST", body: JSON.stringify({ type: "WEEK", anchor: "2026-09-28" }) });
  assert.equal(first.data.version, 1);
  const saved = await api<any>(`/adventure/period-reviews/${first.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, userReviewBody: "我的判断，不可覆盖" }) });
  assert.equal(saved.data.version, 2);
  await pool.query("INSERT INTO water_records (user_id,water_date,cups,target_cups,created_at,updated_at) VALUES (1,'2026-09-28',5,8,NOW(),NOW())");
  assert.equal((await api<any>("/adventure/period-reviews?type=WEEK&anchor=2026-09-28")).data.stale, true);
  const regenerated = await api<any>("/adventure/period-reviews/regenerate", { method: "POST", body: JSON.stringify({ type: "WEEK", anchor: "2026-09-28" }) });
  assert.deepEqual([regenerated.data.version, regenerated.data.userReviewBody, regenerated.data.factsPayload.summary.waterCups], [3, "我的判断，不可覆盖", 5]);
  const replay = await api<any>("/adventure/period-reviews/regenerate", { method: "POST", body: JSON.stringify({ type: "WEEK", anchor: "2026-09-28" }) });
  assert.equal(replay.data.version, 3);
  assert.equal((await api<any>(`/adventure/period-reviews/${first.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 2, userReviewBody: "stale write" }) })).response.status, 409);
});
