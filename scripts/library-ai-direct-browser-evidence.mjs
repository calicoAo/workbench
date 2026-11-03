import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const web='http://localhost:5188',apiOrigin='http://127.0.0.1:3000',cdp='http://127.0.0.1:9338';
if(!process.env.TEST_DATABASE_URL?.endsWith('_test'))throw Error('Disposable QA database required');
const dir='docs/reports/WB-LIBRARY-AI-DIRECT-2026-11-03-evidence';await fs.mkdir(dir,{recursive:true});
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
async function screen(name){await pause(300);const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(`${dir}/${name}.png`,Buffer.from(s.data,'base64'));}
async function viewport(width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});assert.equal(await ev('innerWidth'),width);assert.equal(await ev('innerHeight'),height);}
const results={provider:'local contract fixture; live provider smoke recorded separately',viewports:[]};
try {
 const health=await fetch('http://127.0.0.1:33308/health').then(r=>r.json());
 const owner=await api('/auth/register',{username:'aidirect_'+Date.now(),displayName:'AI导入验收',password:'isolated-library-direct-qa'});const token=owner.token;
 await api('/onboarding/flows/core-loop/skip',{},token);
 const settings=await api('/ai/settings',undefined,token);await api('/ai/settings',{expectedVersion:settings.version,enabled:true,allowLibrary:true},token,'PUT');
 await send('Network.enable');const requests=[];ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);});
 await send('Page.navigate',{url:web+'/login'});await pause(350);await ev(`localStorage.setItem('personal_workbench_token',${JSON.stringify(token)})`);
 await viewport(1440,1000);await nav('/library');await click('导入资料');
 await wait("document.querySelector('input[aria-label=\"AI 搜索词\"]')");
 const select='.media-import select';await set(select,'WEB_SEARCH:BOOK');await set('input[aria-label="AI 搜索词"]','霍比特人');
 await send('Page.reload');await pause(350);await wait("document.querySelector('.library-route')");await click('导入资料');
 assert.equal(await ev(`document.querySelector('input[aria-label="AI 搜索词"]').value`),'霍比特人');
 await click('AI 搜索');await wait("document.querySelector('.library-ai-candidate')");await screen('desktop-search');
 await click('预览此作品资料');await wait("document.querySelector('.media-preview-cover')");
 assert.equal(await ev("document.querySelector('.media-preview-cover').getAttribute('src')"),'https://covers.openlibrary.org/b/id/42-L.jpg');
 const editor='.media-import textarea';await set(editor,'用户核对后保留的作品简介。');
 await viewport(375,812);await ev("document.querySelector('.media-import textarea').scrollIntoView({block:'center'})");await screen('mobile-preview');assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'),'mobile preview overflow');
 await send('Page.reload');await pause(400);await wait("document.querySelector('.library-route')");await click('导入资料');
 assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).value`),'用户核对后保留的作品简介。');
 await click('确认保存资料');await wait("document.querySelectorAll('.library-item-card').length===1");
 const items=await api('/library/items',undefined,token);assert.equal(items.items.length,1);const itemId=items.items[0].id;
 let detail=await api('/library/items/'+itemId,undefined,token);assert.equal(detail.item.description,'用户核对后保留的作品简介。');assert.equal(detail.item.coverRef,'https://covers.openlibrary.org/b/id/42-L.jpg');assert.equal(detail.sources[0].provider,'WEB_SEARCH');assert.equal(detail.sources[0].references[0].title,'作品资料出处');
 for(const [width,height] of [[1440,1000],[375,812]]){
  await viewport(width,height);await nav('/library/'+itemId);await wait("document.querySelector('.library-source-copy')");
  assert.ok((await ev('document.body.innerText')).includes('作品资料出处'));assert.ok((await ev('document.body.innerText')).includes('用户核对后保留的作品简介。'));assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));
  await screen('detail-'+width);results.viewports.push({width,height,detailReentry:true,noOverflow:true});
 }
 await nav('/library');await click('导入资料');await set(select,'WEB_SEARCH:BOOK');await wait("document.querySelector('.library-ai-candidate')");await click('预览此作品资料');await wait("document.body.innerText.includes('该来源已导入，打开已有条目')");await click('确认保存资料');await wait("document.querySelectorAll('.library-item-card').length===1");
 assert.equal((await api('/library/items',undefined,token)).items.length,1);
 assert.ok(!requests.some(url=>url.includes('/import/resolve')||url.includes('/import/search?')||url.includes('api.themoviedb.org')),'unexpected TMDB dependency');
 const after=await fetch('http://127.0.0.1:33308/health').then(r=>r.json());assert.equal(after.calls-health.calls,2,'refresh/import must not regenerate');
 results.inputRestored=true;results.editsRestored=true;results.coverAndReferencesPersisted=true;results.noTmdb=true;results.reimportReusesExisting=true;results.searchCalls=1;results.modelCalls=1;
 await fs.writeFile(dir+'/browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify({result:'PASS',...results},null,2));
} finally {ws.close();}
