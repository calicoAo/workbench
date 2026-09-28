import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const cdpOrigin = process.env.WB_CORRECTION_CDP_ORIGIN ?? "http://127.0.0.1:9339";
const webOrigin = process.env.WB_CORRECTION_WEB_ORIGIN ?? "http://127.0.0.1:5174";
const apiOrigin = process.env.WB_CORRECTION_API_ORIGIN ?? "http://127.0.0.1:3000";
const artifactDir = process.env.WB_CORRECTION_ARTIFACT_DIR ?? path.resolve("docs/reports");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const yesterdayDate = new Date(`${today}T00:00:00Z`);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterday = yesterdayDate.toISOString().slice(0, 10);
await fs.mkdir(artifactDir, { recursive: true });

const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const job = pending.get(message.id);
  if (!job) return;
  pending.delete(message.id);
  clearTimeout(job.timer);
  message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
});
function send(method, params = {}, timeout = 15000) { return new Promise((resolve, reject) => { const id = ++commandId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return Date.now() - started; await sleep(80); } throw new Error(`Timed out: ${expression}`); }
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") { const response = await fetch(`${apiOrigin}/api${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`); return payload.data; }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(350); }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const size = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.deepEqual({ innerWidth: size.innerWidth, innerHeight: size.innerHeight }, { innerWidth: width, innerHeight: height }); if (size.scrollWidth > width) { const overflow = await evaluate(`(() => { const details = (selector) => { const node = document.querySelector(selector); const rect = node?.getBoundingClientRect(); return { selector, width: rect?.width, right: rect?.right, minWidth: node ? getComputedStyle(node).minWidth : null, columns: node ? getComputedStyle(node).gridTemplateColumns : null }; }; return { ancestors: ['.app-shell','.app-stage','.app-content','.today-grid','.today-quests','.today-quests > .glass-panel'].map(details), nodes: [...document.querySelectorAll('body *')].map((node) => ({ node: node.tagName + '.' + node.className, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width })).filter((item) => item.right > ${width} + 1 || item.left < -1).sort((a, b) => b.right - a.right).slice(0, 12) }; })()`); throw new Error(`horizontal overflow: ${size.scrollWidth} > ${width}: ${JSON.stringify(overflow)}`); } }
async function screenshot(name) { const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return file; }
async function clickByText(selector, text) { assert.equal(await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.includes(${JSON.stringify(text)})); if (!node) return false; node.click(); return true; })()`), true, `missing ${text}`); }

await send("Page.enable");
await send("Runtime.enable");
const owner = await api("/auth/register", { username: `correction_${Date.now()}`, displayName: "Correction QA", password: "workbench-correction-password" });
const token = owner.token;
await api("/onboarding/flows/core-loop/skip", {}, token);
await api("/hero/daily-entry/claim", { businessDate: today }, token);
const task = await api("/tasks", { operationId: crypto.randomUUID(), title: "续接验收任务", description: "真实 continuation UI 闭环", priority: 2, difficulty: 2, progressPercent: 0, acceptDate: yesterday, recordTimezone: "Asia/Shanghai" }, token);
await api("/sleep-records", { sleepStartDate: yesterday, sleepStartTime: "23:00", wakeDate: today, wakeTime: "06:32", recordTimezone: "Asia/Shanghai", qualityScore: 4 }, token);

await navigate("/login", "body");
await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`);
await viewport(1440, 900);
await navigate(`/today?date=${today}`);
await waitFor("document.querySelector('.continuation-panel') !== null");
const desktopLayout = await evaluate(`(() => {
  const bounds = (selector) => document.querySelector(selector).getBoundingClientRect();
  const current = bounds('.today-current');
  const status = bounds('.today-status-surface');
  const waterBlock = bounds('.today-water-block');
  const sleepBlock = bounds('.today-sleep-block');
  const topbar = bounds('.app-topbar');
  const hero = bounds('.app-heading .hero-hud');
  const quests = bounds('.today-quests');
  const timeline = bounds('.today-timeline');
  return {
    topRowDelta: Math.abs(current.top - status.top),
    topHeightDelta: Math.abs(current.height - status.height),
    lowerRowDelta: Math.abs(quests.top - timeline.top),
    cups: document.querySelectorAll('.today-status-surface .water-cup-toggle').length,
    sleep: document.querySelector('.today-status-surface .sleep-utility-summary')?.textContent,
    continuationInsideQuestBoard: Boolean(document.querySelector('.today-quests .glass-panel .continuation-panel')),
    primaryNav: [...document.querySelectorAll('.app-sidebar nav .shell-link span')].map((item) => item.textContent.trim()),
    heroInHeading: Boolean(document.querySelector('.app-heading .hero-hud')),
    heroInActions: Boolean(document.querySelector('.app-top-actions .hero-hud')),
    routeMetaInHeading: Boolean(document.querySelector('.app-heading .route-eyebrow, .app-heading h2')),
    heroLeftInset: hero.left - topbar.left,
    statusBlocks: document.querySelectorAll('.today-status-surface > .today-status-block').length,
    statusBlockTopDelta: Math.abs(waterBlock.top - sleepBlock.top),
    statusBlockHorizontalGap: sleepBlock.left - waterBlock.right,
    sleepTitleHeight: bounds('.today-sleep-block h2').height
  };
})()`);
assert.ok(desktopLayout.topRowDelta <= 1);
assert.ok(desktopLayout.topHeightDelta <= 1);
assert.ok(desktopLayout.lowerRowDelta <= 1);
assert.equal(desktopLayout.cups, 8);
assert.match(desktopLayout.sleep, /7\.5h/);
assert.equal(desktopLayout.continuationInsideQuestBoard, true);
assert.deepEqual(desktopLayout.primaryNav, ["冒险", "笔记本", "成长", "钱包", "图书馆", "背包"]);
assert.equal(desktopLayout.heroInHeading, true);
assert.equal(desktopLayout.heroInActions, false);
assert.equal(desktopLayout.routeMetaInHeading, false);
assert.ok(desktopLayout.heroLeftInset >= 0 && desktopLayout.heroLeftInset <= 24);
assert.equal(desktopLayout.statusBlocks, 2);
assert.ok(desktopLayout.statusBlockTopDelta <= 1);
assert.ok(desktopLayout.statusBlockHorizontalGap > 0);
assert.ok(desktopLayout.sleepTitleHeight <= 20);

