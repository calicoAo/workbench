import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const cdpOrigin = process.env.ALL_DIALOG_LAYOUT_CDP_ORIGIN ?? "http://127.0.0.1:9336";
const webOrigin = process.env.ALL_DIALOG_LAYOUT_WEB_ORIGIN ?? "http://127.0.0.1:5186";
const artifactDir = process.env.ALL_DIALOG_LAYOUT_ARTIFACT_DIR ?? path.resolve("docs/reports/WB-ALL-DIALOG-LAYOUT-evidence");
await fs.mkdir(artifactDir, { recursive: true });
const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("fresh Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0; const pending = new Map(); socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); const job = pending.get(message.id); if (!job) return; pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); });
function send(method, params = {}, timeout = 15000) { return new Promise((resolve, reject) => { const id = ++commandId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } console.error(await evaluate("({url:location.href,text:document.body.textContent})")); throw new Error(`Timed out: ${expression}`); }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(450); }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const value = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); if (width === 375) assert.deepEqual(value, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 }); else assert.ok(value.scrollWidth <= width); return value; }
async function screenshot(name) { const dimensions = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })");  if (dimensions.innerWidth === 375) assert.equal(dimensions.innerHeight,812); const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return { file, ...dimensions }; }
async function clickButton(text) { const found = await evaluate(`(() => { const node = [...document.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(${JSON.stringify(text)})); if (!node) return false; node.click(); return true; })()`); assert.equal(found, true, `missing button: ${text}`); await sleep(250); }

await send("Page.enable"); await send("Runtime.enable"); socket.addEventListener("message",event=>{const m=JSON.parse(event.data);if(m.method==="Runtime.exceptionThrown")console.error(JSON.stringify(m.params));});
const wrapper=path.resolve("apps/web/.dialog-layout-qa.html");
await fs.writeFile(wrapper,`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/@fs${path.resolve("scripts/fixtures/dialog-layout.tsx")}"></script></body></html>`);
const cases=[
 ['create',['打开']],['create-category',['打开','新建 / 管理分类'],'create'],['create-project',['打开','新建 / 管理项目'],'create'],
 ['timer',['结束本次']],['note-convert',['转为悬赏'],'notes'],['note-quote',['引用到日记'],'notes'],['edit',['打开']],['complete',['打开']],['select',['打开']],['calendar',[]],['sleep',[]],['capture',['打开']],
 ['writing-morning',['晨写'],'writing'],['writing-journal',['日记'],'writing'],['writing-review',['复盘'],'writing'],
 ['decision',['辅助决策']],['bridge',['心理桥梁'],'decision'],['finance',['创建账户']],['expense',['记支出'],'finance'],['income',['记收入'],'finance'],['transfer',['转账'],'finance'],
 ['categories',['新增分类']],['habits',['新建习惯']],['hero',[]],['backpack',['新建里程碑']],['backpack-detail',['首个里程碑'],'backpack'],['library',['添加作品']],['onboarding',[]],['feedback',['打开']],['reward',['打开']]
];
const evidence=[];
try {
 for(const [width,height] of [[1440,900],[375,812]]) {
  await viewport(width,height);
  for(const [name,buttons,scene=name] of cases.filter(([name]) => !process.env.ALL_DIALOG_LAYOUT_CASES || process.env.ALL_DIALOG_LAYOUT_CASES.split(",").includes(name))) {
   await navigate('/.dialog-layout-qa.html?scene='+scene,'#root');
   for(const label of buttons){await waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim().startsWith(${JSON.stringify(label)}))`);await clickButton(label);}
   await waitFor("Array.from(document.querySelectorAll('.ui-dialog')).some(el=>el.getBoundingClientRect().width>0)");
   const layout=await evaluate(`(() => {
    const form=Array.from(document.querySelectorAll('.ui-dialog')).filter(el=>el.getBoundingClientRect().width>0).at(-1), header=form.querySelector(':scope > header'), close=header?.querySelector(':scope > button'), title=header?.querySelector('h1,h2,h3'), footer=form.querySelector(':scope > footer, .ui-dialog-actions');
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    return {title:header?.textContent,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth},form:rect(form),header:rect(header),close:rect(close),heading:rect(title),footer:rect(footer),display:header?getComputedStyle(header).display:null,checkboxes:Array.from(form.querySelectorAll('label > input[type=checkbox]')).map(input=>({input:rect(input),label:rect(input.parentElement),display:getComputedStyle(input.parentElement).display})),scrollHeight:form.scrollHeight,clientHeight:form.clientHeight,scrollWidth:form.scrollWidth,clientWidth:form.clientWidth};
   })()`);
   assert.equal(layout.display,'flex',name+' header');assert.ok(layout.close,name+' close');assert.ok(layout.heading,name+' title');
   assert.equal(layout.scrollWidth,layout.clientWidth,name+' dialog overflow');assert.ok(layout.form.left>=0&&layout.form.right<=width,name+' horizontal bounds');
   assert.ok(layout.form.top>=0&&layout.form.bottom<=height,name+' vertical bounds');
   assert.ok(layout.close.width>=44&&layout.close.height>=44,name+' close target');
   assert.ok(layout.close.left>=layout.heading.right-1,name+' header alignment');
   assert.ok(layout.footer,name+' actions');
   for(const check of layout.checkboxes){assert.equal(check.display,'flex');assert.equal(check.input.width,16);assert.ok(check.label.height>=44);}
   await evaluate("Array.from(document.querySelectorAll('.ui-dialog')).filter(el=>el.getBoundingClientRect().width>0).at(-1).scrollTop=100000");await sleep(80);
   const scroll=await evaluate("(() => {const f=Array.from(document.querySelectorAll('.ui-dialog')).filter(el=>el.getBoundingClientRect().width>0).at(-1),h=f.querySelector(':scope > header'),foot=f.querySelector(':scope > footer, .ui-dialog-actions');return {headerTop:h.getBoundingClientRect().top,footerBottom:foot.getBoundingClientRect().bottom}})()");
   assert.ok(scroll.headerTop>=0,name+' title remains reachable');assert.ok(scroll.footerBottom<=height,name+' actions reachable after scroll');
   evidence.push({name,width,layout,scroll,screenshot:await screenshot(`${name}-${width}.png`)});
   console.log(name,width,'PASS');
  }
 }
 await fs.writeFile(path.join(artifactDir,'browser.json'),JSON.stringify({result:'PASS',scope:'Real public feature components and production CSS; isolated fixture reads, no API/DB persistence assertions',evidence},null,2)+'\n');
} finally {socket.close();await fs.rm(wrapper,{force:true});}
