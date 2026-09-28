import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const cdpOrigin = process.env.WB_IA_CDP_ORIGIN ?? "http://127.0.0.1:9336";
const webOrigin = process.env.WB_IA_WEB_ORIGIN ?? "http://127.0.0.1:5174";
const apiOrigin = process.env.WB_IA_API_ORIGIN ?? "http://127.0.0.1:3001";
const artifactDir = process.env.WB_IA_ARTIFACT_DIR ?? path.resolve("docs/reports");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } throw new Error(`Timed out: ${expression}`); }
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") { const response = await fetch(`${apiOrigin}/api${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`); return payload.data; }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(500); }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const size = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.deepEqual({ innerWidth: size.innerWidth, innerHeight: size.innerHeight }, { innerWidth: width, innerHeight: height }); if (width === 375) assert.equal(size.scrollWidth, 375); else assert.ok(size.scrollWidth <= width); }
async function screenshot(name) { const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return file; }
async function click(selector) { assert.equal(await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`), true, `missing ${selector}`); await sleep(300); }
async function setValue(selector, value) { assert.equal(await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; const setter = Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(node, ${JSON.stringify(value)}); node.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`), true, `missing ${selector}`); }

await send("Page.enable");
await send("Runtime.enable");
const owner = await api("/auth/register", { username: `ia_browser_${Date.now()}`, displayName: "IA Browser QA", password: "workbench-ia-browser-password" });
const token = owner.token;
await api("/onboarding/flows/core-loop/skip", {}, token);
await api("/settings", { writingSlots: [{ slotKey: "MORNING_WRITING", enabled: true, sortOrder: 10 }, { slotKey: "JOURNAL", enabled: true, sortOrder: 20 }, { slotKey: "STOCK_REVIEW", enabled: true, sortOrder: 30 }] }, token, "PATCH");
await api("/habits", { operationId: crypto.randomUUID(), name: "阅读 20 分钟", startDate: today, recordMode: 3, unit: "分钟", taskCompletionEnabled: false, rule: { frequencyType: 0 }, targetValue: 20 }, token);
await api("/writing/inspirations", { operationId: crypto.randomUUID(), noteDate: today, title: "整理 Adventure 信息架构", content: "保留 owner 边界，让任务、习惯和记录各自拥有唯一事实。", tagNames: ["架构", "复盘"] }, token);

await navigate("/login", "body");
await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`);
await viewport(1440, 900);
await navigate(`/today?date=${today}`);
await waitFor("document.querySelector('.daily-quest') !== null");
assert.equal(await evaluate("document.querySelectorAll('.today-grid .quick-note-capture').length"), 0);
assert.equal(await evaluate("document.querySelectorAll('.today-grid .today-growth-entry').length"), 0);
assert.equal(await evaluate("Math.round(document.querySelector('.today-quests').getBoundingClientRect().top) === Math.round(document.querySelector('.today-timeline').getBoundingClientRect().top)"), true);
const adventureDesktop = await screenshot("WB-ADVENTURE-V2-1440.png");

await click('.app-top-actions button[aria-label="随手记"]');
await waitFor("document.querySelector('[aria-label=随手记正文]') !== null");
await setValue("[aria-label=随手记正文]", "从 Header Feather 创建的真实随手记");
await click('.quick-note-editor button[type="submit"]');
await waitFor("document.querySelector('[aria-label=随手记正文]') === null");
const notes = await api("/quick-notes?state=active&limit=20", undefined, token);
assert.ok(notes.items.some((item) => item.content === "从 Header Feather 创建的真实随手记"));

await click('.water-cup-toggle[aria-label="记录第 1 杯"]');
await waitFor("document.querySelector('.water-cup-toggle[aria-pressed=true]') !== null");
const water = await api(`/water-records?date=${today}`, undefined, token);
assert.equal(water.cups, 1);
const waterDesktop = await screenshot("WB-ADVENTURE-V2-water-1440.png");

await viewport(375, 812);
await navigate(`/today?date=${today}`);
await waitFor("document.querySelector('.daily-quest') !== null");
const adventureMobile = await screenshot("WB-ADVENTURE-V2-375.png");

await viewport(1440, 900);
await navigate(`/writing?date=${today}`);
await waitFor("document.querySelectorAll('.writing-plugin-tab').length === 6");
const notebookDesktop = await screenshot("WB-NOTEBOOK-tabs-1440.png");

await navigate(`/inspirations?date=${today}`);
await waitFor("document.querySelector('.inspiration-card') !== null");
await click('.inspiration-card-actions button:last-child');
await waitFor("document.querySelector('.inspiration-card') === null");
await navigate(`/writing/archive?date=${today}`);
await waitFor("document.querySelector('.writing-archive-item') !== null");
assert.equal(await evaluate("document.querySelector('.writing-plugin-tab[aria-selected=true]').textContent.trim()"), "归档");
const archiveDesktop = await screenshot("WB-NOTEBOOK-archive-1440.png");

await viewport(375, 812);
await navigate(`/writing?date=${today}`);
await waitFor("document.querySelectorAll('.writing-plugin-tab').length === 6");
const notebookMobile = await screenshot("WB-NOTEBOOK-tabs-375.png");
await api("/settings", { fontScale: 110, locale: "en" }, token, "PATCH");
await navigate(`/today?date=${today}`);
await waitFor("document.documentElement.dataset.fontScale === '110'");
assert.equal(await evaluate("document.documentElement.scrollWidth"), 375);
assert.equal(await evaluate("[...document.querySelectorAll('.mobile-nav .shell-link span')].some((node) => node.textContent === 'Adventure')"), true);
await api("/settings", { fontScale: 90, locale: "zh-CN" }, token, "PATCH");
await navigate(`/today?date=${today}`);
await waitFor("document.documentElement.dataset.fontScale === '90'");
assert.equal(await evaluate("document.documentElement.scrollWidth"), 375);
await navigate(`/inspirations?date=${today}`);
await click(".inspiration-tag-manage-toggle");
assert.equal(await evaluate("document.documentElement.scrollWidth"), 375);
const inspirationMobile = await screenshot("WB-DOGFOOD-inspiration-tags-375.png");

console.log(JSON.stringify({ exactViewport: "PASS", headerQuickNote: "PASS", waterReality: "PASS", archiveUi: "PASS", i18nAndFontScale: "PASS", evidence: { adventureDesktop, waterDesktop, adventureMobile, notebookDesktop, archiveDesktop, notebookMobile, inspirationMobile } }, null, 2));
socket.close();
