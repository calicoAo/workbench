import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Require isolated TEST_DATABASE_URL ending in _test');
const apiOrigin=process.env.BOUNTY_PROJECT_API_ORIGIN ?? 'http://127.0.0.1:3015';
const webOrigin=process.env.BOUNTY_PROJECT_WEB_ORIGIN ?? 'http://127.0.0.1:5185';
const cdpOrigin=process.env.BOUNTY_PROJECT_CDP_ORIGIN ?? 'http://127.0.0.1:9335';
const reports=new URL('../docs/reports/',import.meta.url);
const prefix='WB-PRODUCT-CLOSURE-02-BOUNTY-PROJECT';
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
const input=(label,value)=>setField('[data-active-task-panel] [aria-label='+JSON.stringify(label)+']',value);
async function notice(title,launch="新建 / 管理项目") {
 await waitFor('document.querySelector("#feedback-popup-title")?.textContent === '+JSON.stringify(title));
 assert.ok(await evaluate('document.querySelector(".feedback-modal").contains(document.activeElement)'),'feedback owns focus');
 await key('Escape');await waitFor('!document.querySelector(".feedback-modal")');
 await waitFor('document.activeElement?.textContent.includes('+JSON.stringify(launch)+')');
 assert.ok(await evaluate('Boolean(document.querySelector(".task-create-modal"))'),'Bounty retained');
}
async function openBounty(title,projectId) {
 await clickText('发布悬赏');await waitFor('document.querySelector(".task-create-modal")');
 await input('任务标题',title);await input('任务详情','保留详情与完成标准');await input('优先级','3');await input('难度','4');
 await input('预计分钟','45');await input('初始进度','20');await input('截止日期','2026-10-20');await input('截止时间','19:30');await input('所属项目',String(projectId));
}
async function draft(title,projectId) {
 const values=await evaluate('Object.fromEntries(["任务标题","任务详情","优先级","难度","预计分钟","初始进度","截止日期","截止时间","所属项目"].map(label=>[label,document.querySelector(".task-create-modal [aria-label="+JSON.stringify(label)+"]").value]))');
 assert.deepEqual(values,{'任务标题':title,'任务详情':'保留详情与完成标准','优先级':'3','难度':'4','预计分钟':'45','初始进度':'20','截止日期':'2026-10-20','截止时间':'19:30','所属项目':String(projectId)});
}
async function projectField(label,value) {
 assert.ok(await evaluate(`(()=>{const label=[...document.querySelectorAll('.project-editor label')].find(n=>n.firstChild.textContent.trim()===${JSON.stringify(label)});const field=label?.querySelector('input,textarea,select');if(!field)return false;Object.getOwnPropertyDescriptor(field.tagName==='SELECT'?HTMLSelectElement.prototype:field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`));
}
async function projectLayout() {
 await evaluate('document.querySelector(".project-editor footer").scrollIntoView({block:"nearest"})');await sleep(250);
 const value=await evaluate('(()=>{const p=document.querySelector(".project-quick-manager"),r=p.getBoundingClientRect(),h=p.querySelector("header").getBoundingClientRect(),f=p.querySelector("footer").getBoundingClientRect();return{width:innerWidth,height:innerHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,headerTop:h.top,headerBottom:h.bottom,footerBottom:f.bottom,portalCount:document.querySelectorAll(".modal-backdrop").length,activeDialogs:document.querySelectorAll("[role=dialog]").length,parentInert:!!document.querySelector(".task-create-modal").closest("[inert]"),separateForms:!document.querySelector(".project-editor").closest(".task-create-modal"),buttonHeights:[...p.querySelectorAll("footer button,header button")].map(b=>b.getBoundingClientRect().height)}})()');
 assert.equal(value.portalCount,1);assert.equal(value.activeDialogs,1);assert.ok(value.parentInert&&value.separateForms);
 assert.ok(value.left>=0&&value.right<=value.width&&value.top>=0&&value.bottom<=value.height,JSON.stringify(value));
 assert.ok(value.scrollWidth<=value.clientWidth&&value.headerTop>=value.top&&value.headerBottom<=value.height&&value.footerBottom<=value.height,JSON.stringify(value));
 if(value.width===375)assert.ok(value.buttonHeights.every(h=>h>=44),JSON.stringify(value));return value;
}
try {
 const registered=await api('/auth/register',{username:'project_qa_'+Date.now(),password:'ProjectQA-only-2026',displayName:'Project QA'});token=registered.token;
 await api('/onboarding/flows/core-loop/skip',{});
 const originalProject=await api('/projects',{name:'原有父项目'});
 const done=await api('/projects',{name:'不可选完成项目'});await api('/projects/'+done.id+'/status',{expectedVersion:1,status:3},'PUT');
 const archived=await api('/projects',{name:'不可选归档项目'});await api('/projects/'+archived.id+'/archive',{expectedVersion:1},'PUT');
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 const requests=[];socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Network.requestWillBeSent')requests.push(data.params.request);});
 await send('Page.navigate',{url:webOrigin});await waitFor('document.readyState === "complete"');await evaluate('localStorage.setItem("personal_workbench_token",'+JSON.stringify(token)+')');
 await send('Page.navigate',{url:webOrigin+'/tasks?date=2026-10-12'});await waitFor('document.querySelector(".bounty-board-head") && document.querySelector("select[aria-label=分类]")?.options.length>2');
 if(await evaluate('Boolean(document.querySelector(".earth-entry-close"))'))await evaluate('document.querySelector(".earth-entry-close").click()');
 const evidence={result:'PASS',layouts:[],flows:[],screenshots:[],userId:registered.user.id};
 for(const [width,height,claim] of [[1440,1000,false],[375,812,true]]) {
  await viewport(width,height);const title='项目悬赏验收 '+width;await openBounty(title,originalProject.id);
  // The completed Category capability remains usable in the same parent draft.
  await clickText('新建 / 管理分类');await waitFor('document.querySelector(".category-editor-form")');await input('新分类名称','项目流程分类 '+width);await clickText('保存分类');await notice('分类已创建','新建 / 管理分类');await draft(title,originalProject.id);
  const categoryId=Number(await evaluate('document.querySelector("[aria-label=事件类型]").value'));
  assert.ok(categoryId>0);
  assert.equal(await evaluate('[...document.querySelector("[aria-label=所属项目]").options].some(o=>o.textContent.includes("不可选"))'),false);
  await clickText('新建 / 管理项目');await waitFor('document.querySelector(".project-editor")');
  await projectField('项目名称','取消项目草稿');await key('Escape');await waitFor('!document.querySelector(".project-editor")');await draft(title,originalProject.id);
  assert.ok(await evaluate('document.activeElement.textContent.includes("新建 / 管理项目")'));
  await clickText('新建 / 管理项目');await waitFor('document.querySelector(".project-editor")');assert.equal(await evaluate('document.querySelector(".project-editor input").value'),'');
  await projectField('项目名称','新建项目 '+width);await projectField('说明','项目说明');await projectField('优先级','3');await projectField('开始日期','2026-10-01');await projectField('目标日期','2026-12-31');await projectField('项目笔记','需要保留的项目笔记');
  await evaluate('[...document.querySelectorAll(".task-project-panel button")].at(-1).focus()');await key('Tab');assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'关闭');
  await key('Tab',true);assert.ok(await evaluate('document.activeElement=== [...document.querySelectorAll(".task-project-panel button")].at(-1)'));
  evidence.layouts.push(await projectLayout());evidence.screenshots.push(await screenshot('editor-'+width));
  const before=requests.filter(r=>r.method==='POST'&&r.url.endsWith('/api/projects')).length;
  await send('Network.emulateNetworkConditions',{offline:false,latency:200,downloadThroughput:-1,uploadThroughput:-1});
  await evaluate('document.querySelector(".project-editor input").focus()');await key('Enter');await key('Enter');await notice('项目已创建');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  assert.equal(requests.filter(r=>r.method==='POST'&&r.url.endsWith('/api/projects')).length-before,1,'one Project POST despite repeated Enter');
  const projectId=Number(await evaluate('document.querySelector("[aria-label=所属项目]").value'));assert.ok(projectId>0&&projectId!==originalProject.id);await draft(title,projectId);
  assert.equal(Number(await evaluate('document.querySelector("[aria-label=事件类型]").value')),categoryId);
  const persisted=await api('/projects/'+projectId);assert.equal(persisted.project.name,'新建项目 '+width);assert.equal(persisted.project.notes,'需要保留的项目笔记');
  const [beforeTasks]=await connection.query('SELECT COUNT(*) n FROM tasks WHERE user_id=? AND title=?',[registered.user.id,title]);assert.equal(beforeTasks[0].n,0,'Project Enter never publishes Bounty');
  // Metadata editing of another Project must not switch the parent selection.
  await clickText('新建 / 管理项目');await waitFor('document.querySelector(".project-editor")');await clickLabel('编辑项目 原有父项目');await projectField('说明','编辑另一项目 '+width);await clickText('保存');await notice('项目已更新');await draft(title,projectId);
  await clickText('新建 / 管理项目');await waitFor('document.querySelector(".project-editor")');await clickLabel('编辑项目 新建项目 '+width);await projectField('项目名称','编辑后的项目 '+width);await clickText('保存');await notice('项目已更新');await draft(title,projectId);
  const updated=await api('/projects/'+projectId);assert.equal(updated.project.notes,'需要保留的项目笔记');assert.equal(updated.project.startDate,'2026-10-01');assert.equal(updated.project.targetDate,'2026-12-31');
  await evaluate('document.querySelector(".task-create-modal button[type=submit]").scrollIntoView({block:"nearest"})');evidence.screenshots.push(await screenshot('selected-'+width));
  await clickText(claim?'发布并接取':'发布');await waitFor('!document.querySelector(".task-create-modal")');
  const [tasks]=await connection.query('SELECT id,category_id,project_id,description,estimated_minutes,progress_percent,priority,difficulty FROM tasks WHERE user_id=? AND title=?',[registered.user.id,title]);assert.equal(tasks.length,1);assert.equal(tasks[0].project_id,projectId);assert.equal(tasks[0].category_id,categoryId);assert.equal(tasks[0].description,'保留详情与完成标准');assert.equal(tasks[0].estimated_minutes,45);assert.equal(tasks[0].progress_percent,20);assert.equal(tasks[0].priority,3);assert.equal(tasks[0].difficulty,4);
  const published=requests.filter(r=>r.method==='POST'&&r.url.endsWith('/api/tasks')).at(-1);const payload=JSON.parse(published.postData);assert.equal(payload.dueAt,'2026-10-20T19:30');
  const [assignments]=await connection.query('SELECT COUNT(*) n FROM task_daily_assignments WHERE task_id=?',[tasks[0].id]);assert.equal(assignments[0].n,claim?1:0);
  await send('Page.navigate',{url:webOrigin+'/projects/'+projectId+'?date=2026-10-12'});await waitFor('document.querySelector(".project-detail")');await clickText('发布所属悬赏');await waitFor('document.querySelector(".task-create-modal")');assert.equal(Number(await evaluate('document.querySelector("[aria-label=所属项目]").value')),projectId);await key('Escape');
  evidence.flows.push({width,claim,taskId:tasks[0].id,projectId,categoryId,canonicalIdentity:'PASS',categoryRegression:'PASS',metadataPreserved:'PASS',editOtherKeepsSelection:'PASS',keyboard:'PASS',draft:'PASS',detailPreselection:'PASS',projectPostCount:1});
  await send('Page.navigate',{url:webOrigin+'/tasks?date=2026-10-12'});await waitFor('document.querySelector(".bounty-board-head") && document.querySelector("select[aria-label=分类]")?.options.length>2');
 }
 await fs.writeFile(new URL(prefix+'-browser.json',reports),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
} finally {socket.close();await connection.end();}
