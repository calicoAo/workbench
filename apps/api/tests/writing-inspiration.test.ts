import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl); const database = `workbench_inspiration_${process.pid}_test`; const migrationDirectory = resolve(process.cwd(), process.cwd().endsWith("/apps/api") ? "../../db/migration" : "db/migration");
let admin: Connection; let pool: Pool; let app: typeof import("../src/app.js").app; let signToken: typeof import("../src/auth.js").signToken; let sequence = 0;
const op = () => `83000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
function version(name: string) { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; }
async function migrate() { const names = (await readdir(migrationDirectory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1]); await admin.query(`USE \`${database}\``); for (const name of names) await admin.query(await readFile(resolve(migrationDirectory, name), "utf8")); }
function headers(userId = 1) { return { Authorization: `Bearer ${signToken({ id: userId, username: `inspiration-${userId}`, displayName: "Inspiration" })}`, "Content-Type": "application/json" }; }
async function api<T = any>(path: string, init: RequestInit = {}, userId = 1) { const response = await app.request(`http://localhost/api${path}`, { ...init, headers: { ...headers(userId), ...(init.headers ?? {}) } }); const body = await response.json() as { data: T; message: string }; return { response, data: body.data, message: body.message }; }
async function count(table: string, where = "") { const [rows] = await pool.query(`SELECT COUNT(*) value FROM ${table} ${where}`); return Number((rows as Array<{ value: number }>)[0].value); }

