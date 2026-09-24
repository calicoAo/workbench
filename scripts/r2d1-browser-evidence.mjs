import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const cdpOrigin = process.env.R2D1_BROWSER_CDP_ORIGIN ?? "http://127.0.0.1:9335";
const webOrigin = process.env.R2D1_BROWSER_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const apiOrigin = process.env.R2D1_BROWSER_API_ORIGIN ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.R2D1_BROWSER_DATABASE_URL;
const artifactDir = process.env.R2D1_BROWSER_ARTIFACT_DIR ?? path.resolve("docs/reports");
if (!databaseUrl) throw new Error("R2D1_BROWSER_DATABASE_URL is required");
await fs.mkdir(artifactDir, { recursive: true });

const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("fresh Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const job = pending.get(message.id);
  if (!job) return;
  pending.delete(message.id);
  clearTimeout(job.timer);
  message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
});
function send(method, params = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(120);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`${apiOrigin}/api${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`);
  return payload.data;
}
async function navigate(pathname, selector = ".app-shell") {
  await send("Page.navigate", { url: `${webOrigin}${pathname}` });
  await waitFor("document.readyState === 'complete'");
  await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`);
  await sleep(350);
}
async function setToken(token) {
  await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor("document.querySelector('.app-shell') !== null");
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 });
  await waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
  const value = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })");
  assert.equal(value.innerWidth, width);
  assert.equal(value.innerHeight, height);
  if (width === 375) assert.equal(value.scrollWidth, 375);
  else assert.ok(value.scrollWidth <= width);
  return value;
}
async function screenshot(name) {
  const dimensions = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })");
  assert.ok(dimensions.scrollWidth <= dimensions.innerWidth, `${name} has horizontal overflow`);
  if (dimensions.innerWidth === 375) assert.deepEqual(dimensions, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 });
  const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  const file = path.join(artifactDir, name);
  await fs.writeFile(file, Buffer.from(capture.data, "base64"));
  return { file, ...dimensions };
}
async function clickText(text) {
  const clicked = await evaluate(`(() => { const node = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!node) return false; node.click(); return true; })()`);
  assert.equal(clicked, true, `missing button: ${text}`);
  await sleep(300);
}

const dbUrl = new URL(databaseUrl);
const db = await mysql.createConnection({
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 3306),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.slice(1),
  timezone: "Z"
});
const owner = await api("/auth/register", {
  username: `r2d1_browser_${String(Date.now()).slice(-10)}`,
  displayName: "R2D1 Growth QA",
  password: "r2d1-browser-password"
});
const userId = owner.user.id;
const token = owner.token;
const [categories] = await db.query("SELECT id,name FROM task_categories WHERE user_id=?", [userId]);
const categoryId = (name) => Number(categories.find((item) => item.name === name).id);
const work = categoryId("工作");
const learning = categoryId("学习");
const creative = categoryId("创作");
const other = categoryId("其他");
await db.query("INSERT INTO user_growth (user_id,level,xp_total,coins,created_at,updated_at) VALUES (?,3,430,36,NOW(),NOW()) ON DUPLICATE KEY UPDATE xp_total=430,coins=36,updated_at=NOW()", [userId]);
await db.query("UPDATE task_categories SET enabled=0 WHERE id=? AND user_id=?", [other, userId]);
const [taskOne] = await db.query("INSERT INTO tasks (user_id,category_id,title,priority,difficulty,status,pinned,progress_percent,sort_order,completed_at,completion_sequence,created_at,updated_at) VALUES (?,?,?,2,2,2,0,100,10,'2026-09-23 04:00:00',1,NOW(),NOW())", [userId, work, "完成 Hero Growth V1"]);
const [taskTwo] = await db.query("INSERT INTO tasks (user_id,category_id,title,priority,difficulty,status,pinned,progress_percent,sort_order,completed_at,completion_sequence,created_at,updated_at) VALUES (?,?,?,2,3,2,1,100,20,'2026-09-22 07:00:00',1,NOW(),NOW())", [userId, learning, "复盘 ActualTime 语义"]);
const [taskThree] = await db.query("INSERT INTO tasks (user_id,category_id,title,priority,difficulty,status,pinned,progress_percent,sort_order,completed_at,completion_sequence,created_at,updated_at) VALUES (?,?,?,2,2,2,0,100,30,'2026-09-21 11:00:00',1,NOW(),NOW())", [userId, other, "整理暂不映射事项"]);
const taskIds = [Number(taskOne.insertId), Number(taskTwo.insertId), Number(taskThree.insertId)];
await db.query("INSERT INTO task_completion_events (user_id,task_id,category_id_at_occurrence,occurred_at,record_timezone,business_date,lifecycle_version,operation_id,source,created_at) VALUES (?,?,?,'2026-09-23 04:00:00','Asia/Shanghai','2026-09-23',1,?,1,NOW()),(?,?,?,'2026-09-22 07:00:00','Asia/Shanghai','2026-09-22',1,?,1,NOW()),(?,?,?,'2026-09-21 11:00:00','Asia/Shanghai','2026-09-21',1,?,1,NOW())", [userId, taskIds[0], work, `r2d1-browser-${userId}-1`, userId, taskIds[1], learning, `r2d1-browser-${userId}-2`, userId, taskIds[2], other, `r2d1-browser-${userId}-3`]);
await db.query("INSERT INTO reward_events (user_id,event_key,source_type,source_id,event_date,xp_delta,coin_delta,reason,created_at) VALUES (?,?,'task',?,'2026-09-23',20,6,'完成任务',NOW()),(?,?,'task',?,'2026-09-22',52,16,'完成重要任务',NOW())", [userId, `r2d1-browser-reward-${userId}-1`, String(taskIds[0]), userId, `r2d1-browser-reward-${userId}-2`, String(taskIds[1])]);
const actuals = [
  [work, "2026-09-23", "Hero Growth 实现", "2026-09-23 01:00:00", "2026-09-23 03:30:00"],
  [learning, "2026-09-22", "架构与语义复盘", "2026-09-22 01:00:00", "2026-09-22 02:30:00"],
  [creative, "2026-09-21", "Pixel Visual 设计", "2026-09-21 06:00:00", "2026-09-21 07:15:00"],
  [other, "2026-09-20", "未映射整理", "2026-09-20 08:00:00", "2026-09-20 08:45:00"]
];
for (const [category, date, title, startedAt, endedAt] of actuals) {
  await db.query("INSERT INTO schedules (user_id,category_id,schedule_date,record_timezone,start_time,end_time,actual_started_at,actual_ended_at,title,completed,lifecycle_state,kind,source,actual_time_class,include_in_actual_time,project_attribution_status,category_id_at_occurrence,category_attribution_status,version,created_at,updated_at) VALUES (?,?,?,'Asia/Shanghai','09:00:00','10:00:00',?,?,?,1,1,1,0,1,1,1,?,2,1,NOW(),NOW())", [userId, category, date, startedAt, endedAt, title, category]);
}
const [habit] = await db.query("INSERT INTO habit_definitions (user_id,name,start_date,record_mode,task_completion_enabled,version,created_at,updated_at) VALUES (?,'每日回顾','2026-09-01',0,0,1,NOW(),NOW())", [userId]);
const habitId = Number(habit.insertId);
await db.query("INSERT INTO habit_occurrences (user_id,habit_id,occurrence_date,record_timezone,status,source,version,created_at,updated_at) VALUES (?,?,'2026-09-22','Asia/Shanghai',1,0,1,NOW(),NOW()),(?,?,'2026-09-23','Asia/Shanghai',1,0,1,NOW(),NOW())", [userId, habitId, userId, habitId]);

await send("Page.enable");
await send("Runtime.enable");
await navigate("/login", "body");
await setToken(token);

await viewport(1440, 900);
await navigate("/growth?date=2026-09-24", ".growth-overview");
await waitFor("document.querySelector('.growth-hero-card')?.textContent.includes('Lv.3')");
const desktopOverviewState = await evaluate(`(() => ({
  title: document.querySelector('.growth-hero-card')?.textContent,
  bars: document.querySelectorAll('.growth-bars > div').length,
  cards: document.querySelectorAll('.growth-dimension-card').length,
  hasAbilityScore: document.body.textContent.includes('能力值'),
  brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).length,
  financeText: /净资产|储蓄|消费金额/.test(document.querySelector('.growth-route')?.textContent ?? '')
}))()`);
assert.ok(desktopOverviewState.title.includes("你的角色正在成长"));
assert.ok(desktopOverviewState.bars >= 6);
assert.ok(desktopOverviewState.cards >= 6);
assert.equal(desktopOverviewState.hasAbilityScore, false);
assert.equal(desktopOverviewState.brokenImages, 0);
assert.equal(desktopOverviewState.financeText, false);
const overviewDesktop = await screenshot("WB-R2D1-growth-overview-1440.png");

await clickText("成长维度");
await waitFor("document.querySelector('.growth-dimension-settings') !== null");
const dimensionsDesktop = await screenshot("WB-R2D1-growth-dimensions-1440.png");
await clickText("分类映射");
await waitFor("document.querySelector('.growth-mapping') !== null");
assert.ok((await evaluate("document.querySelector('.growth-mapping').textContent")).includes("暂不映射"));
const mappingDesktop = await screenshot("WB-R2D1-growth-mapping-1440.png");

await viewport(375, 812);
await navigate("/growth?date=2026-09-24", ".growth-overview");
const mobileOverviewState = await evaluate(`(() => {
  const nav = document.querySelector('.mobile-nav');
  const quick = document.querySelector('.quick-add-wrap');
  const actionable = [...document.querySelectorAll('.growth-route button,.growth-route a')];
  const quickRect = quick?.getBoundingClientRect();
  const overlaps = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
  return {
    navItems: nav?.querySelectorAll('a').length,
    actionOverlap: actionable.some((node) => overlaps(node.getBoundingClientRect(), quickRect)),
    quickNavOverlap: overlaps(quickRect, nav?.getBoundingClientRect()),
    labelsFit: actionable.every((node) => node.scrollWidth <= node.clientWidth + 1),
    pixelFallbacks: document.querySelectorAll('.pixel-icon-slot svg').length
  };
})()`);
assert.deepEqual({ navItems: mobileOverviewState.navItems, actionOverlap: mobileOverviewState.actionOverlap, quickNavOverlap: mobileOverviewState.quickNavOverlap, labelsFit: mobileOverviewState.labelsFit }, { navItems: 5, actionOverlap: false, quickNavOverlap: false, labelsFit: true });
assert.ok(mobileOverviewState.pixelFallbacks > 0);
const overviewMobile = await screenshot("WB-R2D1-growth-overview-375.png");

await clickText("成长维度");
await waitFor("document.querySelector('.growth-dimension-settings') !== null");
const mobileDimensionsState = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.growth-dimension-settings article')];
  return {
    rows: rows.length,
    controlsFit: [...document.querySelectorAll('.growth-dimension-settings button')].every((button) => button.scrollWidth <= button.clientWidth + 1),
    withinViewport: rows.every((row) => { const rect = row.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; })
  };
})()`);
assert.equal(mobileDimensionsState.rows, 6);
assert.equal(mobileDimensionsState.controlsFit, true);
assert.equal(mobileDimensionsState.withinViewport, true);
const dimensionsMobile = await screenshot("WB-R2D1-growth-dimensions-375.png");

