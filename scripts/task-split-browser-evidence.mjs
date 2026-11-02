import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const web='http://localhost:5188',apiOrigin='http://127.0.0.1:3000',cdp='http://127.0.0.1:9338';
if(!process.env.TEST_DATABASE_URL?.endsWith('_test'))throw Error('Disposable QA database required');
const dir='.qa-private/browser';await fs.mkdir(dir,{recursive:true});
const pages=await fetch(cdp+'/json/list').then(r=>r.json());const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
let id=0;const jobs=new Map();ws.addEventListener('message',event=>{const m=JSON.parse(event.data),job=jobs.get(m.id);if(!job)return;jobs.delete(m.id);clearTimeout(job.timer);m.error?job.j(new Error(m.error.message)):job.r(m.result);});
const send=(method,params={})=>new Promise((r,j)=>{const i=++id;const timer=setTimeout(()=>{jobs.delete(i);j(Error(method+' timeout'));},20000);jobs.set(i,{r,j,timer});ws.send(JSON.stringify({id:i,method,params}));});
const ev=async expression=>{const v=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(v.exceptionDetails)throw Error(JSON.stringify(v.exceptionDetails));return v.result.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression,ms=30000){const start=Date.now();while(Date.now()-start<ms){if(await ev(`Boolean(${expression})`))return;await pause(100);}throw Error('Timed out '+expression+'\n'+await ev('document.body.innerText'));}
async function click(text){await wait(`[...document.querySelectorAll('button')].some(b=>!b.disabled&&!b.closest('[hidden]')&&b.textContent.trim()===${JSON.stringify(text)})`);assert.equal(await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&!b.closest('[hidden]')&&b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true;})()`),true,'Missing button '+text);await pause(120);}
async function set(selector,value){await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
async function api(path,body,token,method=body?'POST':'GET'){const r=await fetch(apiOrigin+'/api'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw Error(path+JSON.stringify(j));return j.data;}
async function nav(path){await send('Page.navigate',{url:web+path});await pause(350);await wait("document.readyState==='complete'&&document.querySelector('.app-shell')");await pause(350);}
async function screen(name){const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(`${dir}/${name}.png`,Buffer.from(s.data,'base64'));}
async function viewport(width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});assert.equal(await ev('innerWidth'),width);assert.equal(await ev('innerHeight'),height);}
const results=JSON.parse(await fs.readFile(`${dir}/results.json`,'utf8'));
try {
 const session=JSON.parse(await fs.readFile(`${dir}/session.json`,'utf8'));
 const settings=await api('/ai/settings',undefined,session.token);await api('/ai/settings',{expectedVersion:settings.version,enabled:true,allowTasks:true},session.token,'PUT');
 await viewport(1280,900);await nav('/tasks');await click('发布悬赏');await click('AI 整理任务 / 恢复草稿');await wait("document.querySelector('.split-workflow textarea')");
 const existing=await ev(`JSON.parse(localStorage.getItem('wb.task-split.v1:'+${session.userId})||'null')`);
 if(!existing?.candidates?.length){
 await set('.split-workflow>label textarea','为个人网站修复登录问题，预计30分钟；整理桌面。');await send('Page.reload');await pause(700);await wait("document.querySelector('.bounty-board')");await click('发布悬赏');await click('AI 整理任务 / 恢复草稿');await wait("document.querySelector('.split-workflow textarea')");
 await click('生成可审核草稿');await wait("document.querySelectorAll('.split-candidate').length===2",45000);
 }
 results.push('Real DeepSeek Responses through public Tasks UI, two reviewable drafts');
 await set('.split-candidate input[maxlength="200"]','浏览器审核后的登录修复');await send('Page.reload');await pause(700);await wait("document.querySelector('.bounty-board')");await click('发布悬赏');await click('AI 整理任务 / 恢复草稿');await wait("document.querySelectorAll('.split-candidate').length===2");assert.equal(await ev(`document.querySelector('.split-candidate input[maxlength="200"]').value`),'浏览器审核后的登录修复');
 await click('查询本次生成结果');assert.equal(await ev(`document.querySelector('.split-candidate input[maxlength="200"]').value`),'浏览器审核后的登录修复');results.push('Refresh restores edited candidates; status GET does not overwrite edits');
 await viewport(390,844);assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));await screen('task-drafts-mobile');results.push('390x844 task editor and evidence fit viewport');
 await ev("window.confirm=()=>true;window.__publishCalls=0;window.__originalFetch=window.fetch;window.fetch=async(...args)=>{const [url,init]=args;if(String(url)==='/api/tasks'&&init?.method==='POST'){window.__publishCalls++;if(window.__publishCalls===1){await window.__originalFetch(...args);throw new TypeError('QA simulated lost acknowledgment after real commit');}}return window.__originalFetch(...args);}");
 await click('确认发布所选 / 重试待定项');await wait("[...document.querySelectorAll('.split-candidate a')].filter(a=>a.textContent.includes('已发布')).length===1");await wait("document.querySelector('.split-candidate [role=alert]')");
 const stored=await ev(`JSON.parse(localStorage.getItem('wb.task-split.v1:'+${session.userId}))`);const pending=stored.candidates.find(c=>!c.publishedId);assert.ok(pending.frozen.operationId);const originalId=pending.publishOperationId;
 await send('Page.reload');await pause(700);await wait("document.querySelector('.bounty-board')");await click('发布悬赏');await click('AI 整理任务 / 恢复草稿');await wait("document.querySelectorAll('.split-candidate').length===2");await ev('window.confirm=()=>true');await click('确认发布所选 / 重试待定项');await wait("[...document.querySelectorAll('.split-candidate a')].filter(a=>a.textContent.includes('已发布')).length===2");
 const recovered=await ev(`JSON.parse(localStorage.getItem('wb.task-split.v1:'+${session.userId}))`);assert.equal(recovered.candidates.find(c=>c.publishOperationId===originalId).publishedId>0,true);
 const tasks=await api('/tasks',undefined,session.token);assert.equal(tasks.filter(t=>t.title==='浏览器审核后的登录修复').length,1);results.push('Lost acknowledgment + partial completion + refresh + receipt recovery create each task once');await screen('task-published-mobile');
 const op=recovered.generation.operationId;const generation=await api('/tasks/split/preview/'+op,undefined,session.token);const ledgerFile='.qa-private/deepseek-test-budget.json';const ledger=JSON.parse(await fs.readFile(ledgerFile,'utf8'));const entry=ledger.calls.find(e=>e.id==='browser-task-split');const cost=(generation.usage.inputTokens*2+generation.usage.outputTokens*8)/1e6;ledger.spentUpperRmb-=entry.reservedRmb-cost;entry.status='RECEIVED';entry.usage=generation.usage;entry.costUpperRmb=cost;await fs.writeFile(ledgerFile,JSON.stringify(ledger,null,2));
 await fs.writeFile(`${dir}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({results,budgetUpperRmb:ledger.spentUpperRmb}));
}finally{ws.close();}
