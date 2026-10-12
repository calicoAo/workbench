import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Require isolated TEST_DATABASE_URL ending in _test');
const apiOrigin=process.env.GROWTH_G4_API_ORIGIN ?? 'http://127.0.0.1:3000';
const webOrigin=process.env.GROWTH_G4_WEB_ORIGIN ?? 'http://127.0.0.1:5185';
const cdpOrigin=process.env.GROWTH_G4_CDP_ORIGIN ?? 'http://127.0.0.1:9335';
const reports=new URL('../docs/reports/',import.meta.url);
const prefix='WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G4';
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
  assert.ok(metrics.scrollWidth <= metrics.width, "horizontal page overflow");
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(new URL(`${prefix}-${suffix}.png`, reports), Buffer.from(image.data, "base64")); return metrics;
}
async function captureSurface(name, selector, width) {
 await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'});window.scrollBy(0,-document.querySelector('.app-topbar').getBoundingClientRect().height-12)`);
 const metrics=await screenshot(name+'-'+width);
 if(name==='radar'){
  const labels=await evaluate(`(()=>{const svg=document.querySelector('.growth-radar'),box=svg.getBoundingClientRect();return [...svg.querySelectorAll('text')].map(n=>{const r=n.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom})})()`);assert.ok(labels.every(Boolean),'Radar axis labels not clipped');
  const textFits=await evaluate(`[...document.querySelectorAll('.growth-distribution-legend li')].every(n=>n.scrollWidth<=n.clientWidth)`);assert.ok(textFits,'Long dimension names and values fit legend');
 }

 const controls=await evaluate(`(()=>{const root=document.querySelector(${JSON.stringify(selector)});return [...root.querySelectorAll('button,input,select,summary,a.ui-button')].filter(n=>!n.disabled).map(n=>{const r=n.getBoundingClientRect();return{label:n.getAttribute('aria-label')||n.textContent.trim(),width:r.width,height:r.height,left:r.left,right:r.right}})})()`);
 assert.ok(controls.every(n=>n.left>=0&&n.right<=width),'controls fit viewport: '+name);
 if(width===375)assert.ok(controls.every(n=>n.height>=44),'mobile targets: '+JSON.stringify(controls));
 evidence.surfaces.push({name,...metrics,controls});
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
const evidence={result:'INCOMPLETE',fixtures:{},layouts:[],journeys:[],surfaces:[],checks:[]};
async function navigate(path){await send('Page.navigate',{url:webOrigin+path});await waitFor('document.querySelector(".growth-route") && !document.querySelector(".growth-route [role=status]") && document.querySelector(".growth-subnav")');}
async function historyMove(delta){await evaluate(`history.go(${delta})`);await sleep(150);}
async function waitHeading(text){await waitFor(`[...document.querySelectorAll('.growth-route h2,.growth-route h3,.growth-route h4')].some(n=>n.textContent===${JSON.stringify(text)})`);}
async function publicWork(categoryId,title,minutes,note) {
 const t=await api('/tasks',{operationId:crypto.randomUUID(),title,categoryId,acceptDate:evidence.date,recordTimezone:evidence.timezone});
 let task=(await api('/tasks/'+t.id)).task;
 const started=await api('/timer-sessions/start',{operationId:crypto.randomUUID(),taskId:t.id,expectedTaskVersion:task.version,taskDate:evidence.date,recordTimezone:evidence.timezone});
 let current=await api('/timer-sessions/current');await sleep(1100);
 if(minutes.length>1){await api(`/timer-sessions/${started.sessionId}/pause`,{operationId:crypto.randomUUID(),expectedVersion:current.version},'PUT');current=await api('/timer-sessions/current');await api(`/timer-sessions/${started.sessionId}/resume`,{operationId:crypto.randomUUID(),expectedVersion:current.version},'PUT');current=await api('/timer-sessions/current');await sleep(1100);}
 task=(await api('/tasks/'+t.id)).task;
 await api(`/timer-sessions/${started.sessionId}/finish`,{operationId:crypto.randomUUID(),expectedVersion:current.version,completeTask:true,expectedTaskVersion:task.version,note:note??'',completionNote:'Task completion reflection '+categoryId},'PUT');
 // Deterministic elapsed-time fixture only: lifecycle/identity/note/completion facts were written through authenticated commands.
 const [segments]=await connection.query('SELECT id FROM timer_segments WHERE user_id=? AND timer_session_id=? ORDER BY id',[evidence.userId,started.sessionId]);assert.equal(segments.length,minutes.length);
 let start=Date.parse(evidence.date+'T01:00:00Z');
 const sqlTime=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
 for(let i=0;i<segments.length;i++){const end=start+minutes[i]*60000;await connection.query('UPDATE timer_segments SET started_at=?,ended_at=?,business_date=? WHERE id=? AND user_id=?',[sqlTime(start),sqlTime(end),evidence.date,segments[i].id,evidence.userId]);start=end+10*60000;}
 await connection.query('UPDATE timer_sessions SET start_time=?,end_time=?,duration_minutes=? WHERE id=? AND user_id=?',[evidence.date+' 01:00:00',sqlTime(start-10*60000),minutes.reduce((a,b)=>a+b,0),started.sessionId,evidence.userId]);
 return {taskId:t.id,sessionId:started.sessionId,segmentIds:segments.map(s=>s.id)};
}
async function assertMetrics(categoryId,where='.growth-category-detail > .growth-contribution-metrics') {
 const [work]=await connection.query('SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND,started_at,ended_at)),0) seconds,COUNT(*) segments FROM timer_segments WHERE user_id=? AND category_id_at_occurrence=? AND status=1 AND deleted_at IS NULL',[evidence.userId,categoryId]);
 const [events]=await connection.query('SELECT COUNT(*) events FROM task_completion_events WHERE user_id=? AND category_id_at_occurrence=?',[evidence.userId,categoryId]);
 const seconds=Number(work[0].seconds),values=[`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m ${seconds%60}s`,String(events[0].events),String(work[0].segments)];
 await waitFor(`document.querySelector(${JSON.stringify(where)})?.textContent.includes(${JSON.stringify(values[0])})`);
 const displayed=await evaluate(`[...document.querySelector(${JSON.stringify(where)}).querySelectorAll('dd')].map(n=>n.textContent)`);assert.deepEqual(displayed,values);return {categoryId,seconds,events:events[0].events,segments:work[0].segments,displayed};
}
async function layout() {
 await evaluate('document.querySelector(".growth-category-detail > nav").scrollIntoView({block:"end"})');await sleep(150);
 const result=await evaluate(`(()=>{const root=document.querySelector('.growth-route');const controls=[...root.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).map(b=>{const r=b.getBoundingClientRect();return{label:b.textContent.trim(),left:r.left,right:r.right,height:r.height}});const footer=root.querySelector('.growth-category-detail > nav').getBoundingClientRect();const bottom=document.querySelector('.mobile-bottom-nav,.mobile-nav')?.getBoundingClientRect();return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,controls,footerBottom:footer.bottom,bottomNavTop:bottom?.height?bottom.top:innerHeight,focus:document.activeElement?.getAttribute('aria-label')}})()`);
 assert.ok(result.scrollWidth<=result.width);assert.ok(result.controls.every(c=>c.left>=0&&c.right<=result.width),JSON.stringify(result));assert.ok(result.footerBottom<=result.bottomNavTop,JSON.stringify(result));if(result.width===375)assert.ok(result.controls.every(c=>c.height>=44),JSON.stringify(result));return result;
}async function saveMapping(label) {
 const selector='button[aria-label='+JSON.stringify(label)+']';
 await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});document.querySelector(${JSON.stringify(selector)}).focus()`);
 assert.ok(await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();return !b.disabled&&b.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))})()`),'Save action clear of fixed UI');
 await key('Enter');await waitFor('document.querySelector(".feedback-modal")');
 assert.ok(await evaluate('document.querySelector(".feedback-modal").textContent.includes("分类映射已保存")'));
 await clickText('收下');await waitFor('!document.querySelector(".feedback-modal")');
}
async function factsSnapshot() {
 const result={};for(const table of ['tasks','timer_segments','timer_sessions','schedules','task_completion_events','reward_events','user_growth'])result[table]=(await connection.query(`SELECT * FROM ${table} WHERE user_id=? ORDER BY ${table==='user_growth'?'user_id':'id'}`,[evidence.userId]))[0];return result;
}
try {
 const registered=await api('/auth/register',{username:'growth_g4_qa_'+Date.now(),password:'GrowthQA-only-2026',displayName:'Growth G4 QA'});token=registered.token;evidence.userId=registered.user.id;evidence.timezone=registered.user.timezone;
 await api('/onboarding/flows/core-loop/skip',{});evidence.date=(await api('/growth/overview')).period.to;
 const x=await api('/growth/dimensions',{name:'源维度 · 工程',color:'#7C8CFF',sortOrder:74});
 const y=await api('/growth/dimensions',{name:'目标自定义维度',color:'#78D9D0',sortOrder:75});
 const yName='目标自定义维度 · 工程实践与持续学习（已重命名）';
 await api('/growth/dimensions/'+y.id,{expectedVersion:y.version,name:yName},'PUT');
 const a=await api('/task-categories',{name:'Agent Engineering A',color:'#5B8DEF',dimensionKey:x.dimensionKey,targetMinutes:12345,icon:'original-icon'});
 const b=await api('/task-categories',{name:'Guide Study B',color:'#B28DFF',dimensionKey:x.dimensionKey});
 const c=await api('/task-categories',{name:'Unmapped C',color:'#64748B',dimensionKey:null});
 const aWork=await publicWork(a.id,'Agent Core 多段执行与分类贡献来源 '+ '长任务名称 '.repeat(7),[5,10],'本次执行的唯一会话备注');
 const bWork=await publicWork(b.id,'Guide Study',[13],null),cWork=await publicWork(c.id,'Unmapped work',[6],null);
 evidence.fixtures={x,y,a,b,c,aWork,bWork,cWork,preparation:'Authenticated commands; SQL retimes disposable positive elapsed-time fixtures only.'};
 const before=await api(`/growth/overview?period=30&to=${evidence.date}`);const factsBefore=await factsSnapshot();
 const metadata=()=>connection.query('SELECT id,user_id,name,color,icon,target_minutes,sort_order,enabled FROM task_categories WHERE id=?',[a.id]).then(([rows])=>rows);
 const metadataBefore=await metadata();
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Page.navigate',{url:webOrigin});await waitFor('document.readyState==="complete"');await evaluate('localStorage.setItem("personal_workbench_token",'+JSON.stringify(token)+');localStorage.setItem("workbench:locale","zh-CN")');
 for(const [width,height] of [[1440,1000],[375,812]]) {
  // Establish a fresh source mapping for each independent viewport journey.
  await api('/task-categories/'+a.id,{dimensionKey:x.dimensionKey},'PUT');
  await viewport(width,height);
  const configUrl=`/growth?date=${evidence.date}&view=config&config=mapping`;
  await navigate(configUrl);await waitHeading('分类映射');await waitFor('document.querySelector(".category-mapping-row")');
  const field='[aria-label="Agent Engineering A成长维度"]';
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(field)}).value`),x.dimensionKey);
  await captureSurface('mapping-before','.growth-configuration',width);
  await setField(field,y.dimensionKey);
  assert.equal((await api('/task-categories?includeDisabled=true')).find(cat=>cat.id===a.id).dimensionKey,x.dimensionKey,'selection alone never writes');
  await saveMapping('保存Agent Engineering A映射');
  await waitFor('document.querySelector(".category-mapping-row [role=status]")');
  assert.equal(await evaluate('new URLSearchParams(location.search).get("config")'),'mapping');
  assert.equal((await api('/task-categories?includeDisabled=true')).find(cat=>cat.id===a.id).dimensionKey,y.dimensionKey);
  await captureSurface('mapping-saved','.growth-configuration',width);
  await clickText('总览');await waitHeading('分类贡献');
  const expand=`[...document.querySelectorAll('.growth-dimension-breakdown button')].find(b=>b.textContent.trim()===${JSON.stringify(yName)})`;
  await evaluate(`${expand}.scrollIntoView({block:'center'});${expand}.focus()`);await key('Enter');await waitFor(`${expand}.getAttribute('aria-expanded')==='true'`);
  await captureSurface('mapped-dimension','.growth-dimension-breakdown > article:last-child',width);
  await clickLabel('查看分类：Agent Engineering A');await waitHeading('贡献任务');
  assert.ok(await evaluate('document.querySelector(".growth-detail-heading").textContent.includes('+JSON.stringify(yName)+')'));
  const values=await assertMetrics(a.id);await captureSurface('category','.growth-category-detail',width);
  const taskButton='document.querySelector(".growth-task-contribution button")';await evaluate(`${taskButton}.scrollIntoView({block:'center'});${taskButton}.focus()`);await key('Enter');await waitHeading('执行记录');
  assert.equal(await evaluate('document.querySelectorAll(".growth-execution-record").length'),2);
  assert.equal(await evaluate('document.querySelectorAll(".growth-session-history aside").length'),1);
  await captureSurface('history','.growth-task-history',width);evidence.layouts.push(await layout());
  await historyMove(-1);await waitHeading('贡献任务');await historyMove(1);await waitHeading('执行记录');
  await navigate(configUrl);await waitHeading('分类映射');await waitFor('document.querySelector(".category-mapping-row")');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(field)}).value`),y.dimensionKey);
  await send('Page.reload');await waitHeading('分类映射');await waitFor('document.querySelector(".category-mapping-row")');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(field)}).value`),y.dimensionKey);
  const mapped=await api(`/growth/overview?period=30&to=${evidence.date}`);
  assert.equal(mapped.dimensions.find(d=>d.dimensionKey===x.dimensionKey).actualSeconds,780);assert.equal(mapped.dimensions.find(d=>d.dimensionKey===y.dimensionKey).actualSeconds,900);
  assert.deepEqual(mapped.hero,before.hero);assert.deepEqual(await factsSnapshot(),factsBefore);assert.deepEqual(await metadata(),metadataBefore);
  await setField(field,'');await saveMapping('保存Agent Engineering A映射');await waitFor(`document.querySelector(${JSON.stringify(field)}).value===''`);
  await captureSurface('mapping-cleared','.growth-configuration',width);
  const cleared=await api(`/growth/overview?period=30&to=${evidence.date}`);assert.equal(cleared.categoryBreakdown.find(c=>c.categoryId===a.id).resolvedDimensionKey,null);assert.equal(cleared.unmapped.actualSeconds,1260);
  assert.deepEqual(await factsSnapshot(),factsBefore);assert.deepEqual(await metadata(),metadataBefore);
  evidence.journeys.push({width,height,mappingSave:'PASS',customRenamedDimension:'PASS',explicitSaveOnly:'PASS',feedback:'PASS',overviewGrouping:{sourceSeconds:780,targetSeconds:900},categoryMetrics:values,taskSegmentIdentity:'PASS',clearMapping:'PASS',directUrlRefresh:'PASS',backForward:'PASS',keyboard:'PASS',fixedUiClearance:'PASS',metadataAndFactsUnchanged:'PASS',xpUnchanged:'PASS'});
 }
 evidence.result='PASS';evidence.checks=['Categories canonical partial PUT via actual mapping form','Explicit Save and feedback','Configured custom/renamed Dimension','Current historical grouping reconciles','Category metadata and source facts unchanged','Clear null mapping','1440/375 CSS viewport and 44px controls','Keyboard Enter save and drilldown','URL direct/reload/Back/Forward','No horizontal overflow; fixed UI clearance'];
 await fs.writeFile(new URL(prefix+'-browser.json',reports),JSON.stringify(evidence,null,2));console.log(JSON.stringify({result:evidence.result,journeys:evidence.journeys,surfaces:evidence.surfaces.length},null,2));
} finally {socket.close();await connection.end();}
