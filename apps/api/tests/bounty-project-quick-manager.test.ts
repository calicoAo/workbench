import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.endsWith("_test")) throw new Error("Require an isolated TEST_DATABASE_URL ending in _test");
const source = new URL(sourceUrl), database = `workbench_bounty_project_${process.pid}_test`;
let admin: Connection, pool: Pool, app: typeof import("../src/app.js").app;
let token: string, foreignToken: string;
type Category = { id: number; name: string; color: string; dimensionKey: string | null; targetMinutes: number };
async function api<T>(path: string, method = "GET", body?: unknown, status = 200, auth = token): Promise<T> {
  const response = await app.request(`/api${path}`, { method, headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const json = await response.json() as { data: T; message: string };
  assert.equal(response.status, status, json.message); return json.data;
}
before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await admin.query(`USE \`${database}\``);
  const directory = resolve(process.cwd(), "../../db/migration");
  const version = (name: string) => { const m = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(m[1]), Number(m[2] ?? 0)]; };
  const migrations = (await readdir(directory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1] || a.localeCompare(b));
  for (const migration of migrations) await admin.query(await readFile(resolve(directory, migration), "utf8"));
  const appUrl = new URL(sourceUrl); appUrl.pathname = `/${database}`;
  process.env.NODE_ENV = "test"; process.env.DATABASE_URL = appUrl.toString(); process.env.JWT_SECRET = "bounty-category-tests-only-secret";
  [{ pool }, { app }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js")]);
  const { signToken } = await import("../src/auth.js"); token = signToken({ id: 1, username: "bounty", displayName: "Bounty" });
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (991,'bounty-foreign','Foreign','Asia/Shanghai',NOW(),NOW())");
  foreignToken = signToken({ id: 991, username: "bounty-foreign", displayName: "Foreign" });
});
after(async () => { await pool?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); } });

test("mapped Category and canonical Project publish together with intact draft in both modes", async () => {
  const dimension = await api<{ dimensionKey: string }>("/growth/dimensions", "POST", { name: "组合流程成长维度", color: "#8B5CF6", sortOrder: 12 });
  const initialConfig = await api<{ dimensions: { dimensionKey: string; enabled: number }[] }>("/growth/dimensions");
  assert.equal(initialConfig.dimensions.find((row) => row.dimensionKey === dimension.dimensionKey)?.enabled, 1);
  const category = await api<Category>("/task-categories", "POST", { name: "组合流程分类", color: "#EC4899", dimensionKey: dimension.dimensionKey });
  const project = await api<{ id: number; version: number; status: number }>("/projects", "POST", { name: "悬赏内项目", notes: "保留笔记", startDate: "2026-10-01", targetDate: "2026-12-31" });
  assert.equal(project.version, 1); assert.equal(project.status, 0);
  const detail = await api<{ project: { id: number; notes: string } }>(`/projects/${project.id}`);
  assert.equal(detail.project.id, project.id); assert.equal(detail.project.notes, "保留笔记");
  const [categoryRows] = await pool.query("SELECT dimension_key FROM task_categories WHERE id=?", [category.id]);
  assert.equal((categoryRows as { dimension_key: string }[])[0].dimension_key, dimension.dimensionKey);
  const [beforeTasks] = await pool.query("SELECT COUNT(*) n FROM tasks WHERE project_id=? OR category_id=?", [project.id, category.id]);
  assert.equal((beforeTasks as { n: number }[])[0].n, 0);
  for (const claim of [false, true]) {
    const command = { operationId: randomUUID(), title: `组合发布 ${claim}`, description: "完整草稿", projectId: project.id, categoryId: category.id, priority: 3, difficulty: 4, estimatedMinutes: 45, progressPercent: 20, dueAt: "2026-10-20T19:30", recordTimezone: "Asia/Shanghai", ...(claim ? { acceptDate: "2026-10-12" } : {}) };
    const task = await api<{ id: number }>("/tasks", "POST", command);
    const replay = await api<{ id: number }>("/tasks", "POST", command);
    assert.equal(replay.id, task.id);
    const [rows] = await pool.query("SELECT project_id,category_id,title,description,priority,difficulty,estimated_minutes,progress_percent,DATE_FORMAT(due_at,'%Y-%m-%d %H:%i') due_at FROM tasks WHERE id=?", [task.id]);
    assert.deepEqual((rows as Record<string, unknown>[])[0], { project_id: project.id, category_id: category.id, title: command.title, description: "完整草稿", priority: 3, difficulty: 4, estimated_minutes: 45, progress_percent: 20, due_at: "2026-10-20 11:30" });
    const [assignments] = await pool.query("SELECT DATE_FORMAT(task_date,'%Y-%m-%d') task_date FROM task_daily_assignments WHERE task_id=?", [task.id]);
    assert.deepEqual(assignments, claim ? [{ task_date: "2026-10-12" }] : []);
    const config = await api<{ dimensions: { dimensionKey: string; enabled: number }[]; categories: Category[] }>("/growth/dimensions");
    assert.equal(config.categories.find((row) => row.id === category.id)?.dimensionKey, dimension.dimensionKey);
    assert.equal(config.dimensions.find((row) => row.dimensionKey === dimension.dimensionKey)?.enabled, 1);
  }
  for (const [table, name, expected] of [["task_categories", "组合流程分类", 1], ["projects", "悬赏内项目", 1], ["tasks", "组合发布 %", 2]] as const) {
    const column = table === "tasks" ? "title" : "name";
    const [rows] = await pool.query(`SELECT COUNT(*) n FROM ${table} WHERE user_id=1 AND ${column} LIKE ?`, [name]);
    assert.equal((rows as { n: number }[])[0].n, expected);
  }
});

