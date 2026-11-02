import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {deepseekGateway} from '../apps/api/src/deepseek.js';
import {SYSTEM,splitJsonSchema,splitSchema,validateEvidence} from '../apps/api/src/task-split/contract.js';
// Independent of development/production DB. No writes to business data.
const dir='.qa-private';await mkdir(dir,{recursive:true});
const ledgerPath=`${dir}/deepseek-test-budget.json`;
let ledger:{limitRmb:number;spentUpperRmb:number;calls:unknown[]};
try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch{ledger={limitRmb:8,spentUpperRmb:0,calls:[]};}
assert.equal(ledger.limitRmb,8);
const only=process.argv.find(v=>v.startsWith('--fixture='))?.slice(10);
const suffix=only?'-'+only.replace(/[^a-z0-9-]/g,''):'';
const fixtures=JSON.parse(await readFile('apps/api/tests/fixtures/task-split-quality.json','utf8')).filter((v:{id:string})=>!only||v.id===only);
assert.ok(fixtures.length);
const results:any[]=[];
for(const fixture of fixtures)for(let repetition=0;repetition<3;repetition++) {
 // 32 KiB full request + 8192 output tokens, peak price RMB 2/8 per million.
 const reserve=.14;if(ledger.spentUpperRmb+reserve>ledger.limitRmb)throw Error('RMB 8 budget reached before next request');
 ledger.spentUpperRmb+=reserve;const entry:any={id:fixture.id,repetition,reservedRmb:reserve,at:new Date().toISOString(),status:'UNKNOWN'};ledger.calls.push(entry);await writeFile(ledgerPath,JSON.stringify(ledger,null,2));
 try{
  const response=await deepseekGateway.generateStructured({schemaName:'task_split_v1',schema:splitJsonSchema,system:SYSTEM,user:JSON.stringify({businessDate:'2026-11-02',timezone:'Asia/Shanghai',projects:[{id:1,name:'个人网站',description:'开发个人网站'}],categories:[{id:1,name:'生活'},{id:2,name:'工作'}],text:fixture.text})});
  const usage=response.usage;const known=usage?.inputTokens!==undefined&&usage?.outputTokens!==undefined;
  const cost=known?(usage.inputTokens!*2+usage.outputTokens!*8)/1e6:reserve;
  ledger.spentUpperRmb+=Math.max(cost,reserve)-reserve; // Replace reservation only after measured usage is checked.
  if(known&&cost<=reserve)ledger.spentUpperRmb-=reserve-cost;
  entry.status='RECEIVED';entry.usage=usage;entry.costUpperRmb=cost;await writeFile(ledgerPath,JSON.stringify(ledger,null,2));
  const parsed=splitSchema.parse(response.payload);const checked=parsed.candidates.map(c=>validateEvidence(c,fixture.text,'2026-11-02'));
  const due=checked.map(c=>c.dueAtLocal).filter(Boolean),durations=checked.map(c=>c.estimatedMinutes).filter(Boolean);
  const inventedDate=due.some(v=>!fixture.dates.includes(v));const inventedDuration=durations.some(v=>!fixture.durations.includes(v));
  const coverage=fixture.tasks.length?fixture.tasks.filter((terms:string[])=>checked.some(c=>terms.some(term=>(c.title+' '+c.description).includes(term)))).length/fixture.tasks.length:1;
  const countOK=fixture.overflow?parsed.hasMore&&parsed.unprocessedTextSpans.length>0:Math.abs(checked.length-fixture.tasks.length)<=Math.max(1,Math.ceil(fixture.tasks.length*.2));
  const extracted=fixture.durations.length?fixture.durations.filter((v:number)=>durations.includes(v)).length/fixture.durations.length:1;
  const pendingDate=fixture.dates.every((value:string)=>checked.some(c=>c.dueAtLocal===value || c.dueEvidence&&fixture.text.includes(c.dueEvidence)));
  results.push({id:fixture.id,repetition,usage,candidates:checked,hasMore:parsed.hasMore,unprocessedTextSpans:parsed.unprocessedTextSpans,inventedDate,inventedDuration,coverage,countOK,extracted,pendingDate,reasoningZero:usage?.reasoningTokens===0});
  console.log(`${fixture.id}/${repetition+1} count=${checked.length} coverage=${coverage} cost<=${cost.toFixed(6)} RMB`);
 }catch(e){entry.error=e instanceof Error?e.message:String(e);await writeFile(ledgerPath,JSON.stringify(ledger,null,2));results.push({id:fixture.id,repetition,error:entry.error});console.log(`${fixture.id}/${repetition+1} FAILED ${entry.error}`);}
 await writeFile(`${dir}/task-split-quality-results${suffix}.json`,JSON.stringify({results,spentUpperRmb:ledger.spentUpperRmb,pricing:{checkedOn:'2026-11-02',url:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',peakInputPerMillion:2,peakOutputPerMillion:8}},null,2));
}
const valid=results.filter(v=>!v.error),summary={runs:results.length,errors:results.length-valid.length,inventedDates:valid.filter(v=>v.inventedDate).length,inventedDurations:valid.filter(v=>v.inventedDuration).length,coverage:valid.reduce((a,v)=>a+v.coverage,0)/valid.length,countPassRate:valid.filter(v=>v.countOK).length/valid.length,extraction:valid.reduce((a,v)=>a+v.extracted,0)/valid.length,pendingDatePassRate:valid.filter(v=>v.pendingDate).length/valid.length,reasoningZero:valid.every(v=>v.reasoningZero),spentUpperRmb:ledger.spentUpperRmb};
await writeFile(`${dir}/task-split-quality-summary${suffix}.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
if(summary.errors||summary.inventedDates||summary.inventedDurations||summary.coverage<.9||summary.extraction<.95||summary.pendingDatePassRate<1)process.exitCode=1;
