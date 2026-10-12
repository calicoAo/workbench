import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Require isolated TEST_DATABASE_URL ending in _test');
const apiOrigin=process.env.GROWTH_G3_API_ORIGIN ?? 'http://127.0.0.1:3000';
const webOrigin=process.env.GROWTH_G3_WEB_ORIGIN ?? 'http://127.0.0.1:5185';
const cdpOrigin=process.env.GROWTH_G3_CDP_ORIGIN ?? 'http://127.0.0.1:9335';
const reports=new URL('../docs/reports/',import.meta.url);
const prefix='WB-PRODUCT-CLOSURE-02-GROWTH-INSIGHTS-G3';
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
}
try {
 const registered=await api('/auth/register',{username:'growth_g3_qa_'+Date.now(),password:'GrowthQA-only-2026',displayName:'Growth G3 QA'});token=registered.token;evidence.userId=registered.user.id;evidence.timezone=registered.user.timezone;
 await api('/onboarding/flows/core-loop/skip',{});
 const initial=await api('/growth/overview');evidence.date=initial.period.to;
 const dimension=await api('/growth/dimensions',{name:'知识与工程 · 系统设计、持续学习与复杂问题解决（自定义长名称）',color:'#5B8DEF',sortOrder:75});
 const a=await api('/task-categories',{name:'Agent Engineering A',color:'#5B8DEF',dimensionKey:dimension.dimensionKey});
 const b=await api('/task-categories',{name:'Guide Study B',color:'#B28DFF',dimensionKey:dimension.dimensionKey});
 const c=await api('/task-categories',{name:'Unmapped C',color:'#64748B',dimensionKey:null});
 const aWork=await publicWork(a.id,'Agent Core 多段执行与分类贡献来源 '+ '长任务名称 '.repeat(7),[5,10],'本次执行已完成读取链路，继续查看分类与会话。');
 const bWork=await publicWork(b.id,'Guide Study',[13],null);
 const cWork=await publicWork(c.id,'Unmapped work',[6],'无维度映射的执行记录');
 evidence.fixtures={dimension,a,b,c,aWork,bWork,cWork,preparation:'Authenticated publish/start/pause/resume/finish+complete; SQL adjusts only disposable elapsed-time fixtures.'};
 const overview=await api(`/growth/overview?period=30&to=${evidence.date}`);
 assert.equal(overview.dimensions.find(d=>d.dimensionKey===dimension.dimensionKey).actualSeconds,1680);assert.equal(overview.categoryBreakdown.find(d=>d.categoryId===a.id).closedSegmentCount,2);
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Page.navigate',{url:webOrigin});await waitFor('document.readyState==="complete"');await evaluate('localStorage.setItem("personal_workbench_token",'+JSON.stringify(token)+');localStorage.setItem("workbench:locale","zh-CN")');
 for(const [width,height] of [[1440,1000],[375,812]]){
  await viewport(width,height);await navigate(`/growth?date=${evidence.date}`);await waitHeading('分类贡献');await evaluate('window.scrollTo(0,0)');await screenshot('overview-'+width);await captureSurface('radar','.growth-distribution',width);
  const expand=`[...document.querySelectorAll('.growth-dimension-breakdown button')].find(b=>b.textContent.trim()==='知识与工程 · 系统设计、持续学习与复杂问题解决（自定义长名称）')`;
  await evaluate(`${expand}.focus()`);await key('Enter');await waitFor(`${expand}.getAttribute('aria-expanded')==='true'`);
  assert.ok(await evaluate(`Boolean(document.querySelector('button[aria-label="查看分类：Agent Engineering A"]'))`));
  await captureSurface('expanded-dimension','.growth-dimension-breakdown > article:last-child',width);
  const dimensionUrl=await evaluate('location.pathname+location.search');
  await clickLabel('查看分类：Agent Engineering A');await waitHeading('贡献任务');await captureSurface('category','.growth-category-detail',width);const categoryMetrics=await assertMetrics(a.id);const categoryUrl=await evaluate('location.pathname+location.search');
  const taskButton=`[...document.querySelectorAll('.growth-task-contribution button')][0]`;await evaluate(`${taskButton}.scrollIntoView({block:'center'});${taskButton}.focus()`);await sleep(100);
  assert.ok(await evaluate(`(()=>{const b=${taskButton},r=b.getBoundingClientRect(),top=document.querySelector('.app-topbar').getBoundingClientRect().bottom,bottom=document.querySelector('.mobile-nav').getBoundingClientRect();const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;return r.top>=top&&r.bottom<=(bottom.height?bottom.top:innerHeight)&&b.contains(document.elementFromPoint(x,y))})()`),'Task contribution control is visible and not covered by fixed UI');await key('Enter');await waitHeading('执行记录');
  assert.equal(await evaluate('document.querySelectorAll(".growth-execution-record").length'),2);
  assert.equal(await evaluate('document.querySelectorAll(".growth-session-history aside").length'),1);
  assert.ok(await evaluate('document.querySelector(".growth-task-history").textContent.includes("任务完成反思（当前）")'));
  await assertMetrics(a.id,'.growth-task-history > .growth-contribution-metrics');
  const [eventRows]=await connection.query("SELECT DATE_FORMAT(occurred_at,'%Y-%m-%dT%H:%i:%s.000Z') occurredAt FROM task_completion_events WHERE user_id=? AND task_id=?",[evidence.userId,aWork.taskId]);
  const fullDetail=await api(`/growth/categories/category:${a.id}?period=30&to=${evidence.date}&taskRef=task:${aWork.taskId}`);assert.equal(fullDetail.completions[0].occurredAt,eventRows[0].occurredAt);
  const expectedEventTime=new Intl.DateTimeFormat('sv-SE',{timeZone:evidence.timezone,dateStyle:'short',timeStyle:'medium'}).format(new Date(eventRows[0].occurredAt));assert.ok(await evaluate('document.querySelector(".growth-task-history").textContent.includes('+JSON.stringify(expectedEventTime)+')'));
  const taskUrl=await evaluate('location.pathname+location.search');evidence.layouts.push(await layout());await captureSurface('history','.growth-task-history',width);await captureSurface('segments','.growth-session-history',width);
  await historyMove(-1);await waitHeading('贡献任务');assert.equal(await evaluate('location.pathname+location.search'),categoryUrl);
  await historyMove(1);await waitHeading('执行记录');assert.equal(await evaluate('location.pathname+location.search'),taskUrl);
  await clickText('返回分类');await waitHeading('贡献任务');await clickText('返回成长');await waitHeading('分类贡献');assert.equal(await evaluate('location.pathname+location.search'),dimensionUrl);assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'成长内容');
  await clickText('全部分类');await waitFor('document.querySelector(".growth-category-list")');await captureSurface('all-categories','.growth-all-categories',width);await clickLabel('查看分类：Unmapped C');await waitHeading('贡献任务');const unmapped=await assertMetrics(c.id);assert.ok(await evaluate('document.querySelector(".growth-category-detail").textContent.includes("未映射能力维度")'));
  await clickText('7 天');await waitFor('new URLSearchParams(location.search).get("period")==="7"');await waitFor('[...document.querySelectorAll(".growth-detail-heading p")].some(p=>p.textContent.includes('+JSON.stringify(evidence.date)+'))');await assertMetrics(c.id);
  // AppShell date input retains section/period/category instead of erasing the drilldown URL.
  const previous=new Date(evidence.date+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);const priorDate=previous.toISOString().slice(0,10);
  await setField('[aria-label="工作日期"]',priorDate);await waitFor('new URLSearchParams(location.search).get("date")==='+JSON.stringify(priorDate));await waitHeading('贡献任务');assert.equal(await evaluate('new URLSearchParams(location.search).get("category")'),'category:'+c.id);assert.equal(await evaluate('new URLSearchParams(location.search).get("period")'),'7');await waitFor('document.querySelector(".growth-category-detail > .growth-contribution-metrics dd").textContent==="0h 0m 0s"');
  await historyMove(-1);await waitHeading('贡献任务');await assertMetrics(c.id);
  const direct=`/growth?date=${evidence.date}&view=categories&period=7&category=category%3A${a.id}&task=task%3A${aWork.taskId}`;
  await navigate(direct);await waitHeading('执行记录');await assertMetrics(a.id);await send('Page.reload');await waitHeading('执行记录');await assertMetrics(a.id);evidence.layouts.push(await layout());await screenshot('direct-'+width);
  await clickText('配置');await waitHeading('成长维度');await captureSurface('configuration','.growth-configuration',width);await captureSurface('configuration-long-name','.growth-dimension-settings article:last-child',width);
  const configActions=await evaluate(`(()=>{const row=document.querySelector('.growth-dimension-settings article:last-child');row.scrollIntoView({block:'center'});return [...row.querySelectorAll('button')].filter(b=>!b.disabled).map(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return{label:b.getAttribute('aria-label')||b.textContent.trim(),clear:b.contains(hit)}})})()`);assert.ok(configActions.every(b=>b.clear),'Configuration actions not covered by FAB/nav: '+JSON.stringify(configActions));
  await clickText('分类映射');await waitHeading('分类映射');await captureSurface('mapping','.growth-configuration',width);
  evidence.journeys.push({width,height,categoryMetrics,unmapped,keyboard:'PASS',multiSegment:'PASS',sessionNoteOnce:'PASS',completionNoteSeparate:'PASS',backForward:'PASS',directAndRefresh:'PASS',periodAndDate:'PASS'});
 }
 await viewport(900,900);await navigate(`/growth?date=${evidence.date}`);await waitHeading('分类贡献');await captureSurface('radar','.growth-distribution',900);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate(`getComputedStyle(document.querySelector('.growth-period button')).transitionDuration`),'0s');evidence.checks.push('Reduced motion preference respected');
 evidence.result='PASS';evidence.checks.push('Exact SQL metrics versus public Growth UI','1440 and 375 CSS viewport','All Categories + unmapped','Keyboard Enter expansion/navigation','Full Task/Session/Segment history','URL Back/Forward, direct link, reload','AppShell date retains Growth context','No horizontal overflow or bottom navigation overlap');
 await fs.writeFile(new URL(prefix+'-browser.json',reports),JSON.stringify(evidence,null,2));console.log(JSON.stringify({result:evidence.result,journeys:evidence.journeys,surfaces:evidence.surfaces.length,checks:evidence.checks},null,2));
} finally {socket.close();await connection.end();}
