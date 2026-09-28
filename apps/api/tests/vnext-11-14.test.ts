import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";

const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.slice(1).endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to an isolated MySQL database ending in _test");
const source = new URL(sourceUrl);
const fresh = `workbench_vnext_11_14_fresh_${process.pid}_test`;
const upgrade = `workbench_vnext_11_14_upgrade_${process.pid}_test`;
const migrationDirectory = resolve(process.cwd(), process.cwd().endsWith("/apps/api") ? "../../db/migration" : "db/migration");
let admin: Connection;
let pool: Pool;
let app: typeof import("../src/app.js").app;
let signToken: typeof import("../src/auth.js").signToken;
let provider: Server;
let providerMode: "success" | "failure" | "invalid" = "success";
let providerCalls = 0;

const validInsight = { summary: "聚焦", emotionTags: ["平静"], energyScore: 4, stressKeywords: ["期限"], suggestion: "先做一件小事", fullText: "今天先完成最重要的一步。" };

function version(name: string) { const match = /^V(\d+)(?:_(\d+))?__/.exec(name)!; return [Number(match[1]), Number(match[2] ?? 0)]; }
async function migrate(database: string, from = 1, through = Number.MAX_SAFE_INTEGER) {
  const names = (await readdir(migrationDirectory)).filter((name) => /^V\d+(?:_\d+)?__.*\.sql$/.test(name)).sort((left, right) => version(left)[0] - version(right)[0] || version(left)[1] - version(right)[1]);
  await admin.query(`USE \`${database}\``);
  for (const name of names) if (version(name)[0] >= from && version(name)[0] <= through) await admin.query(await readFile(resolve(migrationDirectory, name), "utf8"));
}
function token(userId = 1) { return signToken({ id: userId, username: `vnext-${userId}`, displayName: `VNext ${userId}` }); }
async function api<T = any>(path: string, init: RequestInit = {}, userId = 1) {
  const response = await app.request(`http://localhost/api${path}`, { ...init, headers: { Authorization: `Bearer ${token(userId)}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = await response.json() as { data: T; message: string };
  return { response, data: body.data, message: body.message };
}
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as Array<Record<string, unknown>>)[0])[0]); }
function operation() { return crypto.randomUUID(); }

before(async () => {
  provider = createServer((_request, response) => {
    providerCalls += 1;
    response.setHeader("Content-Type", "application/json");
    if (providerMode === "failure") { response.statusCode = 503; response.end(JSON.stringify({ error: "temporary" })); return; }
    const payload = providerMode === "invalid" ? { summary: "missing required fields" } : validInsight;
    response.end(JSON.stringify({ output_text: JSON.stringify(payload), usage: { input_tokens: 21, output_tokens: 13 } }));
  });
  await new Promise<void>((resolveListen) => provider.listen(0, "127.0.0.1", resolveListen));
  const address = provider.address(); if (!address || typeof address === "string") throw new Error("AI test provider did not start");

  admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true, timezone: "Z" });
  await admin.query(`CREATE DATABASE \`${fresh}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`CREATE DATABASE \`${upgrade}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await migrate(fresh);
  await migrate(upgrade, 1, 38);
  await admin.query(`USE \`${upgrade}\``);
  await admin.query("UPDATE users SET display_name='Upgrade Library User' WHERE id=1");
  await migrate(upgrade, 39, 41);

  const url = new URL(sourceUrl); url.pathname = `/${fresh}`;
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET = "vnext-11-14-tests-only";
  process.env.OPENAI_API_KEY = "local-test-key";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.OPENAI_MODEL = "local-structured-test";
  [{ pool }, { app }, { signToken }] = await Promise.all([import("../src/db/index.js"), import("../src/app.js"), import("../src/auth.js")]);
});

beforeEach(async () => {
  providerMode = "success"; providerCalls = 0;
  await pool.query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of ["ai_insights", "ai_artifacts", "user_ai_settings", "achievement_unlocks", "keepsake_cards", "milestones", "library_item_relations", "library_items", "morning_writings", "quick_notes", "projects", "mutation_receipts"]) await pool.query(`DELETE FROM ${table}`);
  await pool.query("SET FOREIGN_KEY_CHECKS=1");
  await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (992,'vnext-second','Second User','Asia/Shanghai',NOW(),NOW()) ON DUPLICATE KEY UPDATE deleted_at=NULL");
  await pool.query("INSERT INTO user_ai_settings (user_id,enabled,allow_adventure,allow_notebook,allow_growth,allow_library,allow_wallet,version,updated_at) VALUES (1,0,0,0,0,0,0,1,NOW()),(992,0,0,0,0,0,0,1,NOW())");
});

after(async () => {
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS \`${fresh}\``);
  await admin?.query(`DROP DATABASE IF EXISTS \`${upgrade}\``);
  await admin?.end();
  await new Promise<void>((resolveClose) => provider?.close(() => resolveClose()));
});

