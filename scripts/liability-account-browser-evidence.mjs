import assert from "node:assert/strict";
import fs from "node:fs/promises";
import mysql from "mysql2/promise";

// Run only against a freshly migrated, disposable QA database/API and Chrome profile.
const databaseUrl = process.env.TEST_DATABASE_URL;
const token = process.env.LIABILITY_BROWSER_TOKEN;
if (!token || !databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("Require LIABILITY_BROWSER_TOKEN and an isolated TEST_DATABASE_URL ending in _test");
const apiOrigin = process.env.LIABILITY_BROWSER_API_ORIGIN ?? "http://127.0.0.1:3010";
const webOrigin = process.env.LIABILITY_BROWSER_WEB_ORIGIN ?? "http://127.0.0.1:5180";
const cdpOrigin = process.env.LIABILITY_BROWSER_CDP_ORIGIN ?? "http://127.0.0.1:9338";
const reports = new URL("../docs/reports/", import.meta.url);
const prefix = "WB-PRODUCT-CLOSURE-02-LIABILITY-ACCOUNT";
const connection = await mysql.createConnection(databaseUrl);
const pages = await fetch(`${cdpOrigin}/json/list`).then((r) => r.json());
const socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0; const pending = new Map();
socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id) return; const job = pending.get(message.id); pending.delete(message.id); if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const messageId = ++id; pending.set(messageId, { resolve, reject }); socket.send(JSON.stringify({ id: messageId, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function waitFor(expression) { const start = Date.now(); while (Date.now() - start < 15000) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(100); } throw new Error(`Timed out: ${expression}`); }
async function api(path, body) {
  const response = await fetch(`${apiOrigin}/api/finance${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify({ operationId: crypto.randomUUID(), ...body }) } : {}) });
  const json = await response.json(); assert.equal(response.status, 200, JSON.stringify(json)); return json.data;
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
}
async function screenshot(suffix) {
  await sleep(250); // Capture the settled modal/viewport layout, after entrance transitions.
  const metrics = await evaluate("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})");
  assert.equal(metrics.scrollWidth, metrics.width, "horizontal page overflow");
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(new URL(`${prefix}-${suffix}.png`, reports), Buffer.from(image.data, "base64")); return metrics;
}
async function clickText(text) {
  assert.ok(await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)}); if(!button)return false;button.click();return true;})()`), `missing button ${text}`);
}
async function clickLabel(label) { assert.ok(await evaluate(`(() => {const button=document.querySelector('button[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!button)return false;button.click();return true;})()`), `missing ${label}`); }
async function setField(selector, value) {
  assert.ok(await evaluate(`(() => {const field=document.querySelector(${JSON.stringify(selector)});if(!field)return false; const prototype=field.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`), `missing ${selector}`);
}
async function closed() { await waitFor("!document.querySelector('form.finance-dialog')"); }
async function group(name) { return evaluate(`document.querySelector('section[aria-label='+${JSON.stringify(JSON.stringify(name))}+']').textContent`); }
async function ledger() {
  const [entries] = await connection.query("SELECT * FROM finance_entries ORDER BY id");
  const [transactions] = await connection.query("SELECT * FROM finance_transactions ORDER BY id");
  return { entries, transactions };
}

try {
  await api("/initialize", {});
  const fixtures = [
    ["工资卡", "BANK", "100000", true], ["现金钱包", "CASH", "1000", true], ["支付钱包", "PAYMENT", "0", false],
    ["分期欠款", "CREDIT", "-20000", true], ["已结清信用卡", "CREDIT", "0", false], ["预存信用卡", "CREDIT", "12500", true],
    ["归档资产", "BANK", "5500", true], ["归档借款", "CREDIT", "-6000", false],
  ];
  const ids = {};
  for (const [name, type, openingBalanceCents, includeInOverview] of fixtures) {
    const created = await api("/accounts", { name, type, openingBalanceCents, includeInOverview, openingDate: "2026-10-01" }); ids[name] = created.id;
    if (name.startsWith("归档")) await api(`/accounts/${created.id}/archive`, { expectedVersion: 1 });
  }
  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: webOrigin }); await waitFor("document.readyState==='complete'");
  await evaluate(`localStorage.setItem('personal_workbench_token',${JSON.stringify(token)});localStorage.setItem('personal-workbench:sidebar-collapsed','false');`);
  await send("Page.navigate", { url: `${webOrigin}/finance?date=2026-10-11&tab=accounts` });
  await waitFor("document.querySelector('.finance-account-list article')");
  if (await evaluate("[...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='直接进入')")) {
    await clickText("直接进入"); await waitFor("![...document.querySelectorAll('button')].some(n=>n.textContent.trim()==='直接进入')");
  }
  await sleep(800);
  if (await evaluate("Boolean(document.querySelector('.earth-entry-close'))")) {
    await evaluate("document.querySelector('.earth-entry-close').click()"); await waitFor("!document.querySelector('.earth-entry-backdrop')");
  }
  const screenshots = {};
  for (const [width, height] of [[1440, 1000], [375, 812]]) {
    await viewport(width, height);
    for (const [section, names] of [["资产账户", ["工资卡", "现金钱包", "支付钱包"]], ["负债账户", ["分期欠款", "已结清信用卡", "预存信用卡"]]]) {
      const text = await group(section); for (const name of names) assert.ok(text.includes(name)); assert.ok(!text.includes("归档"));
    }
    const layout = await evaluate(`(() => {const rows=[...document.querySelectorAll('.finance-account-list article')];return rows.map(row=>{const bounds=row.getBoundingClientRect();const button=row.querySelector('button').getBoundingClientRect();const balance=row.querySelector('.finance-account-balance').getBoundingClientRect();const identity=row.querySelector('div').getBoundingClientRect();const minimum=innerWidth<768?44:24;return {buttonInside:button.left>=bounds.left&&button.right<=bounds.right&&button.bottom<=bounds.bottom,usable:button.width>=minimum&&button.height>=minimum,besideIdentity:innerWidth>=768||button.top<identity.bottom,balanceInside:balance.left>=bounds.left&&balance.right<=bounds.right};});})()`);
    assert.ok(layout.every(row => row.buttonInside && row.usable && row.besideIdentity && row.balanceInside), JSON.stringify(layout));
    screenshots[`accounts${width}`] = await screenshot(`accounts-${width}`);
    if (width < 768) {
      await evaluate("document.querySelector('section[aria-label=负债账户]').scrollIntoView({block:'center'})");
      screenshots.liabilities375 = await screenshot("liabilities-375");
      await evaluate("scrollTo(0,0)");
    }
  }
  // Actual public form -> existing API -> MySQL opening ledger, at the narrow mobile viewport.
  await clickText("创建账户"); await waitFor("document.querySelector('form.finance-dialog')");
  await setField("form.finance-dialog input[maxlength]", "个人借款");
  await setField("form.finance-dialog select", "CREDIT"); await waitFor("document.querySelector('[aria-label=当前欠款]')");
  await setField("[aria-label=当前欠款]", "3200");
  screenshots.create375 = await screenshot("create-375");
  await viewport(1440, 1000); screenshots.create1440 = await screenshot("create-1440");
  await clickText("保存"); await closed(); await waitFor("document.querySelector('.finance-account-list').parentElement.parentElement.textContent.includes('个人借款')");
  const debt = (await api("/accounts?view=all")).find(item => item.name === "个人借款");
  assert.equal(debt.type, "CREDIT"); assert.equal(debt.balanceCents, "-320000");
  const [opening] = await connection.query("SELECT t.type,CAST(e.amount_cents AS CHAR) AS cents FROM finance_entries e JOIN finance_transactions t ON t.id=e.transaction_id WHERE e.account_id=?", [debt.id]);
  assert.deepEqual(opening.map(row => ({ ...row })), [{ type: 0, cents: "-320000" }]); // Existing SQL enum: OPENING = 0.
  const history = await api(`/transactions?accountId=${debt.id}`);
  assert.equal(history.items.length, 1); assert.equal(history.items[0].type, "OPENING"); assert.equal(history.items[0].amountCents, "-320000");
  const overview = await api("/overview?month=2026-10");
  assert.deepEqual([overview.totalAssetsCents, overview.totalLiabilitiesCents, overview.netWorthCents, overview.monthlyIncomeCents, overview.monthlyExpenseCents], ["113500", "340000", "-226500", "0", "0"]);
  // Saving metadata on a prepaid CREDIT leaves every Entry/Transaction untouched.
  const originalLedger = await ledger();
  await clickLabel("编辑 预存信用卡"); await waitFor("document.querySelector('form.finance-dialog')");
  assert.ok(await evaluate("document.querySelector('form.finance-dialog').textContent.includes('预存 ¥125.00')"));
  assert.equal(await evaluate("Boolean(document.querySelector('[aria-label=当前欠款],[aria-label=期初余额]'))"), false);
  await setField("form.finance-dialog input[maxlength]", "预存信用卡更名"); await clickText("保存"); await closed();
  assert.deepEqual(await ledger(), originalLedger);
  const renamed = (await api("/accounts?view=all")).find(item => item.id === ids["预存信用卡"]);
  assert.equal(renamed.balanceCents, "12500"); assert.equal(renamed.name, "预存信用卡更名");
  await clickLabel("编辑 个人借款"); await clickText("归档账户"); await closed();
  assert.ok(!(await group("负债账户")).includes("个人借款"));
  await evaluate("document.querySelector('.finance-check input').click()"); await waitFor("document.querySelector('section[aria-label=已归档账户]')");
  for (const name of ["个人借款", "归档借款", "归档资产"]) assert.ok((await group("已归档账户")).includes(name));
  await clickLabel("编辑 个人借款"); await clickText("恢复账户"); await closed();
  assert.ok((await group("负债账户")).includes("个人借款")); assert.ok(!(await group("已归档账户")).includes("个人借款"));
  assert.deepEqual(await ledger(), originalLedger);
  const restored = (await api("/accounts?view=all")).find(item => item.id === debt.id);
  assert.equal(restored.balanceCents, "-320000"); assert.equal(restored.includeInOverview, true);
  await viewport(375, 812); await evaluate("document.querySelector('section[aria-label=已归档账户]').scrollIntoView({block:'center'})");
  screenshots.archived375 = await screenshot("archived-375");
  const evidence = { result: "PASS", screenshots, opening: opening.map(row => ({ ...row })), overview: { assets: overview.totalAssetsCents, liabilities: overview.totalLiabilitiesCents, netWorth: overview.netWorthCents, income: overview.monthlyIncomeCents, expense: overview.monthlyExpenseCents }, metadataLedgerUnchanged: true, archiveRestoreLedgerUnchanged: true, restored: { balanceCents: restored.balanceCents, includeInOverview: restored.includeInOverview } };
  await fs.writeFile(new URL(`${prefix}-browser.json`, reports), JSON.stringify(evidence, null, 2) + "\n"); console.log(JSON.stringify(evidence, null, 2));
} finally { socket.close(); await connection.end(); }
