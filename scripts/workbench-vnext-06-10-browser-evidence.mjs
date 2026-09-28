import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const cdpOrigin = process.env.WB_VNEXT_CDP_ORIGIN ?? "http://127.0.0.1:9337";
const webOrigin = process.env.WB_VNEXT_WEB_ORIGIN ?? "http://127.0.0.1:5173";
const apiOrigin = process.env.WB_VNEXT_API_ORIGIN ?? "http://127.0.0.1:3000";
const artifactDir = process.env.WB_VNEXT_ARTIFACT_DIR ?? path.resolve("docs/reports");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
await fs.mkdir(artifactDir, { recursive: true });

const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const job = pending.get(message.id);
  if (!job) return;
  pending.delete(message.id);
  clearTimeout(job.timer);
  message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
});
function send(method, params = {}, timeout = 15000) { return new Promise((resolve, reject) => { const id = ++commandId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function shiftDate(date, days) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } throw new Error(`Timed out: ${expression}`); }
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") { const response = await fetch(`${apiOrigin}/api${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`); return payload.data; }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(350); }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const size = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.deepEqual({ innerWidth: size.innerWidth, innerHeight: size.innerHeight }, { innerWidth: width, innerHeight: height }); assert.ok(size.scrollWidth <= width, `horizontal overflow: ${size.scrollWidth} > ${width}`); }
async function screenshot(name) { const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return file; }
async function click(selector) { assert.equal(await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`), true, `missing ${selector}`); await sleep(250); }
async function clickText(selector, text) { assert.equal(await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!node) return false; node.click(); return true; })()`), true, `missing ${text}`); await sleep(250); }

await send("Page.enable");
await send("Runtime.enable");
const owner = await api("/auth/register", { username: `vnext_browser_${Date.now()}`, displayName: "星海旅人", password: "workbench-vnext-browser-password" });
const token = owner.token;
await api("/onboarding/flows/core-loop/skip", {}, token);
const settings = await api("/settings", undefined, token);
const category = settings.categories.find((item) => item.dimensionKey === "career") ?? settings.categories[0];
await api("/hero/profile", { expectedVersion: 1, title: "时间航行者", birthDate: "1990-01-01" }, token, "PUT");
const mainTask = await api("/tasks", { operationId: crypto.randomUUID(), title: "完成 Growth V2 验收", categoryId: category.id, priority: 1, difficulty: 3, acceptDate: today, recordTimezone: "Asia/Shanghai" }, token);
const sideTask = await api("/tasks", { operationId: crypto.randomUUID(), title: "整理 Adventure Log", categoryId: category.id, priority: 2, difficulty: 2, acceptDate: today, recordTimezone: "Asia/Shanghai" }, token);
const tasks = await api("/tasks", undefined, token);
const main = tasks.find((item) => item.id === mainTask.id);
await api("/task-days", { taskDate: today, taskIds: [mainTask.id, sideTask.id], focusTaskIds: [mainTask.id] }, token, "PUT");
await api(`/tasks/${mainTask.id}/complete`, { operationId: crypto.randomUUID(), expectedVersion: main.version, completionNote: "确定性事实已通过" }, token, "PUT");
const habit = await api("/habits", { operationId: crypto.randomUUID(), name: "阅读 20 分钟", startDate: shiftDate(today, -30), recordMode: 3, unit: "分钟", taskCompletionEnabled: false, rule: { frequencyType: 0 }, targetValue: 20 }, token);
await api(`/habits/${habit.id}/occurrences`, { operationId: crypto.randomUUID(), occurrenceDate: today, recordTimezone: "Asia/Shanghai", expectedVersion: 0, actualValue: 20 }, token);
for (const [offset, minutes] of [[0, 110], [-1, 75], [-2, 45], [-4, 95], [-6, 30]]) {
  const date = shiftDate(today, offset);
  await api("/schedules", { operationId: crypto.randomUUID(), scheduleDate: date, startTime: "09:00", endTime: `${String(9 + Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`, recordTimezone: "Asia/Shanghai", kind: 1, categoryId: category.id, title: `Actual ${date}`, includeInActualTime: true }, token);
}
await api("/schedules", { operationId: crypto.randomUUID(), scheduleDate: today, startTime: "14:00", endTime: "15:00", recordTimezone: "Asia/Shanghai", kind: 0, categoryId: category.id, title: "明日路线规划" }, token);
await api("/water-records", { waterDate: today, cups: 6, targetCups: 8 }, token);
await api("/sleep-records", { sleepStartDate: shiftDate(today, -1), sleepStartTime: "23:20", wakeDate: today, wakeTime: "07:10", recordTimezone: "Asia/Shanghai", qualityScore: 4 }, token);
await api("/journals", { journalDate: today, content: "这段私人正文不能进入 Adventure Snapshot。", moodScore: 4 }, token);
await api(`/adventure/snapshots/${today}/regenerate`, {}, token);
const review = await api("/adventure/period-reviews/regenerate", { type: "WEEK", anchor: today }, token);
await api(`/adventure/period-reviews/${review.id}`, { expectedVersion: review.version, userReviewBody: "本周保持真实投入，下一步继续收口。" }, token, "PUT");

