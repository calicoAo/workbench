import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const cdpOrigin = process.env.WRITING_INSPIRATION_CDP_ORIGIN ?? "http://127.0.0.1:9335";
const webOrigin = process.env.WRITING_INSPIRATION_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const apiOrigin = process.env.WRITING_INSPIRATION_API_ORIGIN ?? "http://127.0.0.1:3000";
const artifactDir = process.env.WRITING_INSPIRATION_ARTIFACT_DIR ?? path.resolve("docs/reports");
await fs.mkdir(artifactDir, { recursive: true });
const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("fresh Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0; const pending = new Map(); socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); const job = pending.get(message.id); if (!job) return; pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); });
function send(method, params = {}, timeout = 15000) { return new Promise((resolve, reject) => { const id = ++commandId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } throw new Error(`Timed out: ${expression}`); }
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") { const response = await fetch(`${apiOrigin}/api${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`); return payload.data; }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(450); }
async function setToken(token) { await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`); await send("Page.navigate", { url: `${webOrigin}/today` }); try { await waitFor("document.querySelector('.app-shell') !== null"); } catch (error) { const debug = await evaluate("({ url: location.href, text: document.body.textContent, html: document.body.innerHTML.slice(0, 1000) })"); console.error(JSON.stringify(debug)); throw error; } }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const value = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); if (width === 375) assert.deepEqual(value, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 }); else assert.ok(value.scrollWidth <= width); return value; }
async function screenshot(name) { const dimensions = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.deepEqual(dimensions, { innerWidth: dimensions.innerWidth, innerHeight: dimensions.innerHeight, scrollWidth: dimensions.innerWidth }); if (dimensions.innerWidth === 375) assert.deepEqual(dimensions, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 }); const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return { file, ...dimensions }; }
async function clickButton(text) { const found = await evaluate(`(() => { const node = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!node) return false; node.click(); return true; })()`); assert.equal(found, true, `missing button: ${text}`); await sleep(250); }

await send("Page.enable"); await send("Runtime.enable");
const owner = await api("/auth/register", { username: `inspiration_browser_${String(Date.now()).slice(-10)}`, displayName: "Writing Inspiration QA", password: "inspiration-browser-password" });
const token = owner.token; const note = await api("/quick-notes", { operationId: crypto.randomUUID(), noteDate: "2026-09-24", title: "灵感来源", content: "这是一条应该长期保留的灵感正文" }, token);
await api("/writing/inspirations", { operationId: crypto.randomUUID(), noteDate: "2026-09-23", title: "模型研究", content: "从直接创建的灵感开始", tagNames: ["Agent", "研究"] }, token);
await api(`/quick-notes/${note.id}/inspiration`, { operationId: crypto.randomUUID(), tagNames: ["Agent"] }, token);
await navigate("/login", "body"); await setToken(token);

await viewport(1440, 900); await navigate("/inspirations?date=2026-09-24"); await waitFor("document.querySelector('.inspiration-card') !== null"); const libraryDesktop = await screenshot("WB-WRITING-INSPIRATION-library-1440.png");
await navigate(`/notes/${note.id}?date=2026-09-24`); await waitFor("document.querySelector('.quick-note-detail-actions') !== null"); await clickButton("加入灵感库"); await waitFor("document.querySelector('[role=dialog]') !== null"); const fromQuickNoteDesktop = await screenshot("WB-WRITING-INSPIRATION-from-quicknote-1440.png");
const tagInput = "document.querySelector('[aria-label=灵感标签]')"; await evaluate(`${tagInput}.value = '新标签'; ${tagInput}.dispatchEvent(new Event('input', { bubbles: true }));`); await sleep(100); const tagCreateDesktop = await screenshot("WB-WRITING-INSPIRATION-tag-create-1440.png");
await evaluate("document.querySelector('[aria-label=关闭]').click()"); await navigate("/journal?date=2026-09-24"); await clickButton("灵感库"); await waitFor("document.querySelector('.writing-inspiration-panel') !== null"); const editorDesktop = await screenshot("WB-WRITING-INSPIRATION-editor-panel-1440.png");

await viewport(375, 812); await navigate("/inspirations?date=2026-09-24"); await waitFor("document.querySelector('.inspiration-card') !== null"); const libraryMobile = await screenshot("WB-WRITING-INSPIRATION-library-375.png");
await navigate(`/notes/${note.id}?date=2026-09-24`); await clickButton("加入灵感库"); await waitFor("document.querySelector('[role=dialog]') !== null"); const tagPickerMobile = await screenshot("WB-WRITING-INSPIRATION-tag-picker-375.png");
await evaluate("document.querySelector('[aria-label=关闭]').click()"); await navigate("/journal?date=2026-09-24"); await clickButton("灵感库"); await waitFor("document.querySelector('.writing-inspiration-panel') !== null"); const editorMobile = await screenshot("WB-WRITING-INSPIRATION-editor-panel-375.png");

console.log(JSON.stringify({ exactViewport: "PASS", evidence: { libraryDesktop, fromQuickNoteDesktop, tagCreateDesktop, editorDesktop, libraryMobile, tagPickerMobile, editorMobile } }, null, 2)); socket.close();
