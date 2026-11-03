import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
const web='http://localhost:5188',apiOrigin='http://127.0.0.1:3000',cdp='http://127.0.0.1:9338';
if(!process.env.TEST_DATABASE_URL?.endsWith('_test'))throw Error('Disposable QA database required');
const dir='docs/reports/WB-LIBRARY-UX-2026-11-02-evidence';await fs.mkdir(dir,{recursive:true});
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
const connectionUrl=new URL(process.env.TEST_DATABASE_URL);
assert.equal(connectionUrl.hostname, '127.0.0.1');
const pool=await mysql.createConnection(process.env.TEST_DATABASE_URL);
const results={assertions:[],viewports:[]};
const nativeDialogs=[];
ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Page.javascriptDialogOpening'){nativeDialogs.push(m.params.type);void send('Page.handleJavaScriptDialog',{accept:false});}});
await send('Page.enable');
try {
 const owner=await api('/auth/register',{username:'libraryux_'+Date.now(),displayName:'图书馆验收',password:'isolated-library-ux-qa'});
 const token=owner.token;
 await api('/onboarding/flows/core-loop/skip',{},token);
 const first=await api('/library/items',{type:'MOVIE',title:'帕丁顿熊',originalTitle:'Paddington',creator:'保罗·金',status:'WANT',releaseYear:2014,description:'一只来自秘鲁的小熊来到伦敦，住进布朗一家，开始寻找新的家。',shortNote:'和家人一起看，留住温柔的时刻。'},token);
 const second=await api('/library/items',{type:'BOOK',title:'后录入的书',creator:'验收作者',status:'WANT'},token);
 await pool.execute("INSERT INTO library_item_sources (user_id,library_item_id,provider,entity_type,stable_source_id,canonical_url,attribution,language,metadata_snapshot,imported_at,metadata_updated_at) VALUES (?,?,'TMDB','MOVIE','116149','https://www.themoviedb.org/movie/116149','This product uses the TMDB API but is not endorsed or certified by TMDB.','zh-CN',?,NOW(),NOW())",[owner.user.id,first.id,JSON.stringify({title:first.title,releaseYear:2014,description:first.description})]);
 await send('Page.navigate',{url:web+'/login'});await pause(350);await wait("document.readyState==='complete'");await ev(`localStorage.setItem('personal_workbench_token',${JSON.stringify(token)})`);
 await viewport(1440,1000);await nav('/library');await wait("document.querySelectorAll('.library-item-card').length===2");
 assert.equal(await ev("document.querySelector('.library-item-card strong').textContent"),second.title);
 await ev(`document.querySelector('a.library-item-card[href="/library/${first.id}"]').click()`);await wait("document.querySelector('.library-reading')");
 assert.equal(await ev("document.querySelector('.library-editor')"),null);
 const row=await ev("[...document.querySelectorAll('.library-source-actions button')].map(b=>({top:b.getBoundingClientRect().top,left:b.getBoundingClientRect().left}))");assert.equal(row.length,2);assert.equal(row[0].top,row[1].top);assert.ok(row[1].left>row[0].left);
 await set('[aria-label="作品状态"]','FINISHED');await wait("document.querySelector('.library-facts').textContent.includes(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))");
 await set('[aria-label="评分"]','4');await wait("document.querySelector('[aria-label=评分]').value==='4' && !document.querySelector('[aria-label=评分]').disabled");
 let detail=await api(`/library/items/${first.id}`,undefined,token);assert.equal(detail.item.status,'FINISHED');assert.equal(detail.item.rating,4);assert.ok(detail.item.finishedOn);
 await click('解除来源关联');await wait("document.querySelector('.feedback-modal')");await screen('unlink-confirm-desktop');await click('取消');assert.equal((await api(`/library/items/${first.id}`,undefined,token)).sources.length,1);
 await ev("document.querySelector('.library-edit-link').click()");await wait("document.querySelector('.library-editor')");
 assert.equal(await ev("document.querySelectorAll('[name=releaseYear]').length"),1);assert.equal(await ev("document.querySelectorAll('[name=description]').length"),1);
 await set('[name=releaseYear]','2015');await set('[name=description]','编辑后保存的简介，刷新后仍能阅读。');await set('[name=shortNote]','自己的短评保持独立。');await click('保存更改');await wait("document.querySelector('.library-reading') && !location.search.includes('edit=1')");
 detail=await api(`/library/items/${first.id}`,undefined,token);assert.equal(detail.item.releaseYear,2015);assert.equal(detail.item.description,'编辑后保存的简介，刷新后仍能阅读。');assert.equal(detail.item.shortNote,'自己的短评保持独立。');
 await send('Page.reload');await pause(350);await wait("document.querySelector('.library-reading')?.textContent.includes('编辑后保存的简介')");
 results.assertions.push('Reading is default; one year/description editor; save returns to detail; reload retains canonical fields');
 results.assertions.push('Inline completion defaults user business date; rating persists; unlink uses shared confirmation and cancel leaves source intact');
 await nav('/library');await wait("document.querySelectorAll('.library-item-card').length===2");assert.equal(await ev("document.querySelector('.library-item-card strong').textContent"),second.title);
 await click('添加作品');await set('.library-create-dialog [name=title]','刚录入的电影');await set('.library-create-dialog [name=type]','MOVIE');await set('.library-create-dialog [name=status]','FINISHED');await click('保存作品');await wait("!document.querySelector('.library-create-dialog') && document.querySelector('.library-item-card strong')?.textContent==='刚录入的电影'");assert.equal(await ev('location.pathname'),'/library');
 const listed=(await api('/library/items',undefined,token)).items;assert.deepEqual(listed.slice(1).map(i=>i.id),[second.id,first.id]);assert.ok(listed[0].finishedOn);
 await click('导入资料');await set('[aria-label="搜索词或来源网址"]','草稿保留验证');await click('丢弃草稿 / 重新开始');await wait("document.querySelector('.feedback-modal')");await click('取消');assert.equal(await ev("document.querySelector('[aria-label=搜索词或来源网址]').value"),'草稿保留验证');await click('丢弃草稿 / 重新开始');await click('确认');assert.equal(await ev("document.querySelector('[aria-label=搜索词或来源网址]').value"),'');await click('导入资料');
 results.assertions.push('Editing old item never reorders created-time list; manual create returns to list with newest entry first and completion date');
 results.assertions.push('Import draft discard uses shared dialog; cancel preserves input, confirm resets it');
 for(const [width,height] of [[1440,1000],[390,844],[375,812]]) {
  await viewport(width,height);await nav(`/library/${first.id}`);await wait("document.querySelector('.library-reading')");
  await ev("document.querySelector('.earth-entry-close')?.click()");await pause(150);
  assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));
  const actions=await ev("[...document.querySelectorAll('.library-source-actions button')].map(b=>({top:b.getBoundingClientRect().top,right:b.getBoundingClientRect().right}))");assert.equal(actions[0].top,actions[1].top);assert.ok(actions.every(a=>a.right<=width));
  if(width<=640) assert.equal(await ev("getComputedStyle(document.querySelector('.library-detail-head')).display"),'grid');
  await screen('detail-final-'+width);
  await ev("document.querySelector('.library-edit-link').click()");await wait("document.querySelector('.library-editor')");await screen('editor-final-'+width);
  assert.equal(await ev("document.querySelectorAll('[name=releaseYear]').length"),1);assert.equal(await ev("document.querySelectorAll('[name=description]').length"),1);
  assert.ok(await ev('document.documentElement.scrollWidth<=innerWidth'));
  const fields=await ev("[...document.querySelectorAll('.library-editor .field')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))");assert.ok(fields.every(f=>f.left>=0 && f.right<=width));
  await ev("document.querySelector('.library-actions').scrollIntoView({block:'center'})");await pause(180);
  const footer=await ev("(()=>{const b=document.querySelector('.library-actions button:last-child').getBoundingClientRect();const nav=document.querySelector('.mobile-bottom-nav, .mobile-nav')?.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,navTop:nav?.height>0?nav.top:innerHeight};})()");
  assert.ok(footer.top>=0 && footer.bottom<=footer.navTop,JSON.stringify(footer));
  await screen('editor-save-final-'+width);
  await click('取消');await wait("document.querySelector('.library-reading')");
  results.viewports.push({width,height,noOverflow:true,sourceActionsHorizontal:true,oneYearAndDescription:true});
 }
 assert.deepEqual(nativeDialogs,[]);results.assertions.push('No native browser dialogs; exact 1440/390/375 CSS viewports without horizontal overflow');
 await fs.writeFile(dir+'/browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify({result:'PASS',...results},null,2));
}finally{ws.close();await pool.end();}
