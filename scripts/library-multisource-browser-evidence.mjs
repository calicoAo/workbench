import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const web='http://localhost:5188',apiOrigin='http://127.0.0.1:3000',cdp='http://127.0.0.1:9338';
if(process.env.LIBRARY_LIVE_PROVIDER!=='1')throw Error('Explicit LIBRARY_LIVE_PROVIDER=1 and reserved test budget required');
if(!process.env.TEST_DATABASE_URL?.endsWith('_test'))throw Error('Disposable QA database required');
const dir='docs/reports/WB-LIBRARY-MULTISOURCE-COVERS-2026-11-03-evidence';await fs.mkdir(dir,{recursive:true});
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

const samples=[
 {id:'game-stardew',type:'GAME',query:'Stardew Valley ConcernedApe Steam'},
 {id:'book-gatsby',type:'BOOK',query:'The Great Gatsby F Scott Fitzgerald Standard Ebooks'},
 {id:'movie-paddington',type:'MOVIE',query:'帕丁顿熊 Paddington 2014'},
 {id:'series-frieren',type:'SERIES',query:'葬送的芙莉莲 Frieren 2023'},
 {id:'book-twelve',type:'BOOK',query:'十二国记 月之影 影之海 小野不由美'},
 {id:'book-alive',type:'BOOK',query:'活着 余华 ISBN 9787506365437'},
 {id:'book-prince',type:'BOOK',query:'小王子 李继宏 天津人民出版社 ISBN 9787201077642'},
 {id:'book-potter',type:'BOOK',query:'哈利波特与魔法石 苏农 人民文学 ISBN 9787020033430'},
 {id:'movie-spirited',type:'MOVIE',query:'千与千寻 Spirited Away 2001'},
 {id:'game-hollow',type:'GAME',query:'Hollow Knight Team Cherry Steam'}
];
const reuse=process.env.LIBRARY_REUSE_METADATA==='1';
const prior=reuse?JSON.parse(await fs.readFile(dir+'/browser-live-initial.json','utf8')):null;
const results={environment:'isolated local MySQL + built API/Web + real DeepSeek + real source HTML/images; China production NOT_RUN',samples:[]};
try{
 const priorToken=reuse?await ev("localStorage.getItem('personal_workbench_token')"):null;
 const owner=reuse?{token:priorToken,user:{id:JSON.parse(Buffer.from(priorToken.split('.')[1],'base64url')).id}}:await api('/auth/register',{username:'covers_'+Date.now(),displayName:'真实封面验收',password:'isolated-multisource-qa'}),token=owner.token;
 await api('/onboarding/flows/core-loop/skip',{},token);
 const settings=await api('/ai/settings',undefined,token);await api('/ai/settings',{expectedVersion:settings.version,enabled:true,allowLibrary:true},token,'PUT');
 await send('Network.enable');const requests=[];ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.requestWillBeSent')requests.push({url:m.params.request.url,method:m.params.request.method});});
 await send('Page.navigate',{url:web+'/login'});await pause(350);await ev(`localStorage.setItem('personal_workbench_token',${JSON.stringify(token)})`);
 const only=process.env.LIBRARY_ONLY_SAMPLE;
 if(only){const old=JSON.parse(await fs.readFile(dir+'/browser-live.json','utf8'));results.samples=old.samples.filter(s=>s.id!==only);}
 for(const sample of samples.filter(s=>!only||s.id===only)){
  if(only){const rows=(await api('/library/items',undefined,token)).items;for(const row of rows.filter(r=>r.type===sample.type)){const detail=await api('/library/items/'+row.id,undefined,token);for(const source of detail.sources)await api(`/library/items/${row.id}/sources/${source.id}`,{operationId:crypto.randomUUID(),expectedVersion:detail.item.version},token,'DELETE');}}
  const out={...sample};results.samples.push(out);
  try{
   await viewport(1440,1000);await nav('/library');
   // Fresh sample setup only; success/reload below exercises real persisted workflow.
   await ev(`Object.keys(localStorage).filter(k=>k.startsWith('wb.library-import.v1:')||k.startsWith('wb.library-ai-search.v1:')).forEach(k=>localStorage.removeItem(k))`);
   if(reuse) await ev(`localStorage.setItem('wb.library-ai-search.v1:${owner.user.id}',${JSON.stringify(JSON.stringify(prior.samples.find(s=>s.id===sample.id).search))})`);
   await send('Page.reload');await pause(400);await wait("document.querySelector('.library-route')");await click('导入资料');
   await set('.media-import select','WEB_SEARCH:'+sample.type);await set('input[aria-label="AI 搜索词"]',sample.query);if(!reuse) await click('AI 搜索');
   await wait("!document.querySelector('.library-ai-search-input button').disabled",100000);
   const search=await ev(`JSON.parse(localStorage.getItem('wb.library-ai-search.v1:${owner.user?.id || owner.id}'))`);
   // Registration's public user shape is asserted below; use keys if ID is absent.
   out.search=search;
   if(!search?.result?.candidates?.length){out.result='NO_METADATA';continue;}
   await click('预览并查找封面');
   await wait("document.querySelector('.library-cover-picker')",10000);
   await wait("!document.querySelector('.library-cover-picker [role=status]')",50000);
   await pause(1500);
   if(reuse) await pause(14000);
   const readDraft=()=>ev(`JSON.parse(Object.entries(localStorage).find(([k])=>k.startsWith('wb.library-import.v1:'))[1])`);
   let draft=await readDraft();out.coverLookup=draft.coverLookup;
   await wait("!document.querySelector('.library-cover-picker [role=status]')",15000);
   await pause(1000);draft=await readDraft();
   out.images=await ev(`Array.from(document.querySelectorAll('.library-cover-option img')).map(i=>({url:i.src,width:i.naturalWidth,height:i.naturalHeight,complete:i.complete}))`);
   out.selectedCoverId=draft.selectedCoverId;
   if(!draft.selectedCoverId){out.result='NO_DISPLAYABLE_COVER';out.coverLookup=draft.coverLookup;await screen(sample.id+'-unavailable');continue;}
   const before=requests.filter(r=>r.method==='POST'&&/ai-search(?:$|.*\/covers$)/.test(r.url)).length;
   await set('.media-import textarea','用户确认资料：'+sample.query);
   await ev("document.querySelector('.library-cover-picker').scrollIntoView({block:'center'})");await screen(sample.id+'-desktop');
   await send('Page.reload');await pause(450);await wait("document.querySelector('.library-route')");await click('导入资料');
   await wait("document.querySelector('.library-cover-picker')");await pause(500);
   assert.equal(requests.filter(r=>r.method==='POST'&&/ai-search(?:$|.*\/covers$)/.test(r.url)).length,before,'Refresh must not search/read sources again');
   draft=await readDraft();assert.equal(draft.selectedCoverId,out.selectedCoverId);assert.equal(draft.edits.description,'用户确认资料：'+sample.query);
   await viewport(375,812);await ev("document.querySelector('.library-cover-picker').scrollIntoView({block:'center'})");await screen(sample.id+'-mobile');assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));
   await click('确认保存资料');await wait("!document.querySelector('.media-import')",15000);
   const items=(await api('/library/items',undefined,token)).items;
   const item=items.find(i=>i.title===draft.edits.title);assert.ok(item);const detail=await api('/library/items/'+item.id,undefined,token);assert.equal(detail.item.coverRef,draft.preview.source.metadata.coverRef);
   await nav('/library/'+item.id);await wait("document.querySelector('.library-detail .library-cover img')||document.querySelector('.library-cover img')");
   await wait("document.querySelector('.library-cover img')?.naturalWidth>0",20000);
   out.persisted={id:item.id,title:item.title,coverRef:detail.item.coverRef,description:detail.item.description,references:detail.sources[0].references};
   out.reopenedImage=await ev(`(()=>{const i=document.querySelector('.library-cover img');return {width:i.naturalWidth,height:i.naturalHeight}})()`);
   await screen(sample.id+'-detail');out.refreshNoPaidReplay=true;out.result='PASS';
  }catch(error){out.result='FAILED';out.error=error.message;await screen(sample.id+'-error').catch(()=>{});}
  finally{await fs.writeFile(dir+'/browser-live.json',JSON.stringify(results,null,2));console.log(JSON.stringify({id:out.id,result:out.result,error:out.error,usage:out.search?.usage,covers:out.images?.length}));}
 }
 results.passed=results.samples.filter(s=>s.result==='PASS').length;
 results.totalTokens=results.samples.reduce((n,s)=>n+(s.search?.usage?.inputTokens||0)+(s.search?.usage?.outputTokens||0),0);
 results.noTmdb=!requests.some(r=>r.url.includes('/import/resolve')||r.url.includes('api.themoviedb.org'));
 await fs.writeFile(dir+'/browser-live.json',JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.passed,total:samples.length,totalTokens:results.totalTokens,noTmdb:results.noTmdb}));
}finally{ws.close();}
