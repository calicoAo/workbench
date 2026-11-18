import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const web=process.env.GLASS_WEB_ORIGIN??'http://127.0.0.1:5187';
const cdp=process.env.GLASS_CDP_ORIGIN??'http://127.0.0.1:9340';
const out=path.resolve('docs/reports/cloud-glass');
const wrapper=path.resolve('apps/web/.cloud-glass-qa.html');
await fs.mkdir(out,{recursive:true});
await fs.writeFile(wrapper,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="/@fs${path.resolve('scripts/fixtures/cloud-glass.tsx')}?qa=${Date.now()}"></script></body></html>`);
const pages=await fetch(`${cdp}/json/list`).then(r=>r.json());
const socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true})});
let sequence=0;const pending=new Map(),errors=[];
socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)});
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'))},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))})}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<120;i++){if(await ev(`Boolean(${expression})`))return;await pause(60)}throw Error('Not ready: '+expression)}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))}
const scenarios=[['adventure','/today','.completed-task-row'],['tasks','/tasks','.bounty-card'],['growth','/growth','.growth-hero-card'],['wallet','/finance','.finance-worth'],['library','/library','.library-item-card'],['library-detail','/library/3','.library-reading'],['library-edit','/library/3?edit=1','.library-editor'],['bag','/backpack','.backpack-banner'],['projects','/projects','.project-card'],['project-detail','/projects/1','.project-detail'],['notes','/notes','.quick-note-card'],['morning','/journal?tab=morning','.journal-route'],['journal','/journal?tab=journal','.journal-route'],['review','/journal?tab=review','.journal-route'],['archive','/writing/archive','.writing-archive-route'],['life','/routines','.routines-head'],['inspirations','/inspirations','.inspiration-card'],['calendar','/calendar?view=month','.activity-month'],['rewards','/rewards','.reward-item'],['settings','/settings','.settings-route']];
const checks=[];
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 for(const [width,height] of [[1440,1000],[1024,900],[390,844]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
  for(const [name,route,ready] of scenarios){
   if(name==='adventure') await send('Storage.clearDataForOrigin',{origin:web,storageTypes:'local_storage'});
   await send('Page.navigate',{url:`${web}/.cloud-glass-qa.html?route=${encodeURIComponent(route)}`});
   await wait(`document.querySelector(${JSON.stringify(ready)})`);await ev('document.fonts.ready');await pause(100);
   const metric=await ev(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,heading:document.querySelector('h1')?.textContent})`);
   await shot(`${width}-${name}`);assert.equal(metric.width,width);assert.ok(metric.scrollWidth<=width,`${name}/${width} horizontal overflow ${metric.scrollWidth}`);
   if(name==='library')assert.equal(await ev(`getComputedStyle(document.querySelector('.library-grid')).gridTemplateColumns.split(' ').length`),width<768?3:width<1180?4:5);
   if(name==='bag')assert.ok(await ev(`document.querySelector('.backpack-banner img').naturalWidth>0`),'backpack decoration loads');
   if(name==='adventure'){
    if(width<768) assert.ok(await ev(`(()=>{const controls=[...document.querySelectorAll('.tasks-today-panel > .panel-header button')];return controls.length===4&&controls.every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44&&getComputedStyle(b.querySelector('.ui-button-visual')).whiteSpace==='nowrap'})})()`),'mobile task actions fit without label wrapping');
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('AI 拆分')).click()`);
    await wait(`document.querySelector('.split-workflow')`);
    await ev(`(()=>{const e=document.querySelector('.split-workflow-body > label textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'今天的任务：整理笔记，核对资料，完成图画。');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('生成可审核草稿')).click()`);
    await wait(`document.querySelectorAll('.split-candidate').length===8`);
    const before=await ev(`(()=>{const d=document.querySelector('.split-workflow'),h=d.querySelector(':scope > header'),b=d.querySelector('.split-workflow-body');return {top:d.getBoundingClientRect().top,bottom:d.getBoundingClientRect().bottom,headerBottom:h.getBoundingClientRect().bottom,bodyTop:b.getBoundingClientRect().top,headerTop:h.getBoundingClientRect().top,scroll:b.scrollHeight,client:b.clientHeight}})()`);
    await ev(`document.querySelector('.split-workflow-body').scrollTop=1000`);await pause(80);
    const after=await ev(`(()=>{const d=document.querySelector('.split-workflow'),h=d.querySelector(':scope > header'),b=d.querySelector('.split-workflow-body');return {headerTop:h.getBoundingClientRect().top,bodyTop:b.getBoundingClientRect().top,scrollTop:b.scrollTop}})()`);
    assert.ok(before.scroll>before.client,'long split content scrolls');assert.ok(after.scrollTop>0);assert.equal(before.headerTop,after.headerTop);assert.ok(after.bodyTop>=before.headerBottom-1);assert.ok(before.top>=0&&before.bottom<=height,'dialog contained');
    await shot(`${width}-ai-split-scroll`);await ev(`[...document.querySelectorAll('.split-workflow button')].find(b=>b.getAttribute('aria-label')?.includes('关闭')).click()`);
    checks.push({name:'split-scroll',width,before,after});
   }
   if(name==='wallet'){
    const income=await ev(`(()=>{const e=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('记收入'));if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}})()`);
    assert.ok(income&&income.left>=0&&income.right<=width&&income.top>=0&&income.bottom<=height,'income immediately visible');
   }
   checks.push({name,...metric});
  }
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({result:'PASS',scope:'Real public React UI with isolated in-memory transport. No provider or database writes; presentation acceptance only.',checks,runtimeErrors:errors},null,2));console.log(JSON.stringify({result:'PASS',checks:checks.length,out}));
}finally{await fs.rm(wrapper,{force:true});socket.close()}
