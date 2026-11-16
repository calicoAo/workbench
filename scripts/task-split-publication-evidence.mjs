import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
const web = process.env.TASK_SPLIT_WEB_ORIGIN ?? "http://127.0.0.1:5187";
const cdp = process.env.TASK_SPLIT_CDP_ORIGIN ?? "http://127.0.0.1:9340";
const wrapper = path.resolve("apps/web/.task-split-publication-qa.html");
const output = path.resolve("docs/reports/task-split-publication");
const pages = await fetch(`${cdp}/json/list`).then(r => r.json());
const socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0; const pending = new Map();
socket.addEventListener("message", event => { const value = JSON.parse(event.data), job = pending.get(value.id); if (!job) return; pending.delete(value.id); clearTimeout(job.timer); value.error ? job.reject(new Error(value.error.message)) : job.resolve(value.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000); pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params })); }); }
async function evaluate(expression) { const value = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (value.exceptionDetails) throw Error(JSON.stringify(value.exceptionDetails)); return value.result.value; }
async function wait(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw Error(`Timed out: ${expression}`); }
async function click(text) { await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)throw Error('Missing button');b.click()})()`); }
async function capture(name) { const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true }); await fs.writeFile(path.join(output, name), Buffer.from(result.data, "base64")); }
try {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(wrapper, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/@fs${path.resolve("scripts/fixtures/task-split-publication.tsx")}"></script></body></html>`);
  await send("Page.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${web}/.task-split-publication-qa.html` });
  await wait("document.querySelector('textarea')");
  await evaluate("localStorage.removeItem('wb.task-split.v1:7');sessionStorage.clear()");
  await send("Page.reload"); await new Promise(resolve => setTimeout(resolve, 500)); await wait("document.querySelector('textarea')");
  await evaluate("(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'今天的任务：整理资料、准备考试');t.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='生成可审核草稿'&&!b.disabled)");
  await click("生成可审核草稿"); await wait("document.querySelectorAll('.split-candidate').length===2");
  assert.equal(await evaluate("[...document.querySelectorAll('.split-candidate input[type=date]')].length"), 2);
  const date = await evaluate("document.querySelector('.split-candidate input[type=date]').value");
  await send("Page.reload"); await new Promise(resolve => setTimeout(resolve, 500)); await wait("document.querySelectorAll('.split-candidate input[type=date]').length===2");
  assert.equal(await evaluate("document.querySelector('.split-candidate input[type=date]').value"), date);
  await capture("acceptance-preview.png");
  // Native confirmation is existing workflow behavior; accept it via browser protocol.
  const publication = click("确认发布所选 / 重试待定项");
  await new Promise(resolve => setTimeout(resolve, 200));
  await send("Page.handleJavaScriptDialog", { accept: true }); await publication;
  await wait("!localStorage.getItem('wb.task-split.v1:7') && document.querySelector('[role=status]')");
  const posts = await evaluate("JSON.parse(sessionStorage.getItem('qa.posts'))");
  assert.equal(posts.length, 2); assert.ok(posts.every(p => p.acceptDate === date && p.recordTimezone === "Asia/Shanghai"));
  assert.equal(new Set(posts.map(p => p.operationId)).size, 2);
  await capture("published-cleared.png");
  await send("Page.reload"); await new Promise(resolve => setTimeout(resolve, 500)); await wait("document.querySelector('textarea')");
  assert.equal(await evaluate("document.querySelector('textarea').value"), "");
  assert.equal(await evaluate("document.querySelectorAll('.split-candidate').length"), 0);
  await fs.writeFile(path.join(output, "result.json"), JSON.stringify({ result: "PASS", kind: "Public workflow with isolated transport; separate API tests verify real DB", checks: ["today acceptance defaults", "refresh retains date", "frozen date and unique operation IDs", "publication clears draft", "reload does not restore published candidates"] }, null, 2));
  console.log(JSON.stringify({ result: "PASS", output }));
} finally { await fs.rm(wrapper, { force: true }); socket.close(); }
