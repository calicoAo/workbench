import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Run only against a disposable, freshly migrated test database/API.
// Fixture setup uses public APIs; generation and posting must use the real UI.
const token = process.env.RECURRING_BROWSER_TOKEN;
if (!token) throw new Error("RECURRING_BROWSER_TOKEN is required for isolated QA");
const web = process.env.RECURRING_BROWSER_WEB_ORIGIN ?? "http://127.0.0.1:5187";
const apiOrigin = process.env.RECURRING_BROWSER_API_ORIGIN ?? "http://127.0.0.1:3000";
const cdp = process.env.RECURRING_BROWSER_CDP_ORIGIN ?? "http://127.0.0.1:9337";
const output = path.resolve("docs/reports/WB-RECURRING-SELECTION-evidence");
const pages = await fetch(`${cdp}/json/list`).then(response => response.json());
const socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0;
const calls = new Map();
socket.addEventListener("message", event => { const message = JSON.parse(event.data); const call = calls.get(message.id); if (!call) return; calls.delete(message.id); message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const callId = ++id; calls.set(callId, { resolve, reject }); socket.send(JSON.stringify({ id: callId, method, params })); }); }
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) { const until = Date.now() + 15000; while (Date.now() < until) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(100); } throw new Error(`Timed out: ${expression}`); }
async function click(expression) {
  await wait(expression);
  const point = await evaluate(`(() => { const node = ${expression}; if (node.disabled) throw new Error('Control disabled'); node.scrollIntoView({ block: 'center' }); const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}
const button = label => `[...document.querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(label)})`;
const choice = name => `document.querySelector(${JSON.stringify(`input[aria-label="选择模板：${name}"]`)})`;
async function api(route, body) {
  const response = await fetch(`${apiOrigin}/api${route}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result.data;
}
async function screenshot(name, selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block: 'start'})`);
  await sleep(250);
  const viewport = await evaluate("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})");
  assert.ok(viewport.scrollWidth <= viewport.width, "page must not overflow horizontally");
  const image = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await fs.writeFile(path.join(output, name), Buffer.from(image.data, "base64"));
  return viewport;
}
const occurrences = () => api("/finance/recurring-occurrences?from=2026-10-01&to=2026-10-31");
async function generate(expectedText) {
  await click(button("生成本月待确认项"));
  await wait(`document.querySelector('.finance-prepare-result')?.textContent.includes(${JSON.stringify(expectedText)}) && !(${button("生成本月待确认项")}).disabled`);
}
try {
  await fs.mkdir(output, { recursive: true });
  await api("/finance/initialize", { operationId: crypto.randomUUID() });
  const category = (await api("/finance/categories")).find(item => item.kind === "EXPENSE");
  const account = await api("/finance/accounts", { operationId: crypto.randomUUID(), name: "周期流程验收账户", type: "BANK", openingDate: "2026-10-01", openingBalanceCents: "100000", includeInOverview: true });
  async function template(name, startDate = "2026-10-01") { return api("/finance/recurring-templates", { operationId: crypto.randomUUID(), name, type: "EXPENSE", amountCents: "2000", accountId: account.id, categoryId: category.id, frequency: "MONTHLY", scheduleValue: 26, scheduledTime: "09:45", startDate }); }
  const selected = await template("验收房租");
  const unselected = await template("验收宽带");
  const future = await template("下月才开始", "2026-11-01");
  const businessDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  await api("/hero/daily-entry/claim", { businessDate });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: web }); await wait("document.readyState === 'complete'");
  await evaluate(`localStorage.setItem('personal_workbench_token', ${JSON.stringify(token)}); localStorage.setItem('personal-workbench:sidebar-collapsed', 'false')`);
  await send("Page.navigate", { url: `${web}/finance?date=2026-10-22&tab=recurring` });
  await wait("document.querySelector('.finance-template-choice')");
  await wait("performance.getEntriesByType('resource').some(item => item.name.includes('/api/dashboard?date=2026-10-22'))");
  await sleep(500);
  assert.equal(await evaluate(`(${button("生成本月待确认项")}).disabled`), true);
  await click(choice("验收房租"));
  await generate("新增 1 项，已有 0 项");
  let rows = await occurrences();
  assert.deepEqual(rows.map(item => item.templateId), [selected.id]);
  assert.equal(rows[0].status, "PENDING");
  const balances = () => api("/finance/accounts").then(items => items.find(item => item.id === account.id).balanceCents);
  assert.equal(await balances(), "100000");
  await generate("新增 0 项，已有 1 项");
  assert.equal((await occurrences()).length, 1);
  const desktop = await screenshot("selection-1440.png", ".finance-prepare-step");
  assert.deepEqual([desktop.width, desktop.height], [1440, 900]);
  await click(button("确认入账"));
  await wait("document.querySelector('.finance-empty')");
  rows = await occurrences();
  assert.equal(rows[0].status, "POSTED");
  assert.equal(await balances(), "98000");
  // A fresh page also proves canonical state survives remount, without the reward dialog.
  await send("Page.navigate", { url: `${web}/finance?date=2026-10-22&tab=recurring` });
  await wait("document.querySelector('.finance-template-choice')");
  await wait("performance.getEntriesByType('resource').some(item => item.name.includes('/api/dashboard?date=2026-10-22'))");
  await sleep(500);
  await click(choice("验收房租"));
  await generate("新增 0 项，已有 1 项");
  assert.equal(await evaluate("document.querySelectorAll('.finance-occurrence-list article').length"), 0);
  assert.equal(await balances(), "98000");
  await click(choice("验收房租")); await click(choice("下月才开始"));
  await generate("本月没有匹配的发生日期");
  assert.equal((await occurrences()).length, 1);
  await click(choice("下月才开始")); await click(choice("验收宽带"));
  await generate("新增 1 项，已有 0 项");
  rows = await occurrences();
  assert.equal(rows.find(row => row.templateId === unselected.id).status, "PENDING");
  assert.ok(!rows.some(row => row.templateId === future.id));
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const mobile = await screenshot("pending-375.png", ".finance-prepare-result");
  assert.deepEqual([mobile.width, mobile.height], [375, 812]);
  const confirmBounds = await evaluate(`(() => { const rect = (${button("确认入账")}).getBoundingClientRect(); return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right}; })()`);
  assert.ok(confirmBounds.top >= 0 && confirmBounds.bottom < 740 && confirmBounds.left >= 0 && confirmBounds.right <= 375);
  const transactions = await api("/finance/transactions?from=2026-10-01&to=2026-10-31");
  assert.equal(transactions.items.filter(item => item.type === "EXPENSE").length, 1);
  const evidence = { pass: true, kind: "real public Web/API + isolated MySQL", desktop, mobile, selectedTemplateId: selected.id, initiallyUnselectedTemplateId: unselected.id, futureTemplateId: future.id, occurrences: rows, finalBalanceCents: await balances(), postedExpenses: 1, confirmBounds, assertions: ["explicit selection required", "unselected template excluded", "generation does not post", "repeat generation does not duplicate", "confirm posts exactly once", "posted occurrence never returns to pending", "no matching date has visible feedback", "mobile confirm avoids bottom navigation"] };
  await fs.writeFile(path.join(output, "browser.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ pass: true, output }));
} finally { socket.close(); }