await navigate("/login", "body");
await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`);
await viewport(1440, 900);
await navigate(`/today?date=${today}`);
await waitFor("document.querySelector('.earth-entry') !== null");
const earthDesktop = await screenshot("WB-EARTH-ONLINE-entry-1440.png");
await clickText(".earth-entry fieldset button", "还不错");
await clickText(".earth-entry button", "开始冒险");
await waitFor("document.querySelector('.earth-entry') === null");

await navigate(`/growth?date=${today}`, ".growth-route");
await waitFor("document.querySelector('.growth-trend-panel') !== null");
const growthDesktop = await screenshot("WB-GROWTH-V2-overview-1440.png");
await evaluate("document.querySelector('.growth-radar')?.scrollIntoView({block:'center'})");
await sleep(200);
const growthRadar = await screenshot("WB-GROWTH-V2-radar-1440.png");

await navigate(`/insights?date=${today}`);
const insightsLegacy = await screenshot("WB-INSIGHTS-legacy-1440.png");

await navigate(`/settings?date=${today}`, ".settings-route");
const settingsGeneral = await screenshot("WB-SETTINGS-V2-general-1440.png");
await clickText(".settings-secondary-nav button", "冒险");
await waitFor("document.querySelector('.settings-category-list button') !== null");
const settingsCategories = await screenshot("WB-SETTINGS-V2-categories-1440.png");
await click(".settings-category-list button");
await waitFor("document.querySelector('.settings-category-dialog') !== null");
const settingsColor = await screenshot("WB-SETTINGS-V2-color-picker-1440.png");

await navigate(`/calendar?date=${today}`);
await clickText(".calendar-route .segmented-control button", "月");
await waitFor("document.querySelector('.calendar-month-view') !== null");
const calendarMonth = await screenshot("WB-CALENDAR-month-1440.png");
await clickText(".calendar-route .segmented-control button", "年");
await waitFor("document.querySelector('.calendar-year-view') !== null");
const calendarYear = await screenshot("WB-CALENDAR-year-heatmap-1440.png");

await navigate(`/hero?date=${today}`, ".hero-profile-route");
const heroProfile = await screenshot("WB-HERO-profile-1440.png");
await navigate(`/adventure-log?date=${today}`, ".adventure-log-route");
const adventureList = await screenshot("WB-ADVENTURE-LOG-list-1440.png");
await navigate(`/adventure-log/${today}?date=${today}`, ".adventure-log-route");
assert.equal(await evaluate("document.body.innerText.includes('这段私人正文不能进入')"), false);
const adventureDay = await screenshot("WB-ADVENTURE-LOG-day-1440.png");
await navigate(`/period-review?date=${today}`, ".period-review-route");
await waitFor("document.querySelector('.period-review-editor') !== null");
const periodWeek = await screenshot("WB-PERIOD-REVIEW-week-1440.png");

await viewport(375, 812);
await navigate(`/growth?date=${today}`, ".growth-route");
const growthMobile = await screenshot("WB-GROWTH-V2-375.png");
await navigate(`/settings?date=${today}`, ".settings-route");
const settingsMobile = await screenshot("WB-SETTINGS-V2-375.png");
await navigate(`/calendar?date=${today}`);
await clickText(".calendar-route .segmented-control button", "月");
const calendarMonthMobile = await screenshot("WB-CALENDAR-month-375.png");
await clickText(".calendar-route .segmented-control button", "年");
const calendarYearMobile = await screenshot("WB-CALENDAR-year-375.png");
await navigate(`/today?date=${today}`);
await waitFor("document.querySelector('.hero-hud') !== null");
const heroHudMobile = await screenshot("WB-HERO-hud-375.png");
await click(".hero-hud");
await waitFor("document.querySelector('.hero-profile-route') !== null");
await clickText(".hero-progress-panel button", "重放今日启动页");
await waitFor("document.querySelector('.earth-entry') !== null");
const earthMobile = await screenshot("WB-EARTH-ONLINE-entry-375.png");
await navigate(`/adventure-log?date=${today}`, ".adventure-log-route");
const adventureMobile = await screenshot("WB-ADVENTURE-LOG-375.png");
await navigate(`/period-review?date=${today}`, ".period-review-route");
const periodMobile = await screenshot("WB-PERIOD-REVIEW-375.png");

const logs = await send("Runtime.evaluate", { expression: "document.documentElement.scrollWidth <= innerWidth", returnByValue: true });
assert.equal(logs.result.value, true);
console.log(JSON.stringify({ exactViewports: "PASS", horizontalOverflow: "PASS", privateTextProtection: "PASS", evidence: [earthDesktop, growthDesktop, growthRadar, insightsLegacy, settingsGeneral, settingsCategories, settingsColor, calendarMonth, calendarYear, heroProfile, adventureList, adventureDay, periodWeek, growthMobile, settingsMobile, calendarMonthMobile, calendarYearMobile, heroHudMobile, earthMobile, adventureMobile, periodMobile] }, null, 2));
socket.close();
