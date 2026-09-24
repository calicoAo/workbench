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
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const job = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(120);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function api(path, body) {
  const response = await fetch(`${apiOrigin}/api${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json();
  if (response.status >= 400) throw new Error(`${path}: ${response.status} ${JSON.stringify(json)}`);
  return json.data;
}
async function navigate(path, selector) {
  await send("Page.navigate", { url: `${webOrigin}${path}` });
  await waitFor("document.readyState === 'complete'");
  await waitFor("document.querySelector('.app-shell') !== null");
  if (selector) await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`);
  await sleep(450);
}
async function screenshot(name) {
  const viewport = await evaluate("({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth })");
  if (viewport.width !== 375 || viewport.height !== 812 || viewport.scrollWidth !== 375) throw new Error(`exact viewport failed before ${name}: ${JSON.stringify(viewport)}`);
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(new URL(name, reports), Buffer.from(result.data, "base64"));
  return viewport;
}
async function assertPage(label, rootSelector, requiredLabels = []) {
  const result = await evaluate(`(() => {
    const rect = (node) => { const value = node?.getBoundingClientRect(); return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null; };
    const overlaps = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const root = document.querySelector(${JSON.stringify(rootSelector)});
    const fab = rect(document.querySelector('.quick-action'));
    const nav = rect(document.querySelector('.mobile-nav'));
    const content = root?.textContent ?? '';
    const contentStyle = getComputedStyle(document.querySelector('.app-content'));
    return {
      viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
      root: Boolean(root),
      labels: ${JSON.stringify(requiredLabels)}.filter((value) => !content.includes(value)),
      fabNavOverlap: overlaps(fab, nav),
      bodyOverflow: document.documentElement.scrollWidth !== innerWidth,
      contentBottomPadding: parseFloat(contentStyle.paddingBottom)
    };
  })()`);
  if (!result.root || result.viewport.width !== 375 || result.viewport.height !== 812 || result.viewport.scrollWidth !== 375 || result.labels.length || result.fabNavOverlap || result.bodyOverflow || result.contentBottomPadding < 138) throw new Error(`${label} layout assertion failed: ${JSON.stringify(result)}`);
  return result;
}
async function assertElementClear(label, selector) {
  const result = await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)}); const fab = document.querySelector('.quick-action'); const nav = document.querySelector('.mobile-nav');
    if (!node || !fab || !nav) return { found: false };
    const rect = (value) => { const box = value.getBoundingClientRect(); return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const target = rect(node); return { found: true, target, visible: target.left >= 0 && target.right <= innerWidth && target.top >= 0 && target.bottom <= innerHeight, fabOverlap: overlaps(target, rect(fab)), navOverlap: overlaps(target, rect(nav)), whiteSpace: getComputedStyle(node).whiteSpace };
  })()`);
  if (!result.found || !result.visible || result.fabOverlap || result.navOverlap) throw new Error(`${label} exclusion assertion failed: ${JSON.stringify(result)}`);
  return result;
}

const initialized = await api("/finance/initialize", { operationId: crypto.randomUUID() });
const categories = await api("/finance/categories");
const category = categories.find((item) => item.kind === "EXPENSE");
const account = await api("/finance/accounts", { operationId: crypto.randomUUID(), name: "移动端验收账户", type: "BANK", openingDate: "2026-01-01", openingBalanceCents: "0", includeInOverview: true });
if (!initialized) throw new Error("Finance initialize failed");

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: `${webOrigin}/` });
await waitFor("document.readyState === 'complete'");
await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)}); localStorage.setItem("personal-workbench:sidebar-collapsed", "false");`);
await send("Page.reload");
await waitFor("document.querySelector('.app-shell') !== null");
await waitFor("innerWidth === 375 && innerHeight === 812 && document.documentElement.scrollWidth === 375");

await navigate("/finance?date=2026-09-20&tab=overview", ".finance-overview");
const header = await evaluate(`(() => {
  const actions = [...document.querySelectorAll('.finance-head-actions > button')];
  const visible = actions.filter((node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && rect.width > 0; });
  return { visible: visible.map((node) => node.textContent.trim() || node.getAttribute('aria-label')), recordActionsHidden: actions.filter((node) => node.classList.contains('ui-button')).every((node) => getComputedStyle(node).display === 'none') };
})()`);
if (!header.recordActionsHidden || header.visible.length !== 1 || !["隐藏金额", "显示金额"].includes(header.visible[0])) throw new Error(`mobile Finance header assertion failed: ${JSON.stringify(header)}`);
const overview = await assertPage("overview", ".finance-overview", ["净值", "最近流水", "账户余额"]);
const quickAction = await evaluate(`(async () => {
  document.querySelector('.quick-action')?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const menu = document.querySelector('.quick-add-menu'); const primary = document.querySelector('.quick-add-primary'); const more = document.querySelector('.quick-add-more');
  const menuRect = menu?.getBoundingClientRect(); const primaryLabels = [...(primary?.querySelectorAll('button') ?? [])].map((node) => node.textContent.trim());
  more?.click(); await new Promise((resolve) => setTimeout(resolve, 100));
  const secondaryLabels = [...(document.querySelectorAll('.quick-add-secondary button') ?? [])].map((node) => node.textContent.trim());
  const labelsNoWrap = [...document.querySelectorAll('.quick-add-menu button')].every((node) => getComputedStyle(node).whiteSpace === 'nowrap');
  document.querySelector('.quick-action')?.click();
  return { width: menuRect?.width, primaryLabels, secondaryLabels, labelsNoWrap };
})()`);
if (!quickAction.width || quickAction.width > 304 || !quickAction.primaryLabels.includes("记一笔支出") || !quickAction.secondaryLabels.includes("记一笔收入") || !quickAction.secondaryLabels.includes("转账") || !quickAction.labelsNoWrap) throw new Error(`Quick Action compact assertion failed: ${JSON.stringify(quickAction)}`);
const overviewViewport = await screenshot("WB-R3-FIN03-overview-375-final.png");