assert.equal(await evaluate(`document.querySelectorAll('.today-water-block .water-cup-toggle[aria-pressed="true"]').length`), 0);
assert.equal(await evaluate(`(() => { const node = document.querySelector('.today-water-block [aria-label="再喝一杯"]'); if (!node) return false; node.click(); return true; })()`), true);
await waitFor(`document.querySelectorAll('.today-water-block .water-cup-toggle[aria-pressed="true"]').length === 1`);
assert.equal(await evaluate(`(() => { const node = document.querySelector('.today-water-block .water-cup-toggle[aria-pressed="true"]'); if (!node) return false; node.click(); return true; })()`), true);
await waitFor(`document.querySelectorAll('.today-water-block .water-cup-toggle[aria-pressed="true"]').length === 0`);
assert.equal(await evaluate(`(() => { const node = document.querySelector('.today-water-block .water-cup-toggle[aria-pressed="false"]'); if (!node) return false; node.click(); return true; })()`), true);
await waitFor(`document.querySelectorAll('.today-water-block .water-cup-toggle[aria-pressed="true"]').length === 1`);
const correctionDesktop = await screenshot("WB-ADVENTURE-correction-1440.png");
const continuationBefore = await screenshot("WB-ADVENTURE-continuation-before-1440.png");
const shellDesktop = await screenshot("WB-SHELL-major-modules-1440.png");

await clickByText(".continuation-panel button", "接取到今天");
const immediateUpdateMs = await waitFor(`document.querySelector('.continuation-panel') === null && document.querySelector('[aria-label="完成续接验收任务"]') !== null`);
assert.ok(immediateUpdateMs < 3000, `continuation update took ${immediateUpdateMs}ms`);
const continuationAfter = await screenshot("WB-ADVENTURE-continuation-after-1440.png");
const continuationRows = await api(`/task-days/continuations?date=${today}`, undefined, token);
const assignments = await api(`/task-days?date=${today}`, undefined, token);
assert.equal(continuationRows.length, 0);
assert.ok(assignments.taskIds.includes(task.id));

await viewport(375, 812);
await navigate(`/today?date=${today}`);
await waitFor("document.querySelector('.today-status-surface') !== null");
const mobile = await evaluate(`({
  width: document.documentElement.scrollWidth,
  nav: [...document.querySelectorAll('.mobile-nav .shell-link span')].map((item) => item.textContent.trim()),
  adventureNav: [...document.querySelectorAll('.app-module-nav a')].map((item) => item.textContent.trim())
})`);
assert.ok(mobile.width <= 375);
assert.deepEqual(mobile.nav, ["冒险", "笔记本", "成长", "钱包", "设置"]);
assert.deepEqual(mobile.adventureNav, ["冒险", "任务", "项目", "日历", "生活"]);
const correctionMobile = await screenshot("WB-ADVENTURE-correction-375.png");

for (const route of ["/tasks", "/projects", "/calendar", "/routines", "/writing", "/growth", "/finance", "/settings", "/tools"]) {
  await navigate(`${route}?date=${today}`);
  assert.equal(await evaluate("Boolean(document.querySelector('main'))"), true);
}

console.log(JSON.stringify({ desktopLayout, immediateUpdateMs, legacyRoutes: "PASS", mobileNav: "PASS", evidence: { correctionDesktop, continuationBefore, continuationAfter, shellDesktop, correctionMobile } }, null, 2));
socket.close();