test("V39-V41 migrate fresh and upgrade V38 without losing existing users", async () => {
  const [tables] = await admin.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='${fresh}' AND table_name IN ('library_items','library_item_relations','achievement_definitions','achievement_unlocks','milestones','keepsake_cards','user_ai_settings','ai_artifacts')`);
  assert.equal((tables as unknown[]).length, 8);
  await admin.query(`USE \`${upgrade}\``);
  const [users] = await admin.query("SELECT display_name displayName FROM users WHERE id=1");
  assert.equal((users as Array<{ displayName: string }>)[0].displayName, "Upgrade Library User");
  assert.equal(await (async () => { const [rows] = await admin.query("SELECT COUNT(*) count FROM user_ai_settings WHERE user_id=1 AND allow_wallet=0"); return Number((rows as Array<{ count: number }>)[0].count); })(), 1);
});

test("Library owns metadata, links Notebook by reference, searches, isolates users, and enforces revisions", async () => {
  const created = await api<any>("/library/items", { method: "POST", body: JSON.stringify({ type: "BOOK", title: "深度工作", originalTitle: "Deep Work", creator: "Cal Newport", status: "IN_PROGRESS", rating: 5, startedOn: "2026-09-01", coverRef: "https://example.test/cover.jpg", externalRef: "https://example.test/book", shortNote: "正在读" }) });
  assert.equal(created.response.status, 200);
  await pool.query("INSERT INTO quick_notes (user_id,note_date,title,content,created_at,updated_at) VALUES (1,'2026-09-20','阅读线索','PRIVATE BODY MUST STAY IN NOTEBOOK',NOW(),NOW())");
  const [noteRows] = await pool.query("SELECT id FROM quick_notes WHERE user_id=1"); const noteId = Number((noteRows as Array<{ id: number }>)[0].id);
  const related = await api<any>(`/library/items/${created.data.id}/relations`, { method: "POST", body: JSON.stringify({ targetType: "QUICK_NOTE", targetId: noteId }) });
  assert.equal(related.data.relations.length, 1);
  assert.equal(JSON.stringify(related.data).includes("PRIVATE BODY MUST STAY IN NOTEBOOK"), false);
  assert.equal(await scalar("SELECT COUNT(*) FROM library_item_relations WHERE library_item_id=?", [created.data.id]), 1);

  const updated = await api<any>(`/library/items/${created.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, status: "FINISHED", finishedOn: "2026-09-21" }) });
  assert.equal(updated.data.version, 2);
  assert.equal((await api(`/library/items/${created.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 2, startedOn: "2026-09-22" }) })).response.status, 400);
  assert.equal((await api(`/library/items/${created.data.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, title: "stale" }) })).response.status, 409);
  assert.equal((await api<any>("/library/items")).data.items.length, 1);
  assert.equal((await api<any>("/library/items", {}, 992)).data.items.length, 0);
  assert.equal((await api<any>("/search?q=Deep%20Work&type=library")).data.items[0].deepLink, `/library/${created.data.id}`);

  await pool.query("UPDATE quick_notes SET deleted_at=NOW() WHERE id=?", [noteId]);
  assert.equal((await api<any>(`/library/items/${created.data.id}`)).data.relations[0].summary, null);
});

test("Backpack unlocks deterministic facts once, replays writes, keeps unavailable sources, and is searchable", async () => {
  await pool.query("INSERT INTO projects (user_id,name,status,priority,version,created_at,updated_at) VALUES (1,'Shipped product',3,2,1,NOW(),NOW())");
  await pool.query("INSERT INTO library_items (user_id,type,title,status,finished_on,version,created_at,updated_at) VALUES (1,'GAME','Completed Game','FINISHED','2026-09-15',1,NOW(),NOW())");
  await api("/backpack/achievements/evaluate", { method: "POST" });
  await api("/backpack/achievements/evaluate", { method: "POST" });
  assert.equal(await scalar("SELECT COUNT(*) FROM achievement_unlocks WHERE user_id=1"), 2);

  const milestoneOperation = operation();
  const milestoneInput = { operationId: milestoneOperation, title: "First release", description: "v1 shipped", happenedOn: "2026-09-18", sourceType: "MANUAL_TEXT" };
  const milestone = await api<any>("/backpack/milestones", { method: "POST", body: JSON.stringify(milestoneInput) });
  const replay = await api<any>("/backpack/milestones", { method: "POST", body: JSON.stringify(milestoneInput) });
  assert.equal(replay.data.id, milestone.data.id);
  assert.equal(await scalar("SELECT COUNT(*) FROM milestones WHERE user_id=1"), 1);

  const [projectRows] = await pool.query("SELECT id FROM projects WHERE user_id=1"); const projectId = Number((projectRows as Array<{ id: number }>)[0].id);
  await api("/backpack/keepsakes", { method: "POST", body: JSON.stringify({ operationId: operation(), title: "Release card", description: "A preserved moment", happenedOn: "2026-09-18", sourceType: "PROJECT", sourceId: projectId, iconKey: "flag", themeKey: "mint" }) });
  await pool.query("UPDATE projects SET archived_at=NOW() WHERE id=?", [projectId]);
  const overview = await api<any>("/backpack");
  assert.equal(overview.data.keepsakes[0].sourceAvailable, false);
  assert.equal((await api<any>("/backpack", {}, 992)).data.keepsakes.length, 0);
  const search = await api<any>("/search?q=Release%20card&type=keepsake");
  assert.match(search.data.items[0].deepLink, /^\/backpack\?view=keepsakes&id=\d+$/);
});

test("AI Foundation protects private text, validates results, retries idempotently, tracks usage, and marks changed sources stale", async () => {
  await pool.query("INSERT INTO morning_writings (user_id,writing_date,content,mood_score,created_at,updated_at) VALUES (1,'2026-09-28','PRIVATE MORNING BODY',4,NOW(),NOW())");
  const deniedOperation = operation();
  const denied = await api("/ai/morning-writing-insight", { method: "POST", body: JSON.stringify({ operationId: deniedOperation, sourceDate: "2026-09-28" }) });
  assert.equal(denied.response.status, 403);
  assert.equal(providerCalls, 0);
  assert.equal(await scalar("SELECT COUNT(*) FROM ai_artifacts WHERE user_id=1"), 0);
  const settings = await api<any>("/ai/settings", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, enabled: true, allowNotebook: true }) });
  assert.deepEqual([settings.data.enabled, settings.data.allowNotebook, settings.data.allowWallet], [1, 1, 0]);

  providerMode = "failure";
  const retryOperation = operation();
  assert.equal((await api("/ai/morning-writing-insight", { method: "POST", body: JSON.stringify({ operationId: retryOperation, sourceDate: "2026-09-28" }) })).response.status, 500);
  assert.equal(await scalar("SELECT COUNT(*) FROM ai_artifacts WHERE user_id=1 AND operation_id=?", [retryOperation]), 1);
  providerMode = "success";
  const retried = await api<any>("/ai/morning-writing-insight", { method: "POST", body: JSON.stringify({ operationId: retryOperation, sourceDate: "2026-09-28" }) });
  assert.equal(retried.data.status, "SUCCEEDED");
  assert.deepEqual([retried.data.usageInputTokens, retried.data.usageOutputTokens], [21, 13]);

  providerMode = "invalid";
  const invalidOperation = operation();
  assert.equal((await api("/ai/morning-writing-insight", { method: "POST", body: JSON.stringify({ operationId: invalidOperation, sourceDate: "2026-09-28" }) })).response.status, 500);
  assert.equal(await scalar("SELECT COUNT(*) FROM ai_artifacts WHERE operation_id=? AND status='FAILED'", [invalidOperation]), 1);

  await pool.query("UPDATE morning_writings SET content='CHANGED PRIVATE MORNING BODY', updated_at=DATE_ADD(updated_at, INTERVAL 1 SECOND) WHERE user_id=1 AND writing_date='2026-09-28'");
  providerMode = "success";
  const next = await api<any>("/ai/morning-writing-insight", { method: "POST", body: JSON.stringify({ operationId: operation(), sourceDate: "2026-09-28" }) });
  assert.equal(next.data.status, "SUCCEEDED");
  assert.equal(await scalar("SELECT stale FROM ai_artifacts WHERE operation_id=?", [retryOperation]), 1);
  assert.equal((await api("/ai/morning-writing-insight", { method: "POST", body: JSON.stringify({ operationId: retryOperation, sourceDate: "2026-09-28" }) })).response.status, 409);
  const usage = await api<any>("/ai/usage");
  assert.equal(usage.data.requests, 3);
  assert.equal(usage.data.inputTokens, 42);
  assert.equal(usage.data.costMicrounits, null);
  assert.equal((await api<any>("/ai/artifacts", {}, 992)).data.items.length, 0);
});

test("Morning Writing legacy entry uses Foundation and AI never writes domain records", async () => {
  await pool.query("UPDATE user_ai_settings SET enabled=1, allow_notebook=1, version=2 WHERE user_id=1");
  await pool.query("INSERT INTO morning_writings (user_id,writing_date,content,mood_score,created_at,updated_at) VALUES (1,'2026-09-27','A saved morning entry',3,NOW(),NOW())");
  const tasksBefore = await scalar("SELECT COUNT(*) FROM tasks WHERE user_id=1");
  const projectsBefore = await scalar("SELECT COUNT(*) FROM projects WHERE user_id=1");
  const response = await api<any>("/ai-insights/analyze", { method: "POST", body: JSON.stringify({ sourceType: "morning", sourceDate: "2026-09-27", content: "A saved morning entry", operationId: operation() }) });
  assert.equal(response.response.status, 200);
  assert.equal(response.data.summary, validInsight.summary);
  assert.equal(await scalar("SELECT COUNT(*) FROM ai_artifacts WHERE user_id=1 AND feature_key='MORNING_WRITING_INSIGHT'"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM ai_insights WHERE user_id=1 AND source_type='morning'"), 1);
  assert.equal(await scalar("SELECT COUNT(*) FROM tasks WHERE user_id=1"), tasksBefore);
  assert.equal(await scalar("SELECT COUNT(*) FROM projects WHERE user_id=1"), projectsBefore);
  assert.equal((await api<any>("/library/items")).response.status, 200);
});