await api("/finance/expenses", { operationId: crypto.randomUUID(), accountId: account.id, categoryId: category.id, amountCents: "10000", occurredDate: "2026-09-10", occurredTime: "12:00", note: "FIN03 mobile UI evidence" });
await api("/finance/budgets", { operationId: crypto.randomUUID(), budgetMonth: "2026-09", limitCents: "20000" });
await api("/finance/recurring-templates", { operationId: crypto.randomUUID(), type: "EXPENSE", name: "移动端周期支出", amountCents: "3000", accountId: account.id, categoryId: category.id, frequency: "MONTHLY", scheduleValue: 5, startDate: "2026-09-01" });
await api("/finance/recurring-occurrences/prepare", { operationId: crypto.randomUUID(), from: "2026-09-01", to: "2026-09-20" });

await navigate("/finance?date=2026-09-20&tab=budgets", ".finance-budget-page");
const budget = await assertPage("budget", ".finance-budget-page", ["2026-09 预算", "保存预算", "本月预算进度"]);
await evaluate(`document.querySelector('.finance-budget-page form')?.scrollIntoView({ block: 'center' })`);
await sleep(150);
const budgetSave = await assertElementClear("budget save", ".finance-budget-page form .ui-button");
const budgetViewport = await screenshot("WB-R3-FIN03-budget-375-final.png");

await navigate("/finance?date=2026-09-20&tab=recurring", ".finance-recurring-page");
await evaluate(`document.querySelector('.finance-occurrence-list article')?.scrollIntoView({ block: 'center' })`);
await sleep(150);
const recurring = await assertPage("recurring", ".finance-recurring-page", ["预计入账", "未入账", "确认入账", "跳过", "影响真实余额", "准备本月"]);
const prepareLabel = await evaluate(`(() => {
  const button = document.querySelector('.finance-recurring-page header .ui-button');
  const labels = [...(button?.querySelectorAll('span > span') ?? [])].filter((node) => getComputedStyle(node).display !== 'none');
  return { labels: labels.map((node) => node.textContent.trim()), whiteSpace: labels.map((node) => getComputedStyle(node).whiteSpace) };
})()`);
if (prepareLabel.labels.join('|') !== "准备本月" || prepareLabel.whiteSpace.some((value) => value !== "nowrap")) throw new Error(`recurring prepare label assertion failed: ${JSON.stringify(prepareLabel)}`);
const confirmClear = await assertElementClear("recurring confirm", ".finance-occurrence-list article > div:last-child .ui-button:first-child");
const skipClear = await assertElementClear("recurring skip", ".finance-occurrence-list article > div:last-child .ui-button:last-child");
const recurringActions = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('.finance-occurrence-list article > div:last-child button')];
  return buttons.map((node) => { const rect = node.getBoundingClientRect(); const style = getComputedStyle(node); return { text: node.textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, whiteSpace: style.whiteSpace, visible: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight }; });
})()`);
if (recurringActions.length !== 2 || recurringActions.some((item) => !item.visible || item.whiteSpace !== "nowrap") || recurringActions.map((item) => item.text).join("|") !== "确认入账|跳过") throw new Error(`recurring action assertion failed: ${JSON.stringify(recurringActions)}`);
const recurringViewport = await screenshot("WB-R3-FIN03-recurring-confirm-375-final.png");

await navigate("/finance?date=2026-09-20&tab=reports", ".finance-report-page");
const report = await assertPage("report", ".finance-report-page", ["收入", "支出", "净现金流", "分类支出", "账户净变动", "已核对"]);
const reportClear = await assertElementClear("report reconciliation", ".finance-report-page .ui-badge");
const reportViewport = await screenshot("WB-R3-FIN03-report-375-final.png");

await navigate("/finance?date=2026-09-20&tab=accounts", ".finance-accounts-layout");
const accounts = await assertPage("accounts", ".finance-accounts-layout", ["创建账户", "收支分类"]);
await evaluate(`document.querySelector('.finance-categories form .ui-button')?.scrollIntoView({ block: 'center' })`); await sleep(100);
const accountCreate = await assertElementClear("account create", ".finance-accounts-layout main header .ui-button");
const categoryAdd = await assertElementClear("category add", ".finance-categories form .ui-button");
await navigate("/finance?date=2026-09-20&tab=transactions", ".finance-transactions");
const transactions = await assertPage("transactions", ".finance-transactions", ["流水", "FIN03 mobile UI evidence"]);
await evaluate(`document.querySelector('.finance-transaction-list > button')?.scrollIntoView({ block: 'center' })`); await sleep(100);
const transactionRow = await assertElementClear("transaction row", ".finance-transaction-list > button");

console.log(JSON.stringify({ exactViewport: "PASS", header, quickAction, overviewViewport, budgetViewport, recurringViewport, reportViewport, overview, budget, budgetSave, recurring, prepareLabel, confirmClear, skipClear, recurringActions, report, reportClear, accounts, accountCreate, categoryAdd, transactions, transactionRow }, null, 2));
socket.close();
