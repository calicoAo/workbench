import fs from "node:fs/promises";

const token = process.env.FIN03_BROWSER_TOKEN;
if (!token) throw new Error("FIN03_BROWSER_TOKEN is required");
const cdpOrigin = process.env.FIN03_BROWSER_CDP_ORIGIN ?? "http://127.0.0.1:9230";
const webOrigin = process.env.FIN03_BROWSER_WEB_ORIGIN ?? "http://127.0.0.1:5183";
const apiOrigin = process.env.FIN03_BROWSER_API_ORIGIN ?? "http://127.0.0.1:3000";
const reports = new URL("../docs/reports/", import.meta.url);
const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0; const pending = new Map();
socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id) return; const job = pending.get(message.id); pending.delete(message.id); if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const messageId = ++id; pending.set(messageId, { resolve, reject }); socket.send(JSON.stringify({ id: messageId, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 15000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } throw new Error(`Timed out: ${expression}`); }
async function api(path, body) { const response = await fetch(`${apiOrigin}/api${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }); const json = await response.json(); if (response.status >= 400) throw new Error(`${path}: ${response.status} ${JSON.stringify(json)}`); return json.data; }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const evidence = await evaluate(`({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth })`); if (evidence.width !== width || evidence.height !== height || evidence.scrollWidth !== width) throw new Error(`viewport assertion failed: ${JSON.stringify(evidence)}`); return evidence; }
async function navigate(path) { await send("Page.navigate", { url: `${webOrigin}${path}` }); await waitFor("document.readyState === 'complete'"); await waitFor("document.querySelector('.app-shell') !== null"); await sleep(600); }
async function screenshot(name) { const evidence = await evaluate("({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth })"); if (evidence.scrollWidth !== evidence.width) throw new Error(`horizontal overflow before ${name}: ${JSON.stringify(evidence)}`); const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); await fs.writeFile(new URL(name, reports), Buffer.from(result.data, "base64")); return evidence; }
async function click(selector) { if (!await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`)) throw new Error(`missing control ${selector}`); await sleep(250); }

// Seed the same Finance-owned read model consumed by all four browser views.
const initialized = await api("/finance/initialize", { operationId: crypto.randomUUID() });
const categories = await api("/finance/categories");
const category = categories.find((item) => item.kind === "EXPENSE");
const account = await api("/finance/accounts", { operationId: crypto.randomUUID(), name: "浏览器验收账户", type: "BANK", openingDate: "2026-01-01", openingBalanceCents: "0", includeInOverview: true });
await api("/finance/expenses", { operationId: crypto.randomUUID(), accountId: account.id, categoryId: category.id, amountCents: "10000", occurredDate: "2026-09-10", occurredTime: "12:00", note: "FIN03 browser expense" });
await api("/finance/budgets", { operationId: crypto.randomUUID(), budgetMonth: "2026-09", limitCents: "20000" });
await api("/finance/recurring-templates", { operationId: crypto.randomUUID(), type: "EXPENSE", name: "浏览器周期支出", amountCents: "3000", accountId: account.id, categoryId: category.id, frequency: "MONTHLY", scheduleValue: 5, startDate: "2026-09-01" });
await api("/finance/recurring-occurrences/prepare", { operationId: crypto.randomUUID(), from: "2026-09-01", to: "2026-09-20" });
if (!initialized) throw new Error("Finance initialize failed");

await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: `${webOrigin}/` }); await waitFor("document.readyState === 'complete'"); await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)}); localStorage.setItem("personal-workbench:sidebar-collapsed", "false");`); await send("Page.reload"); await waitFor("document.querySelector('.app-shell') !== null");

await viewport(1440, 900); await navigate("/finance?date=2026-09-20&tab=overview"); await waitFor("document.querySelector('.finance-overview') !== null"); const overviewViewport = await screenshot("WB-R3-FIN03-overview-1440.png");
await navigate("/finance?date=2026-09-20&tab=budgets"); await waitFor("document.querySelector('.finance-budget-page') !== null"); if (!await evaluate("Boolean(document.querySelector('.finance-budget-page form button'))")) throw new Error("budget create control missing"); const budgetViewport = await screenshot("WB-R3-FIN03-budget-1440.png");
await navigate("/finance?date=2026-09-20&tab=recurring"); await waitFor("document.querySelector('.finance-recurring-page') !== null"); if (!await evaluate("document.querySelector('.finance-recurring-page').textContent.includes('待确认发生项')")) throw new Error("recurring pending state missing"); const recurringViewport = await screenshot("WB-R3-FIN03-recurring-1440.png");
await navigate("/finance?date=2026-09-20&tab=reports"); await waitFor("document.querySelector('.finance-report-page') !== null"); if (!await evaluate("document.querySelector('.finance-report-page').textContent.includes('分类支出')")) throw new Error("report category breakdown missing"); const reportViewport = await screenshot("WB-R3-FIN03-report-1440.png");

await viewport(375, 812); await navigate("/finance?date=2026-09-20&tab=budgets"); await waitFor("document.querySelector('.finance-budget-page') !== null"); const budgetMobileViewport = await screenshot("WB-R3-FIN03-budget-375.png");
await navigate("/finance?date=2026-09-20&tab=recurring"); await waitFor("document.querySelector('.finance-recurring-page') !== null"); const recurringMobile = await evaluate(`(() => { const text = document.querySelector('.finance-recurring-page')?.textContent ?? ''; const button = [...document.querySelectorAll('.finance-occurrence-list button')].find((node) => node.textContent.includes('确认入账')); const rect = button?.getBoundingClientRect(); return { expectedNotPosted: text.includes('预计入账') && text.includes('未入账'), affectsBalance: text.includes('影响真实余额'), confirmReachable: Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight), buttonText: button?.textContent.trim() ?? null }; })()`); if (!recurringMobile.expectedNotPosted || !recurringMobile.affectsBalance || !recurringMobile.confirmReachable) throw new Error(`mobile recurring assertion failed: ${JSON.stringify(recurringMobile)}`); const recurringMobileViewport = await screenshot("WB-R3-FIN03-recurring-confirm-375.png");
await navigate("/finance?date=2026-09-20&tab=reports"); await waitFor("document.querySelector('.finance-report-page') !== null"); const reportMobile = await evaluate(`(() => { const page = document.querySelector('.finance-report-page'); return { vertical: Boolean(page?.querySelector('.finance-report-summary')), readable: ['收入', '支出', '净现金流', '分类支出', '账户净变动', '已核对'].every((label) => page?.textContent.includes(label)) }; })()`); if (!reportMobile.vertical || !reportMobile.readable) throw new Error(`mobile report assertion failed: ${JSON.stringify(reportMobile)}`); const reportMobileViewport = await screenshot("WB-R3-FIN03-report-375.png");
console.log(JSON.stringify({ exactViewport: "PASS", overviewViewport, budgetViewport, recurringViewport, reportViewport, budgetMobileViewport, recurringMobileViewport, reportMobileViewport, recurringMobile, reportMobile }, null, 2)); socket.close();