before(async () => {
  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await migrate();
  const dbUrl = new URL(sourceUrl); dbUrl.pathname = `/${database}`; process.env.NODE_ENV = "test"; process.env.DATABASE_URL = dbUrl.toString(); process.env.JWT_SECRET = "writing-inspiration-tests-only";
  [{ pool }, { app }, { signToken }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
});
beforeEach(async () => {
  for (const table of ["inspiration_tag_links", "writing_inspirations", "inspiration_tags", "quick_notes", "reward_events", "mutation_receipts", "projects"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("UPDATE users SET deleted_at=NULL, timezone='Asia/Shanghai' WHERE id=1");
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (931,'other-inspiration','Other','Asia/Shanghai',NOW(),NOW()) ON DUPLICATE KEY UPDATE deleted_at=NULL");
});
after(async () => { await pool?.end(); await admin?.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin?.end(); });

test("fresh V33 migration, QuickNote idempotency, normalized tags, AND filter, and archive state", async () => {
  const note = await api<{ id: number }>("/quick-notes", { method: "POST", body: JSON.stringify({ operationId: op(), noteDate: "2026-09-20", title: "保留", content: "长期灵感正文" }) });
  const first = await api<{ id: number }>(`/quick-notes/${note.data.id}/inspiration`, { method: "POST", body: JSON.stringify({ operationId: op(), tagNames: [" Agent  ", "研究", "#agent"] }) });
  const repeatWithoutTags = await api<{ tags: Array<{ normalizedName: string }> }>(`/quick-notes/${note.data.id}/inspiration`, { method: "POST", body: JSON.stringify({ operationId: op(), tagNames: [] }) });
  assert.deepEqual(repeatWithoutTags.data.tags.map((tag) => tag.normalizedName).sort(), ["agent", "研究"]);
  const replay = await api<{ id: number }>(`/quick-notes/${note.data.id}/inspiration`, { method: "POST", body: JSON.stringify({ operationId: op(), tagNames: ["Agent"] }) });
  assert.equal(first.response.status, 200); assert.equal(replay.response.status, 200); assert.equal(first.data.id, replay.data.id); assert.equal(await count("writing_inspirations"), 1);
  const tags = await api<{ items: Array<{ name: string; normalizedName: string }> }>("/writing/inspiration-tags"); assert.deepEqual(tags.data.items.map((tag) => tag.normalizedName).sort(), ["agent", "研究"]);
  const direct = await api<{ id: number }>("/writing/inspirations", { method: "POST", body: JSON.stringify({ operationId: op(), noteDate: "2026-09-21", content: "另一个想法", tagNames: ["Agent", "研究"] }) });
  const both = await api<{ items: Array<{ id: number }> }>("/writing/inspirations?tags=Agent,研究"); assert.deepEqual(both.data.items.map((item) => item.id), [direct.data.id]);
  const archived = await api(`/writing/inspirations/${direct.data.id}/archive`, { method: "POST", body: JSON.stringify({ operationId: op(), expectedVersion: 1 }) }); assert.equal(archived.response.status, 200);
  assert.equal((await api<{ items: any[] }>("/writing/inspirations?state=active")).data.items.length, 1); assert.equal((await api<{ items: any[] }>("/writing/inspirations?state=archived")).data.items.length, 1);
});

test("direct create atomically reuses QuickNote project relation and rolls back on downstream failure", async () => {
  const project = await api<{ id: number }>("/projects", { method: "POST", body: JSON.stringify({ name: "素材项目", description: "项目" }) });
  const created = await api<{ note: { id: number } }>("/writing/inspirations", { method: "POST", body: JSON.stringify({ operationId: op(), noteDate: "2026-09-22", content: "项目灵感", projectId: project.data.id, tagNames: [] }) });
  assert.equal(created.response.status, 200); assert.equal(await count("quick_notes", "WHERE project_id=" + project.data.id), 1); assert.equal(await count("writing_inspirations"), 1);
  await pool.query("CREATE TRIGGER fail_writing_inspiration BEFORE INSERT ON writing_inspirations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='forced inspiration failure'");
  const failed = await api("/writing/inspirations", { method: "POST", body: JSON.stringify({ operationId: op(), noteDate: "2026-09-23", content: "必须回滚", tagNames: [] }) });
  await pool.query("DROP TRIGGER fail_writing_inspiration");
  assert.equal(failed.response.status, 500); assert.equal(await count("quick_notes", "WHERE content='必须回滚'"), 0); assert.equal(await count("writing_inspirations"), 1);
});

test("tag creation race, rename/merge/delete, owner isolation, and immutable QuickNote source", async () => {
  const [a, b] = await Promise.all([api<{ id: number }>("/writing/inspiration-tags", { method: "POST", body: JSON.stringify({ operationId: op(), name: "  #Agent  " }) }), api<{ id: number }>("/writing/inspiration-tags", { method: "POST", body: JSON.stringify({ operationId: op(), name: "agent" }) })]);
  assert.equal(a.data.id, b.data.id); assert.equal(await count("inspiration_tags"), 1);
  const note = await api<{ id: number; version: number }>("/quick-notes", { method: "POST", body: JSON.stringify({ operationId: op(), content: "原始正文", title: "原始标题" }) });
  const inspiration = await api<{ id: number }>(`/quick-notes/${note.data.id}/inspiration`, { method: "POST", body: JSON.stringify({ operationId: op(), tagNames: ["Agent"] }) });
  const renamed = await api<{ name: string }>(`/writing/inspiration-tags/${a.data.id}`, { method: "PUT", body: JSON.stringify({ operationId: op(), name: "模型" }) }); assert.equal(renamed.data.name, "模型");
  const second = await api<{ id: number }>("/writing/inspiration-tags", { method: "POST", body: JSON.stringify({ operationId: op(), name: "研究" }) });
  const merged = await api(`/writing/inspiration-tags/${a.data.id}/merge`, { method: "POST", body: JSON.stringify({ operationId: op(), targetTagId: second.data.id }) }); assert.equal(merged.response.status, 200);
  const other = await api(`/writing/inspirations/${inspiration.data.id}`, {}, 931); assert.equal(other.response.status, 404);
  const detail = await api<{ note: { content: string } }>(`/writing/inspirations/${inspiration.data.id}`); assert.equal(detail.data.note.content, "原始正文");
  const deleted = await api(`/writing/inspiration-tags/${second.data.id}`, { method: "DELETE", body: JSON.stringify({ operationId: op() }) }); assert.equal(deleted.response.status, 200); assert.equal(await count("writing_inspirations"), 1);
});
