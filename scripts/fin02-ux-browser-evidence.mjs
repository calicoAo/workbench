import fs from "node:fs/promises";

const token = process.env.FIN02_UX_TOKEN;
if (!token) throw new Error("FIN02_UX_TOKEN is required");
const cdpOrigin = process.env.FIN02_UX_CDP_ORIGIN ?? "http://127.0.0.1:9230";
const webOrigin = process.env.FIN02_UX_WEB_ORIGIN ?? "http://127.0.0.1:5182";
const apiOrigin = process.env.FIN02_UX_API_ORIGIN ?? "http://127.0.0.1:3012";
const reports = new URL("../docs/reports/", import.meta.url);
const pages = await fetch(`${cdpOrigin}/json/list`).then((r) => r.json());
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
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 }); }
async function navigate(path) { await send("Page.navigate", { url: `${webOrigin}${path}` }); await waitFor("document.readyState === 'complete'"); await waitFor("document.querySelector('.app-shell') !== null"); await sleep(700); }
async function screenshot(name) { const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); await fs.writeFile(new URL(name, reports), Buffer.from(result.data, "base64")); }
async function click(expression) { if (!await evaluate(`(() => { const node = ${expression}; if (!node) return false; node.click(); return true; })()`)) throw new Error(`Control not found: ${expression}`); await sleep(450); }
async function clickButtonText(text) { await click(`[...document.querySelectorAll('button')].find((node) => node.textContent.trim() === ${JSON.stringify(text)})`); }
async function api(path, body) { return evaluate(`fetch(${JSON.stringify(`${apiOrigin}/api` + path)}, { method: ${JSON.stringify(body ? "POST" : "GET")}, headers: { "content-type": "application/json", Authorization: "Bearer " + localStorage.getItem("personal_workbench_token") }, ${body ? `body: ${JSON.stringify(JSON.stringify(body))}` : ""} }).then((response) => response.json())`); }
async function setSelect(label, value) { await evaluate(`(() => { const label = [...document.querySelectorAll('label')].find((node) => node.textContent.includes(${JSON.stringify(label)})); const select = label?.querySelector('select'); if (!select) return false; select.value = ${JSON.stringify(String(value))}; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(150); }
async function setInput(label, value) { await evaluate(`(() => { const label = [...document.querySelectorAll('label')].find((node) => node.textContent.includes(${JSON.stringify(label)})); const input = label?.querySelector('input'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(String(value))}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(150); }

await send("Page.enable"); await send("Runtime.enable"); await viewport(1440, 900);
await send("Page.navigate", { url: `${webOrigin}/` }); await waitFor("document.readyState === 'complete'"); await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)}); localStorage.setItem("personal-workbench:sidebar-collapsed", "false");`); await send("Page.reload"); await waitFor("document.querySelector('.app-shell') !== null"); await sleep(700);

// The principal transfer is submitted through the public Finance UI.
await navigate("/finance?date=2026-09-22"); await click("[...document.querySelectorAll('.finance-head-actions button')].find((node) => node.textContent.includes('转账'))"); await waitFor("document.querySelector('.finance-record-dialog') !== null"); await setSelect("转出账户", 1); await setSelect("转入账户", 2); await setInput("转账金额", "200.00"); await setInput("备注", "ux transfer browser flow"); await clickButtonText("保存转账"); await waitFor("document.querySelector('.finance-overview') !== null");

// Create the relation records through the public command endpoints, then inspect them in the browser read model.
const fixtureList = await api("/finance/transactions");
const fixtureId = (note) => fixtureList.data.items.find((item) => item.note === note)?.id;
const bankFixtureId = fixtureId("bank fixture");
const cashFixtureId = fixtureId("cash fixture");
const creditFixtureId = fixtureId("credit fixture");
if (!bankFixtureId || !cashFixtureId || !creditFixtureId) throw new Error("Finance fixture transactions were not created");
await api(`/finance/transactions/${bankFixtureId}/refunds`, { operationId: crypto.randomUUID(), expectedVersion: 1, amountCents: "3000", occurredDate: "2026-09-22", occurredTime: "11:00" });
await api(`/finance/transactions/${cashFixtureId}/correct`, { operationId: crypto.randomUUID(), expectedVersion: 1, amountCents: "4000", accountId: 1, categoryId: 1, occurredDate: "2026-09-22", occurredTime: "11:30" });
await api(`/finance/transactions/${creditFixtureId}/void`, { operationId: crypto.randomUUID(), expectedVersion: 1, occurredDate: "2026-09-22", occurredTime: "11:45" });

await navigate("/finance?date=2026-09-22&tab=transactions"); await waitFor("document.querySelectorAll('.finance-transaction-list > button').length > 0"); await screenshot("WB-R3-FIN02-transactions-1440.png");
await click(`[...document.querySelectorAll('.finance-transaction-list > button')].find((node) => node.textContent.includes('ux transfer browser flow'))`); await waitFor("document.querySelector('.finance-detail-summary')?.textContent.includes('转出：Bank')"); await screenshot("WB-R3-FIN02-transfer-detail-1440.png");
await click("document.querySelector('.ui-icon-button[aria-label=关闭]')"); await click(`[...document.querySelectorAll('.finance-transaction-list > button')].find((node) => node.textContent.includes('bank fixture'))`); await waitFor("document.querySelector('.finance-detail-summary')?.textContent.includes('原支出')"); await screenshot("WB-R3-FIN02-refund-detail-1440.png");
await click("document.querySelector('.ui-icon-button[aria-label=关闭]')"); await click(`[...document.querySelectorAll('.finance-transaction-list > button')].find((node) => node.textContent.includes('cash fixture'))`); await waitFor("[...document.querySelectorAll('.finance-detail-summary')].some((node) => node.textContent.includes('原记录') && node.textContent.includes('当前有效记录'))"); await screenshot("WB-R3-FIN02-corrected-detail-1440.png");
await click("document.querySelector('.ui-icon-button[aria-label=关闭]')"); await click(`[...document.querySelectorAll('.finance-transaction-list > button')].find((node) => node.textContent.includes('credit fixture'))`); await waitFor("[...document.querySelectorAll('.finance-detail-summary')].some((node) => node.textContent.includes('已作废'))"); await screenshot("WB-R3-FIN02-void-detail-1440.png");

await viewport(375, 812); await navigate("/today?date=2026-09-22"); await click("document.querySelector('.quick-action')"); await waitFor("document.querySelector('.quick-add-menu') !== null"); await screenshot("WB-R3-FIN02-quick-action-375.png"); await click("document.querySelector('.quick-add-more')"); await waitFor("document.querySelector('.quick-add-menu.is-more-open') !== null"); await screenshot("WB-R3-FIN02-quick-action-more-375.png");
await navigate("/finance?date=2026-09-22&action=transfer&nonce=ux-mobile"); await waitFor("document.querySelector('.finance-record-dialog') !== null"); await setSelect("转入账户", 3); await setInput("转账金额", "80.00"); await waitFor("document.querySelector('.finance-repayment-preview') !== null"); await screenshot("WB-R3-FIN02-credit-repayment-375.png"); await click("document.querySelector('.ui-icon-button[aria-label=关闭]')");
await navigate("/finance?date=2026-09-22&action=transfer&nonce=ux-mobile-transfer"); await waitFor("document.querySelector('.finance-record-dialog') !== null"); await setSelect("转出账户", 1); await setSelect("转入账户", 2); await setInput("转账金额", "200.00"); await screenshot("WB-R3-FIN02-transfer-375.png");
const evidence = await evaluate(`({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, menuLabels: [...document.querySelectorAll('.quick-add-menu button')].map((node) => node.textContent.trim()), preview: document.querySelector('.finance-repayment-preview')?.textContent ?? null })`);
console.log(JSON.stringify(evidence, null, 2)); socket.close();
