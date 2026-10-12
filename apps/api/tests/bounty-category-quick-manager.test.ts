import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.endsWith("_test")) throw new Error("Require an isolated TEST_DATABASE_URL ending in _test");
const source = new URL(sourceUrl), database = `workbench_bounty_category_${process.pid}_test`;
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

test("Category POST persists one optional custom mapping and metadata edit preserves hidden target/icon/order", async () => {
  const dimension = await api<{ dimensionKey: string }>("/growth/dimensions", "POST", { name: "陶艺", color: "#8B5CF6", sortOrder: 11 });
  const category = await api<Category>("/task-categories", "POST", { name: "陶艺训练", color: "#AABBCC", dimensionKey: dimension.dimensionKey });
  const [rows] = await pool.query("SELECT dimension_key,color,target_minutes FROM task_categories WHERE id=?", [category.id]);
  assert.deepEqual((rows as Record<string, unknown>[])[0], { dimension_key: dimension.dimensionKey, color: "#AABBCC", target_minutes: 6000 });
  await pool.query("UPDATE task_categories SET target_minutes=12345, icon='clay', sort_order=77 WHERE id=?", [category.id]);
  await api(`/task-categories/${category.id}`, "PUT", { name: "陶艺进阶", color: "#EC4899", dimensionKey: null });
  const [edited] = await pool.query("SELECT name,dimension_key,target_minutes,icon,sort_order FROM task_categories WHERE id=?", [category.id]);
  assert.deepEqual((edited as Record<string, unknown>[])[0], { name: "陶艺进阶", dimension_key: null, target_minutes: 12345, icon: "clay", sort_order: 77 });
  const unmapped = await api<Category>("/task-categories", "POST", { name: "不映射", color: "#3B82F6", dimensionKey: null }); assert.equal(unmapped.dimensionKey, null);
});

test("disabled, unknown and foreign-user dimensions reject creation before any row is inserted", async () => {
  const disabled = await api<{ id: number; version: number; dimensionKey: string }>("/growth/dimensions", "POST", { name: "停用", color: "#3B82F6", sortOrder: 10 });
  await api(`/growth/dimensions/${disabled.id}`, "PUT", { expectedVersion: disabled.version, enabled: false });
  const foreign = await api<{ dimensionKey: string }>("/growth/dimensions", "POST", { name: "他人维度", color: "#3B82F6", sortOrder: 10 }, 200, foreignToken);
  for (const key of [disabled.dimensionKey, foreign.dimensionKey, "missing_dimension"]) await api("/task-categories", "POST", { name: "不应创建", color: "#3B82F6", dimensionKey: key }, 400);
  const [count] = await pool.query("SELECT COUNT(*) value FROM task_categories WHERE name='不应创建'"); assert.equal((count as { value: number }[])[0].value, 0);
});

test("actual publish and publish-and-claim associate the new Category and preserve ownership guards", async () => {
  const category = await api<Category>("/task-categories", "POST", { name: "悬赏专用", color: "#3B82F6", dimensionKey: null });
  const project = await api<{ id: number }>("/projects", "POST", { name: "保持原项目" });
  for (const claim of [false, true]) {
    const command = { operationId: randomUUID(), title: claim ? "接取悬赏" : "只发布", description: "完整草稿", categoryId: category.id, projectId: project.id, priority: 3, difficulty: 4, estimatedMinutes: 45, progressPercent: 20, dueAt: "2026-10-20T19:30", recordTimezone: "Asia/Shanghai", ...(claim ? { acceptDate: "2026-10-11" } : {}) };
    const task = await api<{ id: number }>("/tasks", "POST", command);
    const replay = await api<{ id: number }>("/tasks", "POST", command); assert.equal(replay.id, task.id);
    const [rows] = await pool.query("SELECT category_id,project_id,title,description FROM tasks WHERE id=?", [task.id]);
    assert.deepEqual((rows as Record<string, unknown>[])[0], { category_id: category.id, project_id: project.id, title: command.title, description: command.description });
    const [assignments] = await pool.query("SELECT COUNT(*) value FROM task_daily_assignments WHERE task_id=? AND task_date='2026-10-11'", [task.id]);
    assert.equal((assignments as { value: number }[])[0].value, claim ? 1 : 0);
  }
  await api(`/task-categories/${category.id}`, "PUT", { name: "越权" }, 404, foreignToken);
  await api("/tasks", "POST", { operationId: randomUUID(), title: "不能越权关联", categoryId: category.id, recordTimezone: "Asia/Shanghai" }, 404, foreignToken);
  await api(`/task-categories/${category.id}`, "PUT", { enabled: false });
  await api("/tasks", "POST", { operationId: randomUUID(), title: "不能关联停用分类", categoryId: category.id, recordTimezone: "Asia/Shanghai" }, 404);
  const [count] = await pool.query("SELECT COUNT(*) value FROM tasks WHERE title IN ('不能越权关联','不能关联停用分类')"); assert.equal((count as { value: number }[])[0].value, 0);
});