test("metadata patch preserves notes/dates and stale expectedVersion cannot overwrite", async () => {
  const project = await api<{ id: number }>("/projects", "POST", { name: "轻量编辑", notes: "隐藏笔记", startDate: "2026-10-01", targetDate: "2026-12-31", priority: 3 });
  const updated = await api<{ version: number }>(`/projects/${project.id}`, "PUT", { expectedVersion: 1, name: "更新名称" });
  assert.equal(updated.version, 2);
  await api(`/projects/${project.id}`, "PUT", { expectedVersion: 1, notes: "过期覆盖" }, 409);
  const detail = await api<{ project: Record<string, unknown> }>(`/projects/${project.id}`);
  for (const [key, value] of Object.entries({ name: "更新名称", notes: "隐藏笔记", startDate: "2026-10-01", targetDate: "2026-12-31", priority: 3, version: 2 })) assert.equal(detail.project[key], value);
});

test("foreign, archived and DONE associations reject; failed Task does not rollback saved Project", async () => {
  const fresh = () => api<{ id: number }>("/projects", "POST", { name: "独立持久化" });
  const owned = await fresh();
  await api("/tasks", "POST", { operationId: randomUUID(), title: "越权", projectId: owned.id, recordTimezone: "Asia/Shanghai" }, 404, foreignToken);
  await api(`/projects/${owned.id}`, "PUT", { expectedVersion: 1, name: "越权改名" }, 404, foreignToken);
  const archived = await fresh(); await api(`/projects/${archived.id}/archive`, "PUT", { expectedVersion: 1 });
  const done = await fresh(); await api(`/projects/${done.id}/status`, "PUT", { expectedVersion: 1, status: 3 });
  for (const [id, status] of [[archived.id, 404], [done.id, 409]]) await api("/tasks", "POST", { operationId: randomUUID(), title: "不可关联", projectId: id, recordTimezone: "Asia/Shanghai" }, status);
  const active = await api<{ id: number }[]>("/projects?view=active");
  assert.ok(Array.isArray(active)); assert.ok(active.some((row) => row.id === done.id));
  await api("/tasks", "POST", { operationId: randomUUID(), title: "", projectId: owned.id, recordTimezone: "Asia/Shanghai" }, 400);
  const after = await api<{ project: { id: number; name: string } }>(`/projects/${owned.id}`);
  assert.equal(after.project.id, owned.id); assert.equal(after.project.name, "独立持久化");
  const retry = await api<{ id: number }>("/tasks", "POST", { operationId: randomUUID(), title: "重试只发布", projectId: owned.id, recordTimezone: "Asia/Shanghai" });
  const [rows] = await pool.query("SELECT project_id FROM tasks WHERE id=?", [retry.id]); assert.equal((rows as { project_id: number }[])[0].project_id, owned.id);
});
