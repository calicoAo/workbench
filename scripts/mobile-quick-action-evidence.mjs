import fs from "node:fs/promises";

const token = process.env.QUICK_ACTION_TOKEN;
if (!token) throw new Error("QUICK_ACTION_TOKEN is required");

const cdpOrigin = process.env.QUICK_ACTION_CDP_ORIGIN ?? "http://127.0.0.1:9227";
const webOrigin = process.env.QUICK_ACTION_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const apiOrigin = process.env.QUICK_ACTION_API_ORIGIN ?? "http://127.0.0.1:3000";
const reports = new URL("../docs/reports/", import.meta.url);
const target = await fetch(`${cdpOrigin}/json/new?${encodeURIComponent(webOrigin)}`, { method: "PUT" }).then((response) => response.json());
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
async function waitFor(expression, timeout = 15000) {
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
  await sleep(900);
}
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(new URL(name, reports), Buffer.from(result.data, "base64"));
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

await viewport(375, 812);
await waitFor("document.readyState === 'complete'");
await evaluate(`localStorage.setItem('personal_workbench_token', ${JSON.stringify(token)}); localStorage.setItem('personal-workbench:sidebar-collapsed', 'false')`);
await navigate("/today?date=2026-09-22");
await waitFor("document.querySelector('.app-shell') !== null");
await waitFor("document.querySelector('.quick-action') !== null");
await screenshot("WB-QUICK-ACTION-375-collapsed.png");

await evaluate("document.querySelector('.quick-action')?.click()");
await waitFor("document.querySelector('.quick-add-menu') !== null");
await screenshot("WB-QUICK-ACTION-375-open.png");
const open = await evaluate(`(() => {
  const menu = document.querySelector('.quick-add-menu');
  const trigger = document.querySelector('.quick-action');
  const nav = document.querySelector('.mobile-nav');
  const visible = (node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
  const buttons = [...menu.querySelectorAll('button')].filter(visible);
  return {
    viewport: { width: innerWidth, height: innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
    menu: (() => { const r = menu.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }; })(),
    trigger: (() => { const r = trigger.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; })(),
    navTop: Math.round(nav.getBoundingClientRect().top),
    labels: buttons.map((node) => node.textContent.trim()),
    buttonHeights: buttons.map((node) => Math.round(node.getBoundingClientRect().height)),
    singleRow: buttons.every((node) => { const icon = node.querySelector('svg'); const label = node.querySelector('span'); return !icon || !label || Math.abs(icon.getBoundingClientRect().top - label.getBoundingClientRect().top) <= 4; }),
    noWrap: buttons.every((node) => [...node.querySelectorAll('span')].every((span) => getComputedStyle(span).whiteSpace === 'nowrap')),
    clearOfNav: menu.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top
  };
})()`);

await evaluate("[...document.querySelectorAll('.quick-add-menu button')].find((node) => node.textContent.trim() === '更多…')?.click()");
await waitFor("document.querySelector('.quick-add-menu.is-more-open') !== null");
await screenshot("WB-QUICK-ACTION-375-more.png");
const more = await evaluate(`(() => {
  const menu = document.querySelector('.quick-add-menu');
  const visible = (node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
  const buttons = [...menu.querySelectorAll('button')].filter(visible);
  return {
    scrollWidth: document.documentElement.scrollWidth,
    labels: buttons.map((node) => node.textContent.trim()),
    buttonHeights: buttons.map((node) => Math.round(node.getBoundingClientRect().height)),
    singleRow: buttons.every((node) => { const icon = node.querySelector('svg'); const label = node.querySelector('span'); return !icon || !label || Math.abs(icon.getBoundingClientRect().top - label.getBoundingClientRect().top) <= 4; }),
    noWrap: buttons.every((node) => [...node.querySelectorAll('span')].every((span) => getComputedStyle(span).whiteSpace === 'nowrap'))
  };
})()`);

console.log(JSON.stringify({ open, more }, null, 2));
socket.close();
