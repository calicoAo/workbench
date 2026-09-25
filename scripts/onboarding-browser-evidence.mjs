import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const cdpOrigin = process.env.ONBOARDING_BROWSER_CDP_ORIGIN ?? "http://127.0.0.1:9336";
const webOrigin = process.env.ONBOARDING_BROWSER_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const apiOrigin = process.env.ONBOARDING_BROWSER_API_ORIGIN ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.ONBOARDING_BROWSER_DATABASE_URL;
const artifactDir = process.env.ONBOARDING_BROWSER_ARTIFACT_DIR ?? path.resolve("docs/reports");
if (!databaseUrl) throw new Error("ONBOARDING_BROWSER_DATABASE_URL is required");
await fs.mkdir(artifactDir, { recursive: true });

const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const page = pages.find((item) => item.type === "page");
if (!page) throw new Error("fresh Chrome page target not found");
const socket = new WebSocket(page.webSocketDebuggerUrl);
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
function send(method, params = {}, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeout = 25_000) {
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
async function navigate(pathname, ready = ".app-shell") {
  await send("Page.navigate", { url: `${webOrigin}${pathname}` });
  await waitFor("document.readyState === 'complete'");
  await waitFor(`document.querySelector(${JSON.stringify(ready)}) !== null`);
  await sleep(300);
}
async function setToken(token) {
  await navigate("/login", "body");
  await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`);
  await navigate("/today");
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 });
  await waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
  return dimensions();
}
async function dimensions() {
  return evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })");
}
async function screenshot(name) {
  const size = await dimensions();
  assert.ok(size.scrollWidth <= size.innerWidth, `${name} has horizontal overflow: ${JSON.stringify(size)}`);
  if (size.innerWidth === 375) assert.deepEqual(size, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 });
  const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  const file = path.join(artifactDir, name);
  await fs.writeFile(file, Buffer.from(capture.data, "base64"));
  return { file, ...size };
}
async function click(expression) {
  const clicked = await evaluate(`(() => { const node = ${expression}; if (!node) return false; node.click(); return true; })()`);
  assert.equal(clicked, true, `click target missing: ${expression}`);
  await sleep(250);
}
async function clickButton(text, within = "document") {
  return click(`[...${within}.querySelectorAll('button')].find((node) => node.textContent.trim() === ${JSON.stringify(text)})`);
}
async function setInput(selector, value) {
  const changed = await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(node, ${JSON.stringify(value)}); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  assert.equal(changed, true, `input target missing: ${selector}`);
  await sleep(100);
}
async function openTaskComposer(targetExpression) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await click(targetExpression);
    const started = Date.now();
    while (Date.now() - started < 2_000) {
      if (await evaluate("document.querySelector('input[aria-label=\"任务标题\"]') !== null")) return;
      await sleep(100);
    }
  }
  throw new Error("real Task composer did not open after publish action");
}
async function register(label) {
  return api("/auth/register", { username: `onboard_${label}_${String(Date.now()).slice(-10)}`, displayName: `Onboarding ${label}`, password: "onboarding-browser-password" });
}
async function completeCoreLoop(title, evidencePrefix, mobile = false) {
  await waitFor("document.querySelector('#onboarding-welcome-title') !== null");
  const welcome = await screenshot(`WB-ONBOARDING-welcome-${evidencePrefix}.png`);
  await clickButton("开始新手教学");
  await waitFor("document.querySelector('.onboarding-coach')?.textContent.includes('发布一个小悬赏')");
  const publish = await screenshot(`WB-ONBOARDING-publish-${evidencePrefix}.png`);

  if (mobile) {
    await click("document.querySelector('[data-guide-anchor=\"quick-action.task.publish.entry\"]')");
    await waitFor("document.querySelector('[data-guide-anchor=\"quick-action.task.publish\"]') !== null");
    assert.ok(await evaluate("document.querySelector('.onboarding-coach')?.textContent.includes('发布一个小悬赏')"));
    await screenshot("WB-ONBOARDING-quick-action-375.png");
    await openTaskComposer("document.querySelector('[data-guide-anchor=\"quick-action.task.publish\"]')");
  } else {
    await send("Page.navigate", { url: `${webOrigin}/finance` });
    await waitFor("location.pathname === '/today'");
    await waitFor("document.querySelector('[data-guide-anchor=\"task.publish\"]') !== null");
    await waitFor("document.querySelector('.onboarding-coach')?.textContent.includes('发布一个小悬赏')");
    await sleep(350);
    await openTaskComposer("document.querySelector('[data-guide-anchor=\"task.publish\"]')");
  }

  await setInput('input[aria-label="任务标题"]', title);
  await clickButton("发布", "document.querySelector('.task-create-modal')");
  await waitFor("document.querySelector('.onboarding-coach')?.textContent.includes('接取这个悬赏')", 45_000);
  if (!mobile) await screenshot("WB-ONBOARDING-accept-1440.png");
  await click("document.querySelector('[data-guide-anchor=\"task.accept\"]:not([data-guide-task-id])')");
  await waitFor("document.querySelector('.task-selection-modal') !== null");
  await waitFor("document.querySelector('[data-guide-anchor=\"task.accept\"][data-guide-task-id] input') !== null");
  await click("document.querySelector('[data-guide-anchor=\"task.accept\"][data-guide-task-id] input')");
  await clickButton("确认接取", "document.querySelector('.task-selection-modal')");
  await waitFor("document.querySelector('[data-guide-anchor=\"task.start\"][data-guide-task-id]') !== null");
  await click("document.querySelector('[data-guide-anchor=\"task.start\"][data-guide-task-id]')");
  await waitFor("document.querySelector('#onboarding-complete-title') !== null", 30_000);
  await clickButton("开始行动");
  await waitFor("document.querySelector('.onboarding-checklist') !== null");
  await evaluate("document.querySelector('.onboarding-checklist').scrollIntoView({ block: 'center' })");
  await sleep(200);
  const checklist = await screenshot(`WB-ONBOARDING-checklist-${evidencePrefix}.png`);
  return { welcome, publish, checklist };
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

await send("Page.enable");
await send("Runtime.enable");

await viewport(1440, 900);
const desktopOwner = await register("desktop");
await setToken(desktopOwner.token);
const desktopEvidence = await completeCoreLoop("阅读 20 分钟", "1440");
const desktopUserId = desktopOwner.user.id;
const [[desktopFacts]] = await db.query(`SELECT
  (SELECT COUNT(*) FROM tasks WHERE user_id=? AND title='阅读 20 分钟' AND deleted_at IS NULL) task_count,
  (SELECT COUNT(*) FROM task_daily_assignments WHERE user_id=?) assignment_count,
  (SELECT COUNT(*) FROM timer_sessions WHERE user_id=? AND status=0 AND deleted_at IS NULL) running_timer_count`, [desktopUserId, desktopUserId, desktopUserId]);
assert.deepEqual({ taskCount: Number(desktopFacts.task_count), assignmentCount: Number(desktopFacts.assignment_count), runningTimerCount: Number(desktopFacts.running_timer_count) }, { taskCount: 1, assignmentCount: 1, runningTimerCount: 1 });

await send("Page.reload", { ignoreCache: true });
await waitFor("document.querySelector('.app-shell') !== null");
await waitFor("[...document.querySelectorAll('button')].some((node) => node.textContent.trim() === '结束本次')");
assert.equal(await evaluate("document.querySelector('#onboarding-welcome-title') === null && document.querySelector('#onboarding-complete-title') === null"), true);
await clickButton("结束本次");
await waitFor("document.querySelector('#finish-title') !== null");
await clickButton("结束本次", "document.querySelector('.finish-dialog')");
await waitFor("document.querySelector('.onboarding-hint')?.textContent.includes('计时结束 ≠ 任务完成')", 30_000);
await click("document.querySelector('.onboarding-hint button[aria-label=\"关闭提示\"]')");
await waitFor("document.querySelector('.onboarding-hint') === null");
await waitFor("document.querySelector('input[aria-label=\"完成阅读 20 分钟\"]') !== null");
await click("document.querySelector('input[aria-label=\"完成阅读 20 分钟\"]')");
await waitFor("document.querySelector('.time-modal')?.textContent.includes('任务完成了')");
await clickButton("直接完成", "document.querySelector('.time-modal')");
await waitFor("document.querySelector('.onboarding-hint')?.textContent.includes('任务完成 ✓')", 30_000);
await click("document.querySelector('.onboarding-hint button[aria-label=\"关闭提示\"]')");
await waitFor("document.querySelector('.onboarding-hint') === null");
await send("Page.reload", { ignoreCache: true });
await waitFor("document.querySelector('.app-shell') !== null");
await sleep(700);
assert.equal(await evaluate("document.querySelector('.onboarding-hint') === null && document.querySelector('#onboarding-welcome-title') === null"), true);
const [[hintFacts]] = await db.query("SELECT SUM(hint_key='timer-end') timer_end, SUM(hint_key='completion') completion FROM onboarding_hint_state WHERE user_id=?", [desktopUserId]);
assert.deepEqual({ timerEnd: Number(hintFacts.timer_end), completion: Number(hintFacts.completion) }, { timerEnd: 1, completion: 1 });
const domainTables = ["tasks", "task_daily_assignments", "timer_sessions", "timer_segments", "schedules", "task_completion_events", "reward_events", "quick_notes", "morning_writings", "journals", "finance_transactions", "writing_inspirations"];
async function domainCounts(userId) {
  return Object.fromEntries(await Promise.all(domainTables.map(async (table) => {
    const [[row]] = await db.query(`SELECT COUNT(*) count FROM ${table} WHERE user_id=?`, [userId]);
    return [table, Number(row.count)];
  })));
}
const beforeRestart = await domainCounts(desktopUserId);
await api("/onboarding/flows/core-loop/restart", {}, desktopOwner.token);
const afterRestart = await domainCounts(desktopUserId);
assert.deepEqual(afterRestart, beforeRestart);

await viewport(375, 812);
const mobileOwner = await register("mobile");
await setToken(mobileOwner.token);
const mobileEvidence = await completeCoreLoop("移动端阅读 20 分钟", "375", true);
const mobileUserId = mobileOwner.user.id;
const [[mobileFacts]] = await db.query(`SELECT
  (SELECT COUNT(*) FROM tasks WHERE user_id=? AND title='移动端阅读 20 分钟' AND deleted_at IS NULL) task_count,
  (SELECT COUNT(*) FROM task_daily_assignments WHERE user_id=?) assignment_count,
  (SELECT COUNT(*) FROM timer_sessions WHERE user_id=? AND status=0 AND deleted_at IS NULL) running_timer_count`, [mobileUserId, mobileUserId, mobileUserId]);
assert.deepEqual({ taskCount: Number(mobileFacts.task_count), assignmentCount: Number(mobileFacts.assignment_count), runningTimerCount: Number(mobileFacts.running_timer_count) }, { taskCount: 1, assignmentCount: 1, runningTimerCount: 1 });

console.log(JSON.stringify({
  exactViewport: "PASS",
  routeRecovery: "PASS",
  desktopRealFacts: desktopFacts,
  mobileRealFacts: mobileFacts,
  hintsDoNotRepeat: "PASS",
  restartPreservesDomainFacts: "PASS",
  evidence: { desktopEvidence, mobileEvidence }
}, null, 2));
await db.end();
socket.close();