await navigate("/today?date=2026-09-24", ".today-growth-entry");
await evaluate("document.querySelector('.today-growth-entry').scrollIntoView({ block: 'center' })");
await sleep(250);
const todayState = await evaluate(`(() => {
  const entry = document.querySelector('.today-growth-entry');
  return {
    text: entry?.textContent,
    href: entry?.querySelector('a')?.getAttribute('href'),
    navItems: document.querySelector('.mobile-nav')?.querySelectorAll('a').length,
    withinViewport: (() => { const rect = entry?.getBoundingClientRect(); return Boolean(rect && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight); })()
  };
})()`);
assert.ok(todayState.text.includes("Lv.3"));
assert.ok(todayState.text.includes("查看成长"));
assert.ok(todayState.href.startsWith("/growth?date=2026-09-24"));
assert.equal(todayState.navItems, 5);
assert.equal(todayState.withinViewport, true);
const todayMobile = await screenshot("WB-R2D1-today-growth-entry-375.png");

console.log(JSON.stringify({
  exactViewport: "PASS",
  evidence: { overviewDesktop, dimensionsDesktop, mappingDesktop, overviewMobile, dimensionsMobile, todayMobile },
  desktopOverviewState,
  mobileOverviewState,
  mobileDimensionsState,
  todayState
}, null, 2));
await db.end();
socket.close();
