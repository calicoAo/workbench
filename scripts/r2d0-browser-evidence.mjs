import fs from "node:fs/promises";

const token = process.env.R2D0_TOKEN;
if (!token) throw new Error("R2D0_TOKEN is required");
const reports = new URL("../docs/reports/", import.meta.url);
const pages = await fetch("http://127.0.0.1:9224/json/list").then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("Chrome page target not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id) return; const job = pending.get(message.id); pending.delete(message.id); if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const messageId = ++id; pending.set(messageId, { resolve, reject }); socket.send(JSON.stringify({ id: messageId, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 10000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(100); } throw new Error(`Timed out: ${expression}`); }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 }); }
async function navigate(path) { await send("Page.navigate", { url: `http://127.0.0.1:5173${path}` }); await waitFor("document.readyState === 'complete'"); await waitFor("document.querySelector('.app-shell') !== null"); await sleep(800); }
async function screenshot(name) { const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); await fs.writeFile(new URL(name, reports), Buffer.from(result.data, "base64")); }
async function clickByText(text) { const found = await evaluate(`(() => { const node = [...document.querySelectorAll('button,a')].find((item) => item.textContent?.trim().includes(${JSON.stringify(text)})); if (!node) return false; node.click(); return true; })()`); if (!found) throw new Error(`Control not found: ${text}`); await sleep(500); }

await send("Page.enable");
await send("Runtime.enable");
await viewport(1440, 1000);
await send("Page.navigate", { url: "http://127.0.0.1:5173/" });
await waitFor("document.readyState === 'complete'");
await evaluate(`localStorage.setItem('personal_workbench_token', ${JSON.stringify(token)}); localStorage.setItem('personal-workbench:sidebar-collapsed', 'false')`);

await navigate("/today?date=2026-09-21");
await waitFor("document.querySelector('.today-grid') !== null && !document.body.textContent.includes('加载中...')");
const desktop = await evaluate(`(() => { const grid = document.querySelector('.today-grid'); const main = document.querySelector('.today-main'); const utility = document.querySelector('.today-utility'); return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, gridColumns: getComputedStyle(grid).gridTemplateColumns, mainWidth: main.getBoundingClientRect().width, utilityWidth: utility.getBoundingClientRect().width, nestedTaskScroll: getComputedStyle(document.querySelector('.today-main .space-y-2')).overflowY }; })()`);
await screenshot("WB-R2D0-today-1440.png");
await clickByText("收起");
await waitFor("getComputedStyle(document.querySelector('.app-shell')).gridTemplateColumns.startsWith('60px')");
const collapsed = await evaluate(`({ persisted: localStorage.getItem('personal-workbench:sidebar-collapsed'), gridColumns: getComputedStyle(document.querySelector('.app-shell')).gridTemplateColumns, sidebarWidth: document.querySelector('.app-sidebar').getBoundingClientRect().width })`);
await screenshot("WB-R2D0-today-collapsed-1440.png");

await viewport(1024, 900);
await navigate("/today?date=2026-09-21");
const medium = await evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, gridColumns: getComputedStyle(document.querySelector('.today-grid')).gridTemplateColumns })`);

await viewport(375, 812);
await evaluate("localStorage.setItem('personal-workbench:sidebar-collapsed', 'false')");
await navigate("/today?date=2026-09-21");
const mobile = await evaluate(`(() => { const action = document.querySelector('.quick-action').getBoundingClientRect(); const nav = document.querySelector('.mobile-nav').getBoundingClientRect(); return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, actionBottom: action.bottom, navTop: nav.top, taskRows: [...document.querySelectorAll('.task-row')].map((row) => Math.round(row.getBoundingClientRect().height)) }; })()`);
await screenshot("WB-R2D0-today-375.png");
await evaluate("scrollTo(0, document.documentElement.scrollHeight)");
await sleep(200);
mobile.bottomClearance = await evaluate(`(() => { const navTop = document.querySelector('.mobile-nav').getBoundingClientRect().top; const candidates = [...document.querySelectorAll('.today-main > *, .today-utility > *')]; const lastContentBottom = Math.max(...candidates.map((node) => node.getBoundingClientRect().bottom)); return { navTop, lastContentBottom, clear: lastContentBottom <= navTop }; })()`);
await evaluate("document.querySelector('.quick-action').click()");
await waitFor("document.querySelector('.quick-add-menu') !== null");
mobile.quickAction = await evaluate(`(() => { const menu = document.querySelector('.quick-add-menu'); const navTop = document.querySelector('.mobile-nav').getBoundingClientRect().top; return { items: [...menu.querySelectorAll('button')].map((node) => node.textContent.trim()), menuBottom: menu.getBoundingClientRect().bottom, navTop, clear: menu.getBoundingClientRect().bottom <= navTop }; })()`);

await navigate(`/calendar?date=2026-09-21&add=actual&nonce=${crypto.randomUUID()}`);
await waitFor("document.querySelector('[aria-label=\"开始日期\"]') !== null");
await screenshot("WB-R2D0-time-editor-375.png");

await navigate("/routines?date=2026-09-21&view=life&action=sleep");
await waitFor("document.querySelector('[aria-label=\"入睡日期\"]') !== null");
await screenshot("WB-R2D0-sleep-375.png");

await navigate("/settings?date=2026-09-21");
await clickByText("新增分类");
await evaluate(`document.querySelector('[aria-label="新分类名称"]').scrollIntoView({block:'center'})`);
await sleep(200);
await screenshot("WB-R2D0-category-375.png");
await evaluate(`[...document.querySelectorAll('h2')].find((node) => node.textContent === '文字与复盘')?.scrollIntoView({block:'start'})`);
await sleep(200);
await screenshot("WB-R2D0-writing-settings-375.png");

console.log(JSON.stringify({ desktop, collapsed, medium, mobile }, null, 2));
socket.close();
