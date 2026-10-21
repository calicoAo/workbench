import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Uses the repository's CDP fixture convention; no real account or financial writes.
const webOrigin = process.env.WALLET_HOME_WEB_ORIGIN ?? "http://127.0.0.1:5186";
const cdpOrigin = process.env.WALLET_HOME_CDP_ORIGIN ?? "http://127.0.0.1:9337";
const output = path.resolve("docs/reports/WB-WALLET-HOME-UI-evidence");
const wrapper = path.resolve("apps/web/.wallet-home-qa.html");
const pages = await fetch(`${cdpOrigin}/json/list`).then((r) => r.json());
const socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); const call = pending.get(message.id); if (!call) return; pending.delete(message.id); message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const messageId = ++id; pending.set(messageId, { resolve, reject }); socket.send(JSON.stringify({ id: messageId, method, params })); }); }
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(expression) { const end = Date.now() + 15000; while (Date.now() < end) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(100); } throw new Error(`Timed out: ${expression}`); }
async function navigate(route, focused = false) { await send("Page.navigate", { url: `${webOrigin}/.wallet-home-qa.html?route=${encodeURIComponent(route)}${focused ? '&focused=1' : ''}` }); await wait("document.querySelector('.hero-hud') && document.querySelector('.quick-action')"); }
async function click(label) { await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === ${JSON.stringify(label)} || node.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button'); button.click(); })()`); }
async function capture(name) { await sleep(400); const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }); await fs.writeFile(path.join(output, name), Buffer.from(result.data, "base64")); }
const evidence = [];
try {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(wrapper, `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/@fs${path.resolve("scripts/fixtures/wallet-home.tsx")}"></script></body></html>`);
  await send("Page.enable"); await send("Runtime.enable");
  for (const [width, height] of [[1440, 900], [1024, 900], [375, 812]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    await navigate("/today");
    await wait("document.querySelector('.today-countdown') && document.querySelector('.today-status-surface')");
    await sleep(250);
    const layout = await evaluate(`(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, current: rect('.today-current'), countdown: rect('.today-countdown'), water: rect('.today-water-block'), sleep: rect('.today-sleep-block'), quickText: document.querySelector('.quick-action').textContent, bellInHeader: !!document.querySelector('.app-topbar .reminder-bell'), closed: !document.querySelector('.reminder-popover') };
    })()`);
    assert.equal(layout.width, width); assert.equal(layout.height, height); assert.equal(layout.scrollWidth, width); assert.equal(layout.quickText.trim(), "快捷操作"); assert.ok(layout.bellInHeader && layout.closed);
    if (width >= 1024) { assert.equal(layout.current.y, layout.countdown.y); assert.ok(layout.countdown.x > layout.current.x); assert.equal(layout.current.y, layout.water.y); assert.equal(layout.current.y, layout.sleep.y); assert.ok(layout.water.x > layout.countdown.x && layout.sleep.x > layout.water.x); }
    assert.ok(layout.water.height < 180 && layout.sleep.height < 180, JSON.stringify(layout));
    await capture(`today-${width}.png`);
    await navigate("/today", true);
    await wait("document.querySelector('.current-focus-actions')");
    const focused = await evaluate(`(() => { const card = document.querySelector('.current-focus').getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth, card: {left:card.left,right:card.right,height:card.height}, copyWidth: document.querySelector('.current-focus-copy').getBoundingClientRect().width, controls: [...document.querySelectorAll('.current-focus-actions button')].map(node => { const r = node.getBoundingClientRect(); return {left:r.left,right:r.right}; }) }; })()`);
    assert.equal(focused.overflow, false);
    assert.ok(focused.copyWidth >= 100 && focused.card.height < 240, JSON.stringify(focused));
    assert.ok(focused.controls.every(rect => rect.left >= focused.card.left && rect.right <= focused.card.right), JSON.stringify(focused));
    await capture(`today-focused-${width}.png`);
    await navigate("/today");
    await click("主页提醒"); await wait("document.querySelector('.reminder-popover')");
    const popover = await evaluate(`(() => { const r = document.querySelector('.reminder-popover').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, text: document.querySelector('.reminder-popover').textContent }; })()`);
    assert.ok(popover.left >= 0 && popover.right <= width && popover.bottom <= height); assert.ok(popover.text.includes("宽带缴费") && popover.text.includes("完成项目验收"));
    await capture(`reminders-${width}.png`);
    await navigate("/finance"); await click("记支出"); await wait("document.querySelector('input[aria-label=金额]')");
    await evaluate(`(() => { const input = document.querySelector('input[aria-label=金额]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '10'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await click("保存支出"); await wait("document.querySelector('.feedback-modal-reward') && document.querySelector('.hero-hud').textContent.includes('35/200')");
    const feedback = await evaluate(`({ text: document.querySelector('.feedback-modal-reward').textContent, rewardAnimation: getComputedStyle(document.querySelector('.feedback-modal-reward')).animationName, toastAnimation: getComputedStyle(document.querySelector('.app-success-toast')).animationName, progressTransition: getComputedStyle(document.querySelector('.hero-hud-xp i')).transitionProperty })`);
    assert.ok(feedback.text.includes("+5 XP") && feedback.text.includes("+2")); assert.equal(feedback.rewardAnimation, "reward-arrive"); assert.equal(feedback.toastAnimation, "success-arrive"); assert.equal(feedback.progressTransition, "width");
    await sleep(450); await capture(`expense-feedback-${width}.png`);
    await navigate("/finance?tab=recurring"); await wait("document.querySelector('.finance-prepare-step')");
    const steps = await evaluate("[...document.querySelectorAll('.finance-step-title')].map(el => el.textContent)");
    assert.deepEqual(steps, ["1周期模板", "2选择模板并生成", "3待确认发生项"]);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(node => node.textContent.trim() === '生成本月待确认项').disabled"), true);
    await evaluate("document.querySelector('.finance-template-choice input').click()");
    await click("生成本月待确认项"); await wait("document.querySelector('.finance-occurrence-list article')");
    assert.equal(await evaluate("document.documentElement.scrollWidth"), width);
    await evaluate("document.querySelector('.finance-prepare-step').scrollIntoView({block: 'start'})");
    await capture(`recurring-${width}.png`);
    await evaluate("document.documentElement.dataset.reducedMotion = 'true'");
    const reducedMotion = await evaluate("getComputedStyle(document.querySelector('.hero-hud-xp i')).transitionDuration");
    assert.equal(reducedMotion, "1e-05s");
    evidence.push({ layout, focused, popover, feedback, steps, reducedMotion });
  }
  await fs.writeFile(path.join(output, "browser.json"), JSON.stringify({ kind: "isolated public Web component fixture; no API/MySQL writes", evidence }, null, 2));
  console.log(JSON.stringify({ pass: true, viewports: evidence.map(item => item.layout.width), output }));
} finally { await fs.rm(wrapper, { force: true }); socket.close(); }
