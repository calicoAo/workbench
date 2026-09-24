import fs from "node:fs/promises";

const token = process.env.FIN01_TOKEN;
if (!token) throw new Error("FIN01_TOKEN is required");

const cdpOrigin = process.env.FIN01_CDP_ORIGIN ?? "http://127.0.0.1:9225";
const webOrigin = process.env.FIN01_WEB_ORIGIN ?? "http://127.0.0.1:5180";
const apiOrigin = process.env.FIN01_API_ORIGIN ?? "http://127.0.0.1:3010";
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
  if (message.error) job.reject(new Error(message.error.message));
  else job.resolve(message.result);
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
async function waitFor(expression, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
}
async function navigate(path) {
  await send("Page.navigate", { url: `${webOrigin}${path}` });
  await waitFor("document.readyState === 'complete'");
  await waitFor("document.querySelector('.app-shell') !== null");
  await sleep(700);
}
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(new URL(name, reports), Buffer.from(result.data, "base64"));
}
async function click(expression, label) {
  const found = await evaluate(`(() => { const node = ${expression}; if (!node) return false; node.click(); return true; })()`);
  if (!found) throw new Error(`Control not found: ${label}`);
  await sleep(500);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  (() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      return originalFetch(url.startsWith("/api/") ? ${JSON.stringify(apiOrigin)} + url : input, init);
    };
  })();
` });

await viewport(1440, 1000);
await send("Page.navigate", { url: `${webOrigin}/` });
await waitFor("document.readyState === 'complete'");
await evaluate(`localStorage.setItem('personal_workbench_token', ${JSON.stringify(token)}); localStorage.setItem('personal-workbench:sidebar-collapsed', 'false')`);
await navigate("/finance?date=2026-09-22");
await waitFor("document.querySelector('.finance-overview') !== null && !document.body.textContent.includes('正在读取账本')");
const overview = await evaluate(`(() => ({
  width: innerWidth,
  scrollWidth: document.documentElement.scrollWidth,
  netWorth: document.querySelector('.finance-worth strong')?.textContent,
  accountRows: document.querySelectorAll('.finance-account-summary > div').length,
  transactionRows: document.querySelectorAll('.finance-transaction-list > button').length,
  forbiddenLinks: [...document.querySelectorAll('a,button')].map((node) => node.textContent.trim()).filter((text) => /预算|转账|周期收支|导入|AI 财务/.test(text))
}))()`);
await screenshot("WB-R3-FIN01-overview-1440.png");

await click(`[...document.querySelectorAll('.finance-tabs button')].find((node) => node.textContent.trim() === '账户')`, "Finance accounts tab");
await waitFor("document.querySelector('.finance-account-list') !== null");
const accounts = await evaluate(`(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  rows: document.querySelectorAll('.finance-account-list article').length,
  creditLabel: [...document.querySelectorAll('.finance-account-balance strong')].map((node) => node.textContent.trim()).find((text) => text.startsWith('欠款')) ?? null,
  hasMutableBalanceInput: [...document.querySelectorAll('input')].some((node) => /余额/.test(node.getAttribute('aria-label') ?? ''))
}))()`);
await screenshot("WB-R3-FIN01-accounts-1440.png");

await click(`[...document.querySelectorAll('.finance-tabs button')].find((node) => node.textContent.trim() === '流水')`, "Finance transactions tab");
await waitFor("document.querySelector('.finance-transactions') !== null && !document.body.textContent.includes('正在读取流水')");
const transactions = await evaluate(`(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  rows: document.querySelectorAll('.finance-transaction-list > button').length,
  filters: [...document.querySelectorAll('.finance-filters .field')].map((node) => node.getAttribute('aria-label'))
}))()`);
await screenshot("WB-R3-FIN01-transactions-1440.png");

await viewport(375, 812);
await navigate(`/finance?date=2026-09-22&action=expense&nonce=${crypto.randomUUID()}`);
await waitFor("document.querySelector('.finance-record-dialog') !== null");
const expense = await evaluate(`(() => {
  const modal = document.querySelector('.finance-record-dialog').getBoundingClientRect();
  const footer = document.querySelector('.finance-record-dialog footer').getBoundingClientRect();
  return {
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    modalLeft: Math.round(modal.left),
    modalRight: Math.round(modal.right),
    footerBottom: Math.round(footer.bottom),
    viewportHeight: innerHeight,
    primaryFields: [...document.querySelectorAll('.finance-record-primary select')].map((node) => node.getAttribute('aria-label')),
    amountFontSize: getComputedStyle(document.querySelector('.finance-amount-field input')).fontSize
  };
})()`);
await screenshot("WB-R3-FIN01-expense-375.png");

await navigate("/today?date=2026-09-22");
await click("document.querySelector('.quick-action')", "Quick Action");
await waitFor("document.querySelector('.quick-add-menu') !== null");
const quickAction = await evaluate(`(() => {
  const menu = document.querySelector('.quick-add-menu').getBoundingClientRect();
  const nav = document.querySelector('.mobile-nav').getBoundingClientRect();
  const labels = [...document.querySelectorAll('.quick-add-menu button')].map((node) => node.textContent.trim());
  return {
    scrollWidth: document.documentElement.scrollWidth,
    labels,
    financeActions: labels.filter((text) => text === '记一笔支出' || text === '记一笔收入'),
    menuBottom: Math.round(menu.bottom),
    navTop: Math.round(nav.top),
    clearOfNav: menu.bottom <= nav.top
  };
})()`);
await screenshot("WB-R3-FIN01-quick-action-375.png");

console.log(JSON.stringify({ overview, accounts, transactions, expense, quickAction }, null, 2));
socket.close();
