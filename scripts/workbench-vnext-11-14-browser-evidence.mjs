import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const cdpOrigin = process.env.WB_VNEXT_CDP_ORIGIN ?? "http://127.0.0.1:9338";
const webOrigin = process.env.WB_VNEXT_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const apiOrigin = process.env.WB_VNEXT_API_ORIGIN ?? "http://127.0.0.1:3000";
const artifactDir = process.env.WB_VNEXT_ARTIFACT_DIR ?? path.resolve("docs/reports");
await fs.mkdir(artifactDir, { recursive: true });

const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data); const job = pending.get(message.id); if (!job) return;
  pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
});
function send(method, params = {}, timeout = 15000) { return new Promise((resolve, reject) => { const id = ++commandId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } throw new Error(`Timed out: ${expression}`); }
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") { const response = await fetch(`${apiOrigin}/api${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`); return payload.data; }
async function navigate(pathname, selector) { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(350); await assertNoOverflow(); }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); assert.deepEqual(await evaluate("({width: innerWidth, height: innerHeight})"), { width, height }); }
async function assertNoOverflow() { const dimensions = await evaluate("({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth})"); assert.ok(dimensions.scroll <= dimensions.client, `horizontal overflow: ${dimensions.scroll} > ${dimensions.client}`); }
async function screenshot(name) { const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return file; }
async function clickText(selector, text) { assert.equal(await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!node) return false; node.click(); return true; })()`), true, `missing ${text}`); await sleep(300); await assertNoOverflow(); }

await send("Page.enable"); await send("Runtime.enable");
const owner = await api("/auth/register", { username: `vnext_11_14_${Date.now()}`, displayName: "远山旅人", password: "workbench-vnext-browser-password" });
const token = owner.token;
await api("/onboarding/flows/core-loop/skip", {}, token);
const note = await api("/quick-notes", { operationId: crypto.randomUUID(), noteDate: "2026-09-28", title: "边界笔记", content: "这段 Notebook 私人正文不能复制到 Library。", tag: "阅读" }, token);
const book = await api("/library/items", { type: "BOOK", title: "The Creative Act", originalTitle: "The Creative Act", creator: "Rick Rubin", status: "FINISHED", rating: 5, startedOn: "2026-09-01", finishedOn: "2026-09-22", externalRef: "https://example.test/creative-act", shortNote: "关于创作实践的短备注" }, token);
await api("/library/items", { type: "MOVIE", title: "Perfect Days", creator: "Wim Wenders", status: "WANT", shortNote: "待看清单" }, token);
await api("/library/items", { type: "GAME", title: "A Short Hike", creator: "adamgryu", status: "IN_PROGRESS", rating: 4, startedOn: "2026-09-25" }, token);
await api("/library/items", { type: "SERIES", title: "The Bear", creator: "Christopher Storer", status: "DROPPED", shortNote: "暂时放下" }, token);
await api(`/library/items/${book.id}/relations`, { targetType: "QUICK_NOTE", targetId: note.id }, token);
await api("/backpack/achievements/evaluate", {}, token);
const milestone = await api("/backpack/milestones", { operationId: crypto.randomUUID(), title: "个人工作台进入新阶段", description: "Library 与 Backpack 已成为稳定领域。", happenedOn: "2026-09-28", sourceType: "MANUAL_TEXT" }, token);
await api("/backpack/keepsakes", { operationId: crypto.randomUUID(), title: "第一部完成作品", description: "保留完成 The Creative Act 的这一刻。", happenedOn: "2026-09-22", sourceType: "LIBRARY", sourceId: book.id, iconKey: "book-open", themeKey: "violet" }, token);
await api("/backpack/keepsakes", { operationId: crypto.randomUUID(), title: "新阶段纪念", description: "一张只包含结构化文字与内置主题的卡片。", happenedOn: "2026-09-28", sourceType: "MILESTONE", sourceId: milestone.id, iconKey: "flag", themeKey: "amber" }, token);
const aiSettings = await api("/ai/settings", undefined, token);
await api("/ai/settings", { expectedVersion: aiSettings.version, enabled: true, allowNotebook: true, allowGrowth: true, allowLibrary: true }, token, "PUT");

await navigate("/login", "body"); await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`);
await viewport(1440, 900);
await navigate("/library", ".library-route");
await evaluate("document.querySelector('.earth-entry-close')?.click()"); await sleep(250);
assert.equal(await evaluate("document.querySelector('.earth-entry') === null"), true);
const libraryOverview = await screenshot("WB-LIBRARY-overview-1440.png");
await navigate(`/library/${book.id}`, ".library-detail-grid");
const libraryDetail = await screenshot("WB-LIBRARY-detail-1440.png");
assert.equal(await evaluate("document.body.innerText.includes('这段 Notebook 私人正文不能复制到 Library。')"), false);
await evaluate("document.querySelector('.library-relations').scrollIntoView({block:'center'})"); await sleep(200);
const libraryRelations = await screenshot("WB-LIBRARY-relations-1440.png");

await navigate("/backpack", ".backpack-route");
const backpackOverview = await screenshot("WB-BACKPACK-overview-1440.png");
await clickText(".backpack-tabs button", "成就");
const backpackAchievements = await screenshot("WB-BACKPACK-achievements-1440.png");
await clickText(".backpack-tabs button", "纪念卡");
const backpackKeepsake = await screenshot("WB-BACKPACK-keepsake-1440.png");
await navigate("/settings?topic=ai", ".ai-settings");
const aiSettingsImage = await screenshot("WB-AI-settings-1440.png");

await viewport(375, 812);
await navigate("/library", ".library-route");
const libraryMobile = await screenshot("WB-LIBRARY-375.png");
await navigate("/backpack?view=keepsakes", ".backpack-route");
const backpackMobile = await screenshot("WB-BACKPACK-375.png");

console.log(JSON.stringify({ exactViewports: "PASS", horizontalOverflow: "PASS", notebookBodyNotCopied: "PASS", evidence: [libraryOverview, libraryDetail, libraryRelations, backpackOverview, backpackAchievements, backpackKeepsake, aiSettingsImage, libraryMobile, backpackMobile] }, null, 2));
socket.close();
