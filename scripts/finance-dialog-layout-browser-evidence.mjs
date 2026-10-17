import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const cdpOrigin = process.env.FINANCE_DIALOG_LAYOUT_CDP_ORIGIN ?? "http://127.0.0.1:9336";
const webOrigin = process.env.FINANCE_DIALOG_LAYOUT_WEB_ORIGIN ?? "http://127.0.0.1:5186";
const artifactDir = process.env.FINANCE_DIALOG_LAYOUT_ARTIFACT_DIR ?? path.resolve("docs/reports");
await fs.mkdir(artifactDir, { recursive: true });
const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("fresh Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0; const pending = new Map(); socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); const job = pending.get(message.id); if (!job) return; pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); });
function send(method, params = {}, timeout = 15000) { return new Promise((resolve, reject) => { const id = ++commandId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } throw new Error(`Timed out: ${expression}`); }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(450); }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const value = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); if (width === 375) assert.deepEqual(value, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 }); else assert.ok(value.scrollWidth <= width); return value; }
async function screenshot(name) { const dimensions = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.deepEqual(dimensions, { innerWidth: dimensions.innerWidth, innerHeight: dimensions.innerHeight, scrollWidth: dimensions.innerWidth }); if (dimensions.innerWidth === 375) assert.deepEqual(dimensions, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 }); const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return { file, ...dimensions }; }
async function clickButton(text) { const found = await evaluate(`(() => { const node = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!node) return false; node.click(); return true; })()`); assert.equal(found, true, `missing button: ${text}`); await sleep(250); }

await send("Page.enable"); await send("Runtime.enable");
const route=process.env.FINANCE_DIALOG_LAYOUT_ROUTE ?? "/finance?date=2026-10-12&tab=accounts";
const metrics=async()=>evaluate(`(() => {
 const form=document.querySelector('.finance-dialog'), header=form.querySelector(':scope > header'), title=header.querySelector('h2'), close=header.querySelector('button');
 const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
 const check=form.querySelector('.finance-check'), box=check?.querySelector('input');
 const text=check?.querySelector('span');
 return {viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth},form:rect(form),header:{display:getComputedStyle(header).display,...rect(header)},title:rect(title),close:rect(close),label:check?{display:getComputedStyle(check).display,...rect(check)}:null,checkbox:box?rect(box):null,text:text?rect(text):null,footerDisplay:getComputedStyle(form.querySelector('footer')).display};
})()`);
try {
 await viewport(1440,900); await navigate(route,'.finance-route'); await clickButton("创建账户");
 await waitFor("document.querySelector('.finance-dialog') !== null");
 if(process.env.FINANCE_DIALOG_LAYOUT_REPRO==='1') { console.log(JSON.stringify({before:await metrics()},null,2)); await screenshot('WB-FINANCE-DIALOG-LAYOUT-before.png'); }
 else {
 const evidence=[];
 for(const [width,height] of [[1440,900],[375,812]]) {
   await viewport(width,height); await sleep(250);
   const value=await metrics(); assert.equal(value.header.display,'flex'); assert.equal(value.label.display,'flex');
   assert.ok(value.close.left>value.title.right,'close to right of title');
   assert.ok(value.close.top<value.title.bottom && value.close.bottom>value.title.top,'close and title share header row');
   assert.ok(value.checkbox.right<value.text.left,'checkbox before label text');
   assert.ok(Math.abs((value.checkbox.top+value.checkbox.bottom)/2-(value.text.top+value.text.bottom)/2)<2,'checkbox and label vertically aligned');
   assert.equal(value.viewport.width,width);assert.equal(value.viewport.height,height);assert.equal(value.viewport.scrollWidth,width);
   assert.ok(value.form.top>=0 && value.form.bottom<=height,'dialog fits viewport');
   assert.equal(value.footerDisplay,'flex');
   assert.ok(value.close.width>= (width<768?44:32));
   assert.ok(value.label.height>=44);
   const before=await evaluate("document.querySelector('.finance-dialog .finance-check input').checked");
   await evaluate("document.querySelector('.finance-dialog .finance-check span').click()");
   await waitFor(`document.querySelector('.finance-dialog .finance-check input').checked === ${!before}`);
   evidence.push({width,layout:value,screenshot:await screenshot(`WB-FINANCE-DIALOG-LAYOUT-create-${width}.png`)});
 }
 await evaluate("document.querySelector('.finance-dialog header button').click()"); await waitFor("!document.querySelector('.finance-dialog')");
 await evaluate("document.querySelector('[aria-label=\"编辑 工资卡\"]').click()"); await waitFor("document.querySelector('.finance-dialog')!==null");
 assert.equal((await metrics()).header.display,'flex');
 await evaluate("document.querySelector('.finance-dialog header button').click()");
 for(const label of ['记支出','记收入','转账']) {
   await viewport(1440,900); await clickButton(label); await waitFor("document.querySelector('.finance-dialog')!==null");
   const value=await metrics(); assert.equal(value.header.display,'flex'); assert.ok(value.close.left>value.title.right);
   evidence.push({dialog:label,layout:value});
   await evaluate("document.querySelector('.finance-dialog header button').click()"); await waitFor("!document.querySelector('.finance-dialog')");
 }
 console.log(JSON.stringify({result:'PASS',scope:'real Finance UI/CSS; layout-only fixture data, no database or persistence assertions',evidence},null,2));
 }
} finally { socket.close(); }
