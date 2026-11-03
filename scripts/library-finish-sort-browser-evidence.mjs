import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const web='http://localhost:5188',apiOrigin='http://127.0.0.1:3000',cdp='http://127.0.0.1:9338';
if(!process.env.TEST_DATABASE_URL?.endsWith('_test'))throw Error('Disposable QA database required');
const dir='docs/reports/WB-LIBRARY-FINISH-SORT-2026-11-03-evidence';await fs.mkdir(dir,{recursive:true});
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
async function screen(name){await ev("Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))");const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(`${dir}/${name}.png`,Buffer.from(s.data,'base64'));}
async function viewport(width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});assert.equal(await ev('innerWidth'),width);assert.equal(await ev('innerHeight'),height);}
const results={assertions:[],viewports:[]};
try {
 const owner=await api('/auth/register',{username:'finishsort_'+Date.now(),displayName:'完成日期验收',password:'isolated-library-sort-qa'});const token=owner.token;
 await api('/onboarding/flows/core-loop/skip',{},token);
 const want=await api('/library/items',{type:'MOVIE',title:'尚未体验的电影',status:'WANT'},token);
 const old=await api('/library/items',{type:'MOVIE',title:'十月完成的电影',status:'FINISHED',finishedOn:'2026-10-01'},token);
 const recent=await api('/library/items',{type:'BOOK',title:'十一月完成的书',status:'FINISHED',finishedOn:'2026-11-01'},token);
 const missing=await api('/library/items',{type:'GAME',title:'没有完成日期的历史作品',status:'FINISHED'},token);
 const ongoing=await api('/library/items',{type:'SERIES',title:'正在追的剧',status:'IN_PROGRESS'},token);
 const dropped=await api('/library/items',{type:'MOVIE',title:'已放下但有记录日期的电影',status:'DROPPED',finishedOn:'2026-11-02'},token);
 await send('Page.navigate',{url:web+'/login'});await pause(350);await wait("document.readyState==='complete'");await ev(`localStorage.setItem('personal_workbench_token',${JSON.stringify(token)})`);
 for(const [width,height] of [[1440,1000],[375,812]]) {
  await viewport(width,height);await nav('/library');await wait("document.querySelectorAll('.library-item-card').length===6");
  const cards=await ev("[...document.querySelectorAll('.library-item-card')].map(el=>({title:el.querySelector('strong').textContent,date:el.querySelector('time')?.getAttribute('datetime')??null,text:el.textContent}))");
  assert.equal(cards.find(c=>c.title===recent.title).date,'2026-11-01');assert.equal(cards.find(c=>c.title===old.title).date,'2026-10-01');assert.ok(cards.find(c=>c.title===missing.title).text.includes('完成日期未填写'));assert.equal(cards.find(c=>c.title===want.title).date,null);
  assert.deepEqual(cards.map(c=>c.title),[want,dropped,recent,old,ongoing,missing].map(item=>item.title));
  await send('Page.reload');await pause(350);await wait("document.querySelectorAll('.library-item-card').length===6");
  assert.deepEqual(await ev("[...document.querySelectorAll('.library-item-card strong')].map(el=>el.textContent)"),cards.map(c=>c.title));
  assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));
  await screen('list-'+width);results.viewports.push({width,height,noOverflow:true,finishedDatesVisible:true,wantFirstFinishedDateDescending:true,reloadPreservesOrder:true});
 }
 results.assertions.push('Cards expose canonical finishedOn and distinguish missing historical dates without inventing dates');
 await fs.writeFile(dir+'/browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify({result:'PASS',...results},null,2));
}finally{ws.close();}
