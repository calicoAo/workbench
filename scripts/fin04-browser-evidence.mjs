import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const cdpOrigin = process.env.FIN04_BROWSER_CDP_ORIGIN ?? "http://127.0.0.1:9334";
const webOrigin = process.env.FIN04_BROWSER_WEB_ORIGIN ?? "http://127.0.0.1:5184";
const apiOrigin = process.env.FIN04_BROWSER_API_ORIGIN ?? "http://127.0.0.1:3014";
const databaseUrl = process.env.FIN04_BROWSER_DATABASE_URL;
const artifactDir = process.env.FIN04_BROWSER_ARTIFACT_DIR ?? path.resolve("docs/reports");
const fixtureDir = process.env.FIN04_BROWSER_FIXTURE_DIR ?? path.resolve("/tmp/fin04-browser-fixtures");
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("FIN04_BROWSER_DATABASE_URL must identify an isolated _test database");
await fs.mkdir(artifactDir, { recursive: true });
await fs.mkdir(fixtureDir, { recursive: true });

const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("fresh Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0;
const pending = new Map();
const eventWaiters = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    clearTimeout(job.timer);
    message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
    return;
  }
  const waiters = eventWaiters.get(message.method) ?? [];
  eventWaiters.delete(message.method);
  for (const resolve of waiters) resolve(message.params);
});
function send(method, params = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
function waitEvent(method, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`CDP event timeout: ${method}`)), timeout);
    const wrapped = (value) => { clearTimeout(timer); resolve(value); };
    eventWaiters.set(method, [...(eventWaiters.get(method) ?? []), wrapped]);
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } throw new Error(`Timed out: ${expression}`); }
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") { const response = await fetch(`${apiOrigin}/api${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`); return payload.data; }
async function setToken(token) { await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`); await send("Page.reload", { ignoreCache: true }); await waitFor("document.querySelector('.app-shell') !== null"); }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(350); if (await evaluate("document.querySelector('.onboarding-welcome') !== null")) { await clickText("直接进入"); await waitFor("document.querySelector('.onboarding-welcome') === null"); } await sleep(500); if (await evaluate("document.querySelector('.earth-entry-close') !== null")) { await evaluate("document.querySelector('.earth-entry-close').click()"); await waitFor("document.querySelector('.earth-entry-backdrop') === null"); } }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const value = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.equal(value.innerWidth, width); assert.equal(value.innerHeight, height); if (width === 375) assert.equal(value.scrollWidth, 375); else assert.ok(value.scrollWidth <= width); return value; }
async function screenshot(name) { const dimensions = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.ok(dimensions.scrollWidth <= dimensions.innerWidth, `${name} has horizontal overflow`); if (dimensions.innerWidth === 375) assert.deepEqual(dimensions, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 }); assert.equal(await evaluate("document.querySelector('.onboarding-backdrop, .earth-entry-backdrop') !== null"), false, `${name} obstructed by unrelated welcome`); const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return { file, ...dimensions }; }
async function clickText(text) { const clicked = await evaluate(`(() => { const node = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!node) return false; node.click(); return true; })()`); assert.equal(clicked, true, `missing button: ${text}`); await sleep(250); }
async function clickWithConfirm(text, expected) { const dialog = waitEvent("Page.javascriptDialogOpening"); const click = evaluate(`(() => { const node = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!node) return false; node.click(); return true; })()`); const event = await dialog; assert.match(event.message, expected); await send("Page.handleJavaScriptDialog", { accept: true }); assert.equal(await click, true); }
async function bindFile(selector, file) { const document = await send("DOM.getDocument", { depth: -1, pierce: true }); const input = await send("DOM.querySelector", { nodeId: document.root.nodeId, selector }); assert.ok(input.nodeId, `missing file input: ${selector}`); await send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }); }
async function waitForDownload(fileName) { const file = path.join(fixtureDir, fileName); const started = Date.now(); while (Date.now() - started < 15000) { try { const stat = await fs.stat(file); if (stat.size > 0) return file; } catch {} await sleep(120); } throw new Error(`download did not complete: ${fileName}`); }
async function scalar(connection, sql, values = []) { const [rows] = await connection.query(sql, values); return Number(Object.values(rows[0])[0]); }

const dbUrl = new URL(databaseUrl);
const db = await mysql.createConnection({ host: dbUrl.hostname, port: Number(dbUrl.port || 3306), user: decodeURIComponent(dbUrl.username), password: decodeURIComponent(dbUrl.password), database: dbUrl.pathname.slice(1), timezone: "Z" });
const register = async (suffix) => api("/auth/register", { username: `f4_${suffix}_${String(Date.now()).slice(-10)}`, displayName: `FIN04 ${suffix}`, password: "fin04-browser-password" });
const owner = await register("owner");
const fresh = await register("restore");
const token = owner.token;
await api("/finance/initialize", { operationId: crypto.randomUUID() }, token);
const categories = await api("/finance/categories", undefined, token);
const category = categories.find((item) => item.kind === "EXPENSE");
assert.ok(category);
const accountName = "FIN04 浏览器账户";
const account = await api("/finance/accounts", { operationId: crypto.randomUUID(), name: accountName, type: "BANK", openingDate: "2026-01-01", openingBalanceCents: "0", includeInOverview: true }, token);
await api("/finance/budgets", { operationId: crypto.randomUUID(), budgetMonth: "2026-09", limitCents: "10000" }, token);
await api("/finance/expenses", { operationId: crypto.randomUUID(), accountId: account.id, categoryId: category.id, amountCents: "2000", occurredDate: "2026-09-12", occurredTime: "10:00", note: "FIN04 possible duplicate" }, token);

const headers = "流水号,日期,时间,金额,方向,账户,分类,备注";
const exactRow = `exact-1,2026-09-11,09:00,10.00,EXPENSE,${accountName},${category.name},FIN04 exact source`;
const seedCsv = `${headers}\n${exactRow}\n`;
const mapping = { externalId: "流水号", date: "日期", time: "时间", amount: "金额", direction: "方向", account: "账户", category: "分类", note: "备注" };
const seed = await api("/finance/imports/external/preview", { operationId: crypto.randomUUID(), sourceName: "fin04-browser.csv", csv: seedCsv, timezone: "Asia/Shanghai", mapping }, token);
await api(`/finance/imports/${seed.id}/confirm`, { operationId: crypto.randomUUID(), allowPossibleDuplicates: true }, token);
const csv = `${headers}\n${exactRow}\npossible-1,2026-09-12,10:00,20.00,EXPENSE,${accountName},${category.name},FIN04 possible duplicate\nready-1,2026-09-13,11:00,30.00,EXPENSE,${accountName},${category.name},FIN04 ready search\ninvalid-1,not-a-date,12:00,40.00,EXPENSE,${accountName},${category.name},FIN04 invalid\n`;
const csvFile = path.join(fixtureDir, "fin04-browser.csv");
await fs.writeFile(csvFile, csv);

await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: fixtureDir, eventsEnabled: true });
await navigate("/login", "body");
await setToken(token);
await viewport(1440, 900);
await navigate("/finance?tab=maintenance", ".finance-data-maintenance");
const initialDownloads = (await fs.readdir(fixtureDir)).filter((name) => name.endsWith(".json") || name === "workbench-finance-data.csv");
assert.deepEqual(initialDownloads, [], "opening maintenance must not auto-export");
await bindFile("input[aria-label='导入外部流水 CSV']", csvFile);
await waitFor("document.querySelector('.finance-import-preview')?.textContent.includes('可能重复')");
const statuses = await evaluate("[...document.querySelectorAll('.finance-import-preview .ui-badge')].map((node) => node.textContent.trim())");
assert.deepEqual(statuses, ["完全重复", "可能重复", "可导入", "需要修正"]);
const previewText = await evaluate("document.querySelector('.finance-import-preview').textContent");
for (const value of ["2026-09-13", "-¥30.00", "支出", accountName, category.name]) assert.ok(previewText.includes(value), `preview missing ${value}`);
for (const value of ["EXACT_DUPLICATE", "POSSIBLE_DUPLICATE", "READY", "INVALID", " · -3000"]) assert.equal(previewText.includes(value), false, `preview leaked ${value}`);
await evaluate("document.querySelector('.finance-import-preview').scrollIntoView({ block: 'start' })"); await sleep(200);
const importPreviewDesktop = await screenshot("WB-R3-FIN04-import-preview-1440-final.png");

await viewport(375, 812);
await navigate("/finance?tab=maintenance", ".finance-data-maintenance");
await evaluate("document.querySelector('.finance-data-maintenance').scrollIntoView({ block: 'start' })"); await sleep(200);
const mobileLayout = await evaluate(`(() => { const buttons = [...document.querySelectorAll('.finance-data-actions button')]; const fabNode = document.querySelector('.quick-add-wrap'); const fab = fabNode?.getBoundingClientRect(); const nav = document.querySelector('.mobile-nav')?.getBoundingClientRect(); const overlaps = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top); return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, labels: buttons.map((button) => button.textContent.trim()), labelsFit: buttons.every((button) => button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight), fabVisible: Boolean(fabNode && getComputedStyle(fabNode).display !== 'none'), fabNavOverlap: overlaps(fab, nav) }; })()`);
assert.deepEqual({ width: mobileLayout.width, height: mobileLayout.height, scrollWidth: mobileLayout.scrollWidth }, { width: 375, height: 812, scrollWidth: 375 });
assert.equal(mobileLayout.labelsFit, true);
assert.equal(mobileLayout.fabVisible, false);
assert.equal(mobileLayout.fabNavOverlap, false);
for (const value of ["导出财务备份 JSON", "导出财务 CSV", "账本核对"]) assert.ok(mobileLayout.labels.includes(value));
const mobileDataActions = await screenshot("WB-R3-FIN04-data-actions-375-final.png");
await bindFile("input[aria-label='导入外部流水 CSV']", csvFile);
await waitFor("document.querySelector('.finance-import-preview')?.textContent.includes('可能重复')");
await evaluate("document.querySelector('.finance-import-preview').scrollIntoView({ block: 'start' })"); await sleep(200);
const mobilePreview = await evaluate("document.querySelector('.finance-import-preview').textContent");
for (const value of ["可导入", "需要修正", "完全重复", "可能重复", "-¥10.00", "-¥20.00", "-¥30.00", accountName, category.name, "支出"]) assert.ok(mobilePreview.includes(value), `mobile preview missing ${value}`);
for (const value of ["READY", "INVALID", "EXACT_DUPLICATE", "POSSIBLE_DUPLICATE", " · -1000", " · -2000", " · -3000"]) assert.equal(mobilePreview.includes(value), false, `mobile preview leaked ${value}`);
const confirmLayout = await evaluate(`(() => { const button = [...document.querySelectorAll('.finance-import-preview button')].find((node) => node.textContent.includes('确认导入可用行')); const rect = button?.getBoundingClientRect(); const nav = document.querySelector('.mobile-nav')?.getBoundingClientRect(); return { visible: Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= (nav?.top ?? innerHeight)) }; })()`);
assert.equal(confirmLayout.visible, true);
const importPreviewMobile = await screenshot("WB-R3-FIN04-import-preview-375-final.png");
await clickWithConfirm("确认导入可用行", /写入真实账本/);
await waitFor("document.querySelector('.finance-import-preview')?.textContent.includes('结果：成功')");
const resultText = await evaluate("document.querySelector('.finance-import-preview').textContent");
for (const value of ["成功 2 行", "跳过重复 1 行", "确认可能重复 1 行", "失败或待修正 1 行"]) assert.ok(resultText.includes(value), `result missing ${value}`);

await viewport(1440, 900);
const importResultDesktop = await screenshot("WB-R3-FIN04-import-result-1440.png");
await clickText("账户");
await waitFor("document.querySelector('.finance-account-list')?.textContent.includes('-¥80.00')");
await evaluate("history.back()");
await waitFor("new URLSearchParams(location.search).get('tab') === 'maintenance' && document.querySelector('.finance-data-maintenance') !== null");
await evaluate("history.forward()");
await waitFor("new URLSearchParams(location.search).get('tab') === 'accounts'");
await clickText("数据维护");
const beforeReplay = await scalar(db, "SELECT COUNT(*) FROM finance_transactions WHERE user_id = ?", [owner.user.id]);
await bindFile("input[aria-label='导入外部流水 CSV']", csvFile);
await waitFor("document.querySelector('.finance-import-preview')?.textContent.includes('完全重复')");
await sleep(300);
assert.equal(await scalar(db, "SELECT COUNT(*) FROM finance_transactions WHERE user_id = ?", [owner.user.id]), beforeReplay);

await navigate("/finance?tab=maintenance", ".finance-data-maintenance");
await evaluate("document.querySelector('.finance-data-maintenance').scrollIntoView({ block: 'start' })");
await clickWithConfirm("导出财务备份 JSON", /敏感信息/);
await waitFor("document.querySelector('[role=status]')?.textContent.includes('已生成并下载')");
const backupFile = await waitForDownload("workbench-finance-backup-v1.json");
await clickWithConfirm("导出财务 CSV", /敏感信息/);
await waitForDownload("workbench-finance-data.csv");
assert.equal(await scalar(db, "SELECT COUNT(*) FROM finance_data_audits WHERE user_id = ? AND action IN ('FINANCE_BACKUP_EXPORT','FINANCE_CSV_EXPORT')", [owner.user.id]), 2);
const exportDesktop = await screenshot("WB-R3-FIN04-export-1440.png");

const entriesBeforeReconciliation = await scalar(db, "SELECT COUNT(*) FROM finance_entries WHERE user_id = ?", [owner.user.id]);
await clickText("账本核对");
await waitFor("document.querySelector('[role=status]')?.textContent.includes('全部正常')");
assert.equal(await scalar(db, "SELECT COUNT(*) FROM finance_entries WHERE user_id = ?", [owner.user.id]), entriesBeforeReconciliation);
const reconciliationDesktop = await screenshot("WB-R3-FIN04-reconciliation-1440.png");

for (const query of ["FIN04 ready search", category.name, accountName]) {
  await navigate(`/search?q=${encodeURIComponent(query)}&type=finance`, ".search-route");
  await waitFor("document.querySelector('.search-results a') !== null");
  const result = await evaluate("(() => { const node = document.querySelector('.search-results a'); return { text: node.textContent, href: node.getAttribute('href') }; })()");
  assert.ok(result.text.includes("财务"));
  assert.ok(result.text.includes("2026-09"));
  assert.equal(/[¥￥]\s*\d|\b30\.00\b/.test(result.text), false, `search leaked amount: ${result.text}`);
  assert.ok(result.href.includes("transactionId="));
}
await navigate("/search?q=FIN04%20ready%20search&type=finance", ".search-results");
const searchDesktop = await screenshot("WB-R3-FIN04-search-1440.png");
await evaluate("document.querySelector('.search-results a').click()");
await waitFor("document.querySelector('.finance-transaction-detail .finance-detail-amount') !== null");
assert.match(await evaluate("document.querySelector('.finance-detail-amount').textContent"), /30\.00/);

const transactions = await scalar(db, "SELECT COUNT(*) FROM finance_transactions WHERE user_id = ?", [owner.user.id]);
const entries = await scalar(db, "SELECT COUNT(*) FROM finance_entries WHERE user_id = ?", [owner.user.id]);
const imported = await scalar(db, "SELECT COUNT(*) FROM finance_transactions WHERE user_id = ? AND source = 1 AND import_batch_id IS NOT NULL AND source_row_fingerprint IS NOT NULL", [owner.user.id]);
assert.deepEqual({ transactions, entries, imported }, { transactions: 4, entries: 4, imported: 3 });
const budgets = await api("/finance/budgets?month=2026-09", undefined, token);
const report = await api("/finance/reports?month=2026-09", undefined, token);
assert.equal(budgets.find((item) => item.categoryId === null).spentCents, "8000");
assert.equal(report.monthly.expenseCents, "8000");

await navigate("/finance?tab=maintenance", ".finance-data-maintenance");
await bindFile("input[aria-label='恢复 Finance JSON']", backupFile);
await waitFor("document.querySelector('.finance-import-preview')?.textContent.includes('完整恢复需要空账本')");
assert.equal(await evaluate("[...document.querySelectorAll('.finance-import-preview button')].some((node) => node.textContent.includes('确认恢复'))"), false);
await setToken(fresh.token);
assert.equal(await evaluate("document.querySelector('.finance-import-preview') !== null"), false, "previous user previews must be cleared");
await navigate("/finance?tab=maintenance", ".finance-data-maintenance");
assert.equal(await scalar(db, "SELECT COUNT(*) FROM finance_accounts WHERE user_id = ?", [fresh.user.id]), 0);
assert.equal(await scalar(db, "SELECT COUNT(*) FROM finance_categories WHERE user_id = ?", [fresh.user.id]), 0);
assert.equal(await evaluate("[...document.querySelectorAll('button')].some(node => node.textContent.includes('初始化财务分类'))"), false);
assert.equal(await evaluate(`document.querySelector("input[aria-label='恢复 Finance JSON']").files.length`), 0);
await bindFile("input[aria-label='恢复 Finance JSON']", backupFile);
await waitFor("document.querySelector('.finance-import-preview')?.textContent.includes('备份版本 1')");
assert.ok((await evaluate("document.querySelector('.finance-import-preview').textContent")).includes("可以在空账本中恢复"));
await clickWithConfirm("确认恢复", /只允许写入空账本/);
await waitFor("document.querySelector('.finance-import-preview')?.textContent.includes('恢复完成')");
assert.equal(await scalar(db, "SELECT COUNT(*) FROM finance_transactions WHERE user_id = ?", [fresh.user.id]), transactions);

await clickText("账户");
await waitFor("document.querySelector('.finance-account-list')?.textContent.includes('-¥80.00')");
await navigate("/settings?topic=data", ".settings-data");
assert.equal(await evaluate("document.querySelector('.settings-data h3').textContent"), "工作台数据导出");
assert.equal(await evaluate("document.querySelector('.settings-data input[type=file]') !== null"), false);
assert.equal(await evaluate("document.querySelector('.finance-data-maintenance') !== null"), false);
assert.equal(await evaluate("[...document.querySelectorAll('.settings-secondary-nav button, .settings-mobile-topic option')].some(node => node.textContent.trim() === '钱包')"), false);
assert.equal(await evaluate("document.querySelector('a[href=\"/finance?tab=maintenance\"]').textContent.trim()"), "钱包数据维护");
assert.equal(await evaluate("document.querySelector('a[href=\"/search\"]') !== null && document.querySelector('a[href=\"/settings/trash\"]') !== null"), true);
await evaluate("document.querySelector('select[aria-label=\"任务导出格式\"]').closest('.export-row').querySelector('button').click()");
await waitFor("[...document.querySelectorAll('.export-row')].some(row => row.textContent.includes('0 条'))");
const globalExportFile = await waitForDownload("personal-workbench-tasks.json");
const globalExport = JSON.parse(await fs.readFile(globalExportFile, "utf8"));
assert.equal(globalExport.domain, "tasks");
assert.equal(globalExport.includeTrash, false);
assert.deepEqual(globalExport.records, []);
const globalDataDesktop = await screenshot("WB-WALLET-SETTINGS-global-data-1440.png");
await viewport(375, 812);
await navigate("/settings?topic=data", ".settings-data");
assert.equal(await evaluate("getComputedStyle(document.querySelector('.settings-mobile-topic')).display !== 'none'"), true);
await evaluate("scrollTo(0, 0)");
await sleep(250);
assert.equal(await evaluate("(() => { const rect = document.querySelector('.settings-mobile-topic select').getBoundingClientRect(); return rect.top >= 0 && rect.bottom < innerHeight; })()"), true);
const globalDataMobile = await screenshot("WB-WALLET-SETTINGS-global-data-375.png");
await navigate("/settings?topic=wallet&date=2026-09-19&format=csv&tab=maintenance", ".finance-route");
assert.equal(await evaluate("location.pathname + location.search"), "/finance?date=2026-09-19");
await evaluate("history.back()");
await waitFor("location.pathname === '/settings' && new URLSearchParams(location.search).get('topic') === 'data' && document.querySelector('.settings-data') !== null");
await evaluate("history.forward()");
await waitFor("location.pathname + location.search === '/finance?date=2026-09-19'");
await navigate("/settings?topic=wallet&date=invalid&format=csv", ".finance-route");
assert.equal(await evaluate("location.pathname"), "/finance");
assert.equal(await evaluate("[...new URLSearchParams(location.search).keys()].every(key => key === 'date')"), true);
await navigate("/settings?topic=data", ".settings-data");
await evaluate("document.querySelector('a[href=\"/finance?tab=maintenance\"]').click()");
await waitFor("location.pathname === '/finance' && new URLSearchParams(location.search).get('tab') === 'maintenance' && document.querySelector('.finance-data-maintenance') !== null");
console.log(JSON.stringify({ maintenanceOwnership: { emptyDomainAccess: "PASS", authDraftIsolation: "PASS", importRestoreCacheRefresh: "PASS", browserHistory: "PASS", readOnlyReconciliation: "PASS" }, settingsCleanup: { legacyReplace: "PASS", validDate: "PASS", parameterCleanup: "PASS", browserBackForward: "PASS", mobileTopics: "PASS", globalExport: "PASS", informationalHandoff: "PASS" }, exactViewport: "PASS", evidence: { importPreviewDesktop, importResultDesktop, exportDesktop, reconciliationDesktop, searchDesktop, mobileDataActions, importPreviewMobile, globalDataDesktop, globalDataMobile }, mobileLayout, parity: { transactions, entries, imported, expenseCents: report.monthly.expenseCents }, restore: { sourceUserId: owner.user.id, targetUserId: fresh.user.id, restoredTransactions: transactions } }, null, 2));
await db.end();
socket.close();
