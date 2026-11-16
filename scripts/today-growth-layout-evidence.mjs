import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const baseline = process.argv.includes("--baseline");
const web = process.env.TODAY_GROWTH_WEB_ORIGIN ?? "http://127.0.0.1:5187";
const cdp = process.env.TODAY_GROWTH_CDP_ORIGIN ?? "http://127.0.0.1:9340";
const output = path.resolve("docs/reports/today-growth-layout");
const wrapper = path.resolve("apps/web/.today-growth-layout-qa.html");
const pages = await fetch(`${cdp}/json/list`).then(r => r.json());
const socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", event => { const value = JSON.parse(event.data), call = pending.get(value.id); if (!call) return; pending.delete(value.id); clearTimeout(call.timer); value.error ? call.reject(new Error(value.error.message)) : call.resolve(value.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) { for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(100); } throw new Error(`Timed out: ${expression}`); }
async function capture(name) { const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); await fs.writeFile(path.join(output, `${baseline ? "before" : "after"}-${name}.png`), Buffer.from(result.data, "base64")); }
const evidence = [];
try {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(wrapper, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/@fs${path.resolve("scripts/fixtures/today-growth-layout.tsx")}"></script></body></html>`);
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  for (const width of [1440, 1024, 390]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: width < 768 });
    await send("Page.navigate", { url: `${web}/.today-growth-layout-qa.html?route=/today` });
    await wait("document.querySelectorAll('.completed-task-row').length === 11");
    const today = await evaluate(`(() => {
      const rect = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const water=rect(document.querySelector('.today-water-block')), sleep=rect(document.querySelector('.today-sleep-block'));
      const rows=[...document.querySelectorAll('.completed-task-row')].map(node=>({...rect(node),title:rect(node.querySelector('strong')),time:rect(node.querySelector('small'))}));
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,water,sleep,rows};
    })()`);
    await capture(`today-${width}`);
    await evaluate("document.querySelector('.completed-task-row').scrollIntoView({block:'center'})");
    await capture(`completed-${width}`);
    await send("Page.navigate", { url: `${web}/.today-growth-layout-qa.html?route=/growth` });
    await wait("document.querySelector('.growth-hero-card')");
    const growth = await evaluate(`(() => {const groups=[...document.querySelectorAll('.growth-period,.growth-subnav')];return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,nestedVisuals:groups.reduce((n,g)=>n+g.querySelectorAll('.ui-button-visual').length,0),controls:groups.flatMap(g=>[...g.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {height:r.height,left:r.left,right:r.right,label:b.textContent};}))};})()`);
    await capture(`growth-${width}`);
    await evaluate("[...document.querySelectorAll('.growth-period button')].find(b=>b.textContent.includes('7')).click()");
    await wait("document.querySelector('.growth-period button[aria-pressed=true]').textContent.includes('7')");
    await evaluate("[...document.querySelectorAll('.growth-subnav button')].find(b=>b.textContent==='配置').click()");
    await wait("document.querySelector('.growth-configuration')");
    await evaluate("[...document.querySelectorAll('.growth-configuration button')].find(b=>b.textContent==='分类映射').click()");
    await wait("[...document.querySelectorAll('.growth-configuration button')].some(b=>b.textContent==='分类映射'&&b.getAttribute('aria-pressed')==='true')");
    if (!baseline) {
      assert.equal(today.width, width); assert.ok(today.scrollWidth <= width);
      assert.ok(today.sleep.y >= today.water.bottom, 'water and sleep stack');
      assert.equal(today.sleep.x, today.water.x);
      for (const [index, row] of today.rows.entries()) {
        assert.ok(row.height >= 48, 'completion target height');
        assert.ok(row.title.y >= row.y && row.title.bottom <= row.bottom, 'title contained');
        assert.ok(row.time.y >= row.y && row.time.bottom <= row.bottom, 'timestamp contained');
        if (index) assert.ok(row.y >= today.rows[index-1].bottom, 'completion rows do not overlap');
      }
      assert.ok(growth.scrollWidth <= width); assert.equal(growth.nestedVisuals, 0, 'no nested button decoration');
      assert.ok(growth.controls.every(b=>b.left>=0 && b.right<=width && b.height >= (width<768?44:36)), 'growth controls fit');
    }
    evidence.push({ today, growth });
  }
  await fs.writeFile(path.join(output, baseline ? "before.json" : "after.json"), JSON.stringify({ kind: "Public UI with isolated in-memory transport; no database writes", evidence }, null, 2));
  console.log(JSON.stringify({ result: baseline ? "BASELINE_CAPTURED" : "PASS", widths: evidence.map(item=>item.today.width), output }));
} finally { await fs.rm(wrapper, { force: true }); socket.close(); }
