import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
// This script creates financial/task fixtures. Require explicit isolated QA endpoints.
const cdpOrigin = process.env.WB_BUGS_CDP_ORIGIN;
const webOrigin = process.env.WB_BUGS_WEB_ORIGIN;
const apiOrigin = process.env.WB_BUGS_API_ORIGIN;
if (!cdpOrigin || !webOrigin || !apiOrigin || !process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")) throw new Error("Explicit WB_BUGS_{CDP,WEB,API}_ORIGIN and disposable TEST_DATABASE_URL ending _test are required; never run against development data.");
const artifactDir = path.resolve("docs/reports/WB-PRODUCT-BUGS-1-5-evidence");
const today = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Shanghai", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
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
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return Date.now() - started; await sleep(80); } throw new Error(`Timed out: ${expression}`); }
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") { const response = await fetch(`${apiOrigin}/api${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`); return payload.data; }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(350); }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const size = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.deepEqual({ innerWidth: size.innerWidth, innerHeight: size.innerHeight }, { innerWidth: width, innerHeight: height }); if (size.scrollWidth > width) { const overflow = await evaluate(`(() => { const details = (selector) => { const node = document.querySelector(selector); const rect = node?.getBoundingClientRect(); return { selector, width: rect?.width, right: rect?.right, minWidth: node ? getComputedStyle(node).minWidth : null, columns: node ? getComputedStyle(node).gridTemplateColumns : null }; }; return { ancestors: ['.app-shell','.app-stage','.app-content','.today-grid','.today-quests','.today-quests > .glass-panel'].map(details), nodes: [...document.querySelectorAll('body *')].map((node) => ({ node: node.tagName + '.' + node.className, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width })).filter((item) => item.right > ${width} + 1 || item.left < -1).sort((a, b) => b.right - a.right).slice(0, 12) }; })()`); throw new Error(`horizontal overflow: ${size.scrollWidth} > ${width}: ${JSON.stringify(overflow)}`); } }
async function screenshot(name) { await evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})))"); await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))"); const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return file; }
async function clickByText(selector, text) { assert.equal(await evaluate(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.includes(${JSON.stringify(text)})); if (!node) return false; node.click(); return true; })()`), true, `missing ${text}`); }

async function click(text) { await clickByText('button', text); }
async function setValue(selector, value) { await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing field'); Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); })()`); }
const results = { environment: 'isolated real API + disposable MySQL, no request mocking', date: today, assertions: [], viewports: [] };
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.bringToFront');
  const owner = await api('/auth/register', {username:`bugs_${Date.now()}`, displayName:'整改验收', password:'product-bugs-qa-password'});
  const token = owner.token;
  await api('/onboarding/flows/core-loop/skip', {}, token);
  await api('/hero/daily-entry/claim', {businessDate:today}, token);
  const makeTask = (title) => api('/tasks', {operationId:crypto.randomUUID(), title, priority:2, difficulty:2, acceptDate:today, recordTimezone:'Asia/Shanghai'}, token);
  const star = await makeTask('星标持久化验收');
  const drag = await makeTask('拖拽进入重点验收');
  const done = await makeTask('刷新后仍可见的已完成事项');
  await api(`/tasks/${star.id}`, {expectedVersion:star.version, dueAt:`${today}T23:59`}, token, 'PUT');
  await navigate('/login', 'body');
  await evaluate(`localStorage.setItem('personal_workbench_token',${JSON.stringify(token)})`);
  await viewport(1440,900); await navigate(`/today?date=${today}`);
  await waitFor(`document.querySelectorAll('.task-row').length === 3`);
  await evaluate(`document.querySelector('.task-row [aria-label="设为今日重点"]').click()`);
  await waitFor(`document.querySelector('[data-focus-dropzone] .task-title')?.textContent === '星标持久化验收'`);
  await sleep(600);
  // Real pointer drag using the native HTML draggable grip.
  const points = await evaluate(`(() => { const source = [...document.querySelectorAll('.task-row')].find(n => n.textContent.includes('拖拽进入重点验收')).querySelector('.drag-handle'); const target = document.querySelector('[data-focus-dropzone]'); source.scrollIntoView({block:'center',behavior:'instant'}); const s=source.getBoundingClientRect(), t=target.getBoundingClientRect(); return {sx:s.x+2, sy:s.y+2, tx:t.x+t.width/2, ty:t.y+12}; })()`);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:points.sx,y:points.sy,button:'left',clickCount:1});
  await send('Input.setInterceptDrags',{enabled:true}); await evaluate(`window.__dragEvents=[]; for(const name of ['mousedown','dragstart','dragend']) document.addEventListener(name,e=>window.__dragEvents.push({name,target:e.target.className.baseVal ?? e.target.className}),{capture:true,once:true});`);
  let dragData;
  const dragEvent = new Promise(resolve => { const listener = (event) => { const msg=JSON.parse(event.data); if(msg.method==='Input.dragIntercepted'){socket.removeEventListener('message',listener); resolve(msg.params.data);} }; socket.addEventListener('message',listener); });
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.sx,y:points.sy});
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:points.sx,y:points.sy,button:'left',clickCount:1});
  await sleep(150);
  for(let step=1;step<=10;step++){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.sx+step*10,y:points.sy+step*5,button:'left',buttons:1});await sleep(80);}
  dragData = await Promise.race([dragEvent, sleep(3000).then(()=>{return evaluate('window.__dragEvents').then(events=>{throw new Error('native drag not intercepted: '+JSON.stringify(events));});})]);
  for (const type of ['dragEnter','dragOver','drop']) await send('Input.dispatchDragEvent',{type,x:points.tx,y:points.ty,data:dragData});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:points.tx,y:points.ty,button:'left',clickCount:1});
  await send('Input.setInterceptDrags',{enabled:false});
  await waitFor(`document.querySelectorAll('[data-focus-dropzone] .task-row').length === 2`);
  const assigned = await api(`/task-days?date=${today}`, undefined, token);
  assert.deepEqual(assigned.assignments.filter(a=>a.focusRank!==null).map(a=>a.taskId),[star.id,drag.id]);
  await navigate(`/today?date=${today}`);
  await waitFor(`document.querySelectorAll('[data-focus-dropzone] .task-row').length === 2`);
  results.assertions.push('Native pointer drag + star persist to canonical daily focus; remount retains both');
  await navigate(`/tasks/${star.id}?date=${today}`);
  await waitFor(`document.body.textContent.includes('固定倒计时到主页')`); await click('固定倒计时到主页');
  await waitFor(`document.body.textContent.includes('取消主页倒计时')`);
  await navigate(`/today?date=${today}`);
  await waitFor(`document.querySelector('.today-countdown')?.textContent.includes('星标持久化验收')`);
  assert.equal((await api('/tasks',undefined,token)).find(t=>t.id===star.id).pinned,1);
  results.assertions.push('Task detail pins deadline; Today countdown visible after refresh independently of daily focus');
  await navigate(`/tasks/${done.id}?date=${today}`); await click('直接完成');
  await waitFor(`document.querySelector('.ui-dialog') !== null`);
  // Completion confirmation owns the mutation; reward acknowledgement follows.
  await clickByText('.ui-dialog button','直接完成');
  await waitFor(`document.body.textContent.includes('已完成')`);
  await navigate(`/today?date=${today}`);
  await waitFor(`document.querySelector('[aria-label="当日完成记录"]')?.textContent.includes('刷新后仍可见的已完成事项')`);
  const day = await api(`/task-days?date=${today}`,undefined,token);
  await api('/task-days',{taskDate:today,taskIds:day.taskIds.filter(id=>id!==done.id),focusTaskIds:[star.id,drag.id]},token,'PUT');
  await navigate(`/today?date=${today}`);
  await waitFor(`document.querySelector('[aria-label="当日完成记录"]')?.textContent.includes('刷新后仍可见的已完成事项')`);
  results.assertions.push('UI completion → refresh → accepted-list replacement → refresh retains canonical completion event');
  for (let i=0;i<6;i++) await api('/schedules',{operationId:crypto.randomUUID(),scheduleDate:today,startTime:`${String(i+8).padStart(2,'0')}:00`,endTime:`${String(i+8).padStart(2,'0')}:30`,kind:1,title:`月历实际事项 ${i+1}`,recordTimezone:'Asia/Shanghai',includeInActualTime:true,completeTask:false},token);
  await api('/schedules',{scheduleDate:today,startTime:'20:00',endTime:'21:00',kind:0,title:'尚未执行的计划',recordTimezone:'Asia/Shanghai'},token);
  await api('/finance/initialize',{operationId:crypto.randomUUID()},token);
  const accounts = await api('/finance/accounts',undefined,token);
  const categories = await api('/finance/categories',undefined,token);
  const account=accounts[0] ?? await api('/finance/accounts',{operationId:crypto.randomUUID(),name:'验收账户',type:'BANK',openingDate:today,openingBalanceCents:'100000',includeInOverview:true},token); const category=categories.find(c=>c.kind==='EXPENSE');
  if(!account) throw new Error('initialize did not create account');
  await api('/finance/expenses',{operationId:crypto.randomUUID(),accountId:account.id,categoryId:category.id,amountCents:'8800',occurredDate:today,occurredTime:'23:59',note:'较晚发生但较早录入'},token);
  await navigate('/finance'); await click('记支出');
  await waitFor(`document.querySelector('input[aria-label="金额"]') !== null`);
  await setValue('input[aria-label="金额"]','158');
  await click('日期、时间与备注');
  await setValue('.finance-advanced input[maxlength="500"]','最后录入置顶验收');
  await click('保存支出');
  await waitFor(`document.querySelector('.feedback-modal-reward') !== null`);
  await sleep(500);
  const ack = await evaluate(`(() => {const b=[...document.querySelectorAll('.feedback-modal-reward button')].find(b=>b.textContent.trim()==='知道了');const r=b.getBoundingClientRect();return {text:document.querySelector('.feedback-modal-reward').textContent,width:r.width,height:r.height,whiteSpace:getComputedStyle(b.querySelector('.ui-button-visual') ?? b).whiteSpace};})()`);
  assert.ok(ack.width>=79.9 && ack.height>=43.9,JSON.stringify(ack)); assert.equal(ack.whiteSpace,'nowrap');
  await click('知道了');
  await navigate('/finance?tab=transactions');
  const transactions = await api('/finance/transactions',undefined,token);
  assert.equal(transactions.items[0].note,'最后录入置顶验收');
  await waitFor(`document.body.textContent.includes('最后录入置顶验收')`);
  results.assertions.push('Public expense form → credited reward acknowledgement → newest insertion first despite earlier occurrence');
  for (const [width,height] of [[1440,900],[1024,900],[375,812]]) {
    await viewport(width,height);
    await navigate(`/today?date=${today}`);
    await waitFor(`document.querySelector('[aria-label="当日完成记录"]') !== null`);
    await viewport(width,height);
    const todayShot=await screenshot(`today-${width}.png`);
    await navigate(`/calendar?view=month&date=${today}`);
    await waitFor(`document.querySelectorAll('.activity-day').length===42 && document.body.textContent.includes('月历实际事项 1')`);
    await viewport(width,height);
    assert.equal(await evaluate(`document.querySelectorAll('.activity-day.is-selected .activity-chip').length`),4);
    await clickByText('.activity-day.is-selected button','还有');
    assert.equal(await evaluate(`document.querySelectorAll('.activity-day-detail .activity-chip').length`),8);
    assert.equal(await evaluate(`document.querySelectorAll('.activity-day-detail .is-planned').length`),1);
    const monthShot=await screenshot(`month-${width}.png`);
    await evaluate(`document.querySelector('.activity-day-detail').scrollIntoView({block:'start',behavior:'instant'})`);
    await sleep(200);
    const detailShot=await screenshot(`month-detail-${width}.png`);
    await navigate('/library'); await click('添加作品');
    await waitFor(`document.querySelector('.library-create-dialog') !== null`);
    const fields=await evaluate(`(() => {const dialog=document.querySelector('.library-create-dialog');const r=dialog.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,expectedRadius:parseFloat(getComputedStyle(document.documentElement).fontSize)*0.75,fields:[...dialog.querySelectorAll('input,select,textarea')].map(el=>({type:el.tagName,radius:getComputedStyle(el).borderRadius,height:el.getBoundingClientRect().height,label:el.getAttribute('aria-label')}))};})()`);
    assert.ok(fields.left>=0 && fields.right<=width);
    assert.ok(fields.fields.length>=8 && fields.fields.every(f=>parseFloat(f.radius)===fields.expectedRadius));
    assert.ok(fields.fields.find(f=>f.type==='TEXTAREA').height>=90);
    await setValue('.library-create-dialog input[name=title]','样式验收作品');
    const formShot=await screenshot(`library-form-${width}.png`);
    const adjacentForms=[];
    for(const [route,openText,selector,name] of [['/today','新增','.task-create-modal','task'],['/finance','记支出','.finance-expense-form','wallet'],['/today',null,'.quick-note-capture-dialog','writing']]){
      await navigate(route);
      if(openText) await click(openText); else await evaluate(`document.querySelector('.app-topbar button[aria-label="随手记"]').click()`);
      const dialogSelector=name==='wallet'?'.ui-dialog':selector;
      await waitFor(`document.querySelector(${JSON.stringify(dialogSelector)}) !== null`);
      const geometry=await evaluate(`(() => {const d=document.querySelector(${JSON.stringify(dialogSelector)});const r=d.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,fields:[...d.querySelectorAll('input:not([type=checkbox]):not([type=radio]),select,textarea')].map(el=>({tag:el.tagName,height:el.getBoundingClientRect().height,radius:parseFloat(getComputedStyle(el).borderRadius)}))};})()`);
      assert.ok(geometry.left>=0 && geometry.right<=width && geometry.height<=height);
      assert.ok(geometry.fields.length>0 && geometry.fields.every(f=>f.radius<Math.max(f.height,1)/2),JSON.stringify({name,geometry}));
      const shot=await screenshot(`${name}-form-${width}.png`);adjacentForms.push({name,geometry,shot});
    }
    results.viewports.push({width,height,scrollWidth:width,fields,todayShot,monthShot,detailShot,formShot,adjacentForms});
  }
  results.assertions.push('42-cell monthly calendar shows real execution/completion records, distinguishes plans, expands overflow with full titles');
  results.assertions.push('375/1024/1440 CSS viewports: no page overflow, consistent 0.75rem input/select/textarea shape');
  await fs.writeFile(path.join(artifactDir,'browser.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({result:'PASS',assertions:results.assertions,viewports:results.viewports.map(v=>v.width)},null,2));
} finally { socket.close(); }
