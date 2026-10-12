import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Require isolated TEST_DATABASE_URL ending in _test');
const apiOrigin=process.env.BOUNTY_CATEGORY_API_ORIGIN ?? 'http://127.0.0.1:3015';
const webOrigin=process.env.BOUNTY_CATEGORY_WEB_ORIGIN ?? 'http://127.0.0.1:5185';
const cdpOrigin=process.env.BOUNTY_CATEGORY_CDP_ORIGIN ?? 'http://127.0.0.1:9335';
const reports=new URL('../docs/reports/',import.meta.url);
const prefix='WB-PRODUCT-CLOSURE-02-BOUNTY-CATEGORY';
const connection=await mysql.createConnection(databaseUrl);
let token;
async function api(path,body,method=body?'POST':'GET') {
 const response=await fetch(apiOrigin+'/api'+path,{method,headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const json=await response.json();assert.equal(response.status,200,JSON.stringify(json));return json.data;
}
const pages = await fetch(`${cdpOrigin}/json/list`).then((r) => r.json());
const socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0; const pending = new Map();
socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id) return; const job = pending.get(message.id); pending.delete(message.id); if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const messageId = ++id; pending.set(messageId, { resolve, reject }); socket.send(JSON.stringify({ id: messageId, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function waitFor(expression) { const start = Date.now(); while (Date.now() - start < 30000) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(100); } throw new Error(`Timed out: ${expression}`); }
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
}
async function screenshot(suffix) {
  await sleep(250); // Capture the settled modal/viewport layout, after entrance transitions.
  const metrics = await evaluate("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})");
  assert.equal(metrics.scrollWidth, metrics.width, "horizontal page overflow");
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(new URL(`${prefix}-${suffix}.png`, reports), Buffer.from(image.data, "base64")); return metrics;
}
async function clickText(text) {
  assert.ok(await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)}); if(!button)return false;button.click();return true;})()`), `missing button ${text}`);
}
async function clickLabel(label) { assert.ok(await evaluate(`(() => {const button=document.querySelector('button[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!button)return false;button.click();return true;})()`), `missing ${label}`); }
async function setField(selector, value) {
  assert.ok(await evaluate(`(() => {const field=document.querySelector(${JSON.stringify(selector)});if(!field)return false; const prototype=field.tagName==='SELECT'?HTMLSelectElement.prototype:field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`), `missing ${selector}`);
}

async function key(name,shift=false) {
 const code={Tab:9,Escape:27,Enter:13,' ':32}[name];
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name===' '?'Space':name,windowsVirtualKeyCode:code,modifiers:shift?8:0,...(name==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name===' '?'Space':name,windowsVirtualKeyCode:code,modifiers:shift?8:0});
}
const fieldExpression=label=>'document.querySelector('+JSON.stringify('[aria-label='+JSON.stringify(label)+']')+')';
const input=(label,value)=>setField('[aria-label='+JSON.stringify(label)+']',value);
async function notice(title) {
 await waitFor('document.querySelector("#feedback-popup-title")?.textContent === '+JSON.stringify(title));
 assert.ok(await evaluate('document.querySelector(".feedback-modal").contains(document.activeElement)'),'feedback owns focus');
 await key('Escape');await waitFor('!document.querySelector(".feedback-modal")');
 await waitFor('document.activeElement?.textContent.includes("新建 / 管理分类")');
 assert.ok(await evaluate('Boolean(document.querySelector(".task-create-modal"))'),'Bounty retained');
}
async function openBounty(title,projectId) {
 await clickText('发布悬赏');await waitFor('document.querySelector(".task-create-modal")');
 await input('任务标题',title);await input('任务详情','保留详情与完成标准');await input('优先级','3');await input('难度','4');
 await input('预计分钟','45');await input('初始进度','20');await input('截止日期','2026-10-20');await input('截止时间','19:30');await input('所属项目',String(projectId));
}
async function draft(title,projectId) {
 const values=await evaluate('Object.fromEntries(["任务标题","任务详情","优先级","难度","预计分钟","初始进度","截止日期","截止时间","所属项目"].map(label=>[label,document.querySelector("[aria-label="+JSON.stringify(label)+"]").value]))');
 assert.deepEqual(values,{'任务标题':title,'任务详情':'保留详情与完成标准','优先级':'3','难度':'4','预计分钟':'45','初始进度':'20','截止日期':'2026-10-20','截止时间':'19:30','所属项目':String(projectId)});
}
async function managerLayout() {
 await evaluate('document.querySelector(".category-form-actions").scrollIntoView({block:"nearest"})');await sleep(250);
 const layout=await evaluate('(() => {const panel=document.querySelector(".category-quick-manager"),r=panel.getBoundingClientRect(),f=panel.querySelector(".category-form-actions").getBoundingClientRect();return{width:innerWidth,height:innerHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,footerTop:f.top,footerBottom:f.bottom,portalCount:document.querySelectorAll(".modal-backdrop").length,activeDialogs:document.querySelectorAll("[role=dialog]").length,parentInert:!!document.querySelector(".task-create-modal").closest("[inert]"),separateForms:!document.querySelector(".category-editor-form").closest(".task-create-modal"),headerVisible:panel.querySelector("header").getBoundingClientRect().top>=r.top&&panel.querySelector("header").getBoundingClientRect().bottom<=innerHeight,buttonHeights:[...panel.querySelectorAll(".category-form-actions button,header button")].map(b=>b.getBoundingClientRect().height)}})()');
 assert.ok(layout.headerVisible,JSON.stringify(layout));assert.equal(layout.portalCount,1);assert.equal(layout.activeDialogs,1);assert.ok(layout.parentInert && layout.separateForms);
 assert.ok(layout.left>=0 && layout.right<=layout.width && layout.top>=0 && layout.bottom<=layout.height,JSON.stringify(layout));
 assert.ok(layout.scrollWidth<=layout.clientWidth && layout.footerBottom<=layout.height,JSON.stringify(layout));
 if(layout.width===375)assert.ok(layout.buttonHeights.every(h=>h>=44));
 return layout;
}
try {
 const registered=await api('/auth/register',{username:'bounty_qa_'+Date.now(),password:'BountyQA-only-2026',displayName:'Bounty QA'});token=registered.token;
 await api('/onboarding/flows/core-loop/skip',{});
 const custom=await api('/growth/dimensions',{name:'陶艺定制',color:'#8B5CF6',sortOrder:75});
 const dimensions=await api('/growth/dimensions');const career=dimensions.dimensions.find(d=>d.dimensionKey==='career');
 await api('/growth/dimensions/'+career.id,{expectedVersion:career.version,name:'工作与事业'},'PUT');
 const disabled=await api('/growth/dimensions',{name:'不可选维度',color:'#64748B',sortOrder:99});
 await api('/growth/dimensions/'+disabled.id,{expectedVersion:disabled.version,enabled:false},'PUT');
 const project=await api('/projects',{name:'保留父项目'});
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:webOrigin});await waitFor('document.readyState === "complete"');
 await evaluate('localStorage.setItem("personal_workbench_token",'+JSON.stringify(token)+')');
 await send('Page.navigate',{url:webOrigin+'/tasks?date=2026-10-11'});await waitFor('document.querySelector(".bounty-board-head")');
 if(await evaluate('Boolean(document.querySelector(".earth-entry-close"))'))await evaluate('document.querySelector(".earth-entry-close").click()');
 const evidence={result:'PASS',layouts:[],flows:[],screenshots:[],userId:registered.user.id,customDimension:custom.dimensionKey};
 for(const [width,height,claim] of [[1440,1000,false],[375,812,true]]) {
  await viewport(width,height);const title='悬赏验收 '+width;await openBounty(title,project.id);await clickText('新建 / 管理分类');
  await waitFor('document.querySelector(".category-editor-form") && !document.querySelector("[aria-label=新分类成长维度]").disabled');
  assert.ok(await evaluate('[...document.querySelector("[aria-label=新分类成长维度]").options].some(o=>o.textContent==="工作与事业")'));
  assert.equal(await evaluate('[...document.querySelector("[aria-label=新分类成长维度]").options].some(o=>o.textContent==="不可选维度")'),false);
  await input('新分类名称','本次分类 '+width);await input('新分类成长维度',custom.dimensionKey);await input('分类 Hex 颜色','invalid');
  assert.equal(await evaluate(fieldExpression("分类 Hex 颜色")+'.getAttribute("aria-invalid")'),"true");
  assert.ok(await evaluate('[...document.querySelectorAll(".category-editor-form button")].find(b=>b.textContent==="保存分类").disabled'));
  await evaluate(fieldExpression("使用颜色 #8B5CF6")+".focus()");await key(" ");
  assert.equal(await evaluate(fieldExpression("使用颜色 #8B5CF6")+'.getAttribute("aria-pressed")'),"true");
  await input('分类 Hex 颜色','#aabbcc');
  const controls=await evaluate('(()=>{const p=document.querySelector(".task-category-panel"),a=[...p.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled)")].filter(n=>!n.closest("fieldset:disabled"));a.at(-1).focus();return a.length})()');assert.ok(controls>2);
  await key('Tab');assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'),'关闭');
  await key('Tab',true);assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'),await evaluate('[...document.querySelectorAll(".category-quick-row button")].at(-1).getAttribute("aria-label")'));
  evidence.layouts.push(await managerLayout());evidence.screenshots.push(await screenshot('editor-'+width));
  // A genuine keyboard Enter saves only the Category form, never the parent Task form.
  await evaluate('document.querySelector("[aria-label=新分类名称]").focus()');await key('Enter');await notice('分类已创建');await draft(title,project.id);
  const categories=await api('/task-categories');const category=categories.find(c=>c.name==='本次分类 '+width);assert.ok(category);
  assert.equal(category.dimensionKey,custom.dimensionKey);assert.equal(category.color,'#AABBCC');
  assert.equal(await evaluate('document.querySelector("[aria-label=事件类型]").value'),String(category.id));
  const [beforeTasks]=await connection.query('SELECT COUNT(*) n FROM tasks WHERE user_id=? AND title=?',[registered.user.id,title]);assert.equal(beforeTasks[0].n,0);
  await clickText('新建 / 管理分类');await waitFor('document.querySelector(".category-editor-form")');assert.equal(await evaluate('document.querySelector("[aria-label=新分类名称]").value'),'');
  await input('新分类名称','取消草稿');await key('Escape');await waitFor('!document.querySelector(".category-editor-form")');await draft(title,project.id);
  assert.ok(await evaluate('document.activeElement.textContent.includes("新建 / 管理分类")'));
  await connection.query('UPDATE task_categories SET target_minutes=12345,icon="qa-hidden" WHERE id=?',[category.id]);
  await clickText('新建 / 管理分类');await clickLabel('编辑分类 '+category.name);await input('分类名称','编辑后的分类 '+width);await input('分类成长维度','');await clickText('保存分类');await notice('分类已更新');await draft(title,project.id);
  const [saved]=await connection.query('SELECT dimension_key,target_minutes,icon FROM task_categories WHERE id=?',[category.id]);
  assert.deepEqual(saved[0],{dimension_key:null,target_minutes:12345,icon:'qa-hidden'});
  evidence.screenshots.push(await screenshot('selected-'+width));
  await clickText(claim?'发布并接取':'发布');await waitFor('!document.querySelector(".task-create-modal")');
  const [tasks]=await connection.query('SELECT id,category_id,project_id,title,description,priority,difficulty,estimated_minutes,progress_percent FROM tasks WHERE user_id=? AND title=?',[registered.user.id,title]);assert.equal(tasks.length,1);
  assert.equal(tasks[0].category_id,category.id);assert.equal(tasks[0].project_id,project.id);assert.equal(tasks[0].description,'保留详情与完成标准');assert.equal(tasks[0].estimated_minutes,45);assert.equal(tasks[0].progress_percent,20);
  const [assignments]=await connection.query('SELECT COUNT(*) n FROM task_daily_assignments WHERE task_id=?',[tasks[0].id]);assert.equal(assignments[0].n,claim?1:0);
  evidence.flows.push({width,taskId:tasks[0].id,categoryId:category.id,claim,mappingInitially:custom.dimensionKey,mappingAfterEdit:null,hiddenTarget:12345,keyboard:'PASS',draft:'PASS'});
 }
 await fs.writeFile(new URL(prefix+'-browser.json',reports),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
} finally {socket.close();await connection.end();}
