import assert from "node:assert/strict";
import fs from "node:fs/promises";
import mysql from "mysql2/promise";

// Run only against a freshly migrated, disposable QA database/API and Chrome profile.
const databaseUrl = process.env.TEST_DATABASE_URL;
const token = process.env.LIABILITY_TRANSFER_BROWSER_TOKEN;
if (!token || !databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("Require LIABILITY_TRANSFER_BROWSER_TOKEN and an isolated TEST_DATABASE_URL ending in _test");
const apiOrigin = process.env.LIABILITY_TRANSFER_BROWSER_API_ORIGIN ?? "http://127.0.0.1:3010";
const webOrigin = process.env.LIABILITY_TRANSFER_BROWSER_WEB_ORIGIN ?? "http://127.0.0.1:5180";
const cdpOrigin = process.env.LIABILITY_TRANSFER_BROWSER_CDP_ORIGIN ?? "http://127.0.0.1:9338";
const reports = new URL("../docs/reports/", import.meta.url);
const prefix = "WB-PRODUCT-CLOSURE-02-LIABILITY-TRANSFER";
const connection = await mysql.createConnection(databaseUrl);
const pages = await fetch(`${cdpOrigin}/json/list`).then((r) => r.json());
const socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let id = 0; const pending = new Map();
socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id) return; const job = pending.get(message.id); pending.delete(message.id); if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const messageId = ++id; pending.set(messageId, { resolve, reject }); socket.send(JSON.stringify({ id: messageId, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
async function waitFor(expression) { const start = Date.now(); while (Date.now() - start < 30000) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(100); } throw new Error(`Timed out: ${expression}`); }
async function api(path, body) {
  const response = await fetch(`${apiOrigin}/api/finance${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify({ operationId: crypto.randomUUID(), ...body }) } : {}) });
  const json = await response.json(); assert.equal(response.status, 200, JSON.stringify(json)); return json.data;
}
async function viewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
}
async function screenshot(suffix) {
  await sleep(250); // Capture the settled modal/viewport layout, after entrance transitions.
  const metrics = await evaluate("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth})");
  assert.equal(metrics.scrollWidth, metrics.width, "horizontal page overflow");
  const image = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  await fs.writeFile(new URL(`${prefix}-${suffix}.png`, reports), Buffer.from(image.data, "base64")); return metrics;
}
async function clickText(text) {
  assert.ok(await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)}); if(!button)return false;button.click();return true;})()`), `missing button ${text}`);
}
async function clickLabel(label) { assert.ok(await evaluate(`(() => {const button=document.querySelector('button[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!button)return false;button.click();return true;})()`), `missing ${label}`); }
async function setField(selector, value) {
  assert.ok(await evaluate(`(() => {const field=document.querySelector(${JSON.stringify(selector)});if(!field)return false; const prototype=field.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));return true;})()`), `missing ${selector}`);
}
async function closed() { await waitFor("!document.querySelector('form.finance-dialog')"); }
async function accountAction(name, action) {
  assert.ok(await evaluate(`(() => { const row=[...document.querySelectorAll('.finance-account-list article')].find(n=>n.querySelector('strong')?.textContent===${JSON.stringify(name)});const button=row&&[...row.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(action)});if(!button)return false;button.click();return true;})()`));
  await waitFor("document.querySelector('form.finance-dialog')");
}
async function balances(bankId, creditId, bankBalance, creditBalance) {
  const current = await api("/accounts?view=all");
  assert.equal(current.find(a=>a.id===bankId).balanceCents, bankBalance);
  assert.equal(current.find(a=>a.id===creditId).balanceCents, creditBalance);
  const overview = await api("/overview?month=2026-10");
  assert.equal(overview.monthlyIncomeCents,"0"); assert.equal(overview.monthlyExpenseCents,"0");
  return { bank: bankBalance, credit: creditBalance, income: overview.monthlyIncomeCents, expense: overview.monthlyExpenseCents };
}
async function formLayout() {
  await sleep(250);
  const layout = await evaluate(`(() => {const form=document.querySelector('form.finance-dialog');const b=form.getBoundingClientRect();const footer=form.querySelector('footer').getBoundingClientRect();return {width:innerWidth,height:innerHeight,inside:b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight,footerVisible:footer.bottom<=innerHeight&&footer.top>=0,scrollWidth:form.scrollWidth,clientWidth:form.clientWidth,overflow:form.scrollWidth>form.clientWidth,controls:[...form.querySelectorAll('select,input,footer button')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height};})};})()`);
  if (!layout.inside || !layout.footerVisible || layout.overflow) { const shot=await send("Page.captureScreenshot",{format:"png"}); await fs.writeFile("/tmp/workbench-liability-transfer-layout.png",Buffer.from(shot.data,"base64")); }
  assert.ok(layout.inside && layout.footerVisible && !layout.overflow, JSON.stringify(layout));
  assert.ok(layout.controls.every(r=>r.left>=0&&r.right<=layout.width), JSON.stringify(layout));
  if(layout.width<768)assert.ok(layout.controls.slice(-2).every(r=>r.height>=44));
  return layout;
}
try {
  // Prepare unrelated onboarding before exercising transfers through the public UI.
  const skip = await fetch(`${apiOrigin}/api/onboarding/flows/core-loop/skip`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(skip.status, 200);
  await api("/initialize",{});
  const bank=await api("/accounts",{name:"银行主账户",type:"BANK",openingBalanceCents:"500000",openingDate:"2026-10-01"});
  const credit=await api("/accounts",{name:"个人借款",type:"CREDIT",openingBalanceCents:"-320000",openingDate:"2026-10-01"});
  const other=await api("/accounts",{name:"排除总览的信用卡",type:"CREDIT",openingBalanceCents:"20000",openingDate:"2026-10-01",includeInOverview:false});
  const archived=await api("/accounts",{name:"已归档借款",type:"CREDIT",openingBalanceCents:"-10000",openingDate:"2026-10-01"});
  await api(`/accounts/${archived.id}/archive`,{expectedVersion:1});
  await send("Page.enable");await send("Runtime.enable");
  await send("Page.navigate",{url:webOrigin});await waitFor("document.readyState==='complete'");
  await evaluate(`localStorage.setItem('personal_workbench_token',${JSON.stringify(token)});localStorage.setItem('personal-workbench:sidebar-collapsed','false');`);
  await send("Page.navigate",{url:`${webOrigin}/finance?date=2026-10-11&tab=accounts`});
  await waitFor("document.querySelector('.finance-account-list article')");
  await waitFor("!document.querySelector('.onboarding-backdrop')");
  await sleep(800);
  if(await evaluate("Boolean(document.querySelector('.earth-entry-close'))")){await evaluate("document.querySelector('.earth-entry-close').click()");await waitFor("!document.querySelector('.earth-entry-backdrop')");}
  const evidence={result:"PASS",screenshots:{},flows:[],layouts:[]};
  await viewport(1440,1000);evidence.screenshots.accounts1440=await screenshot("accounts-1440");
  await accountAction("个人借款","借入");
  assert.equal(await evaluate("document.querySelector('form.finance-dialog select').value"),"borrow");
  assert.equal(await evaluate("document.querySelectorAll('form.finance-dialog select')[1].value"),String(credit.id));
  assert.equal(await evaluate("document.querySelectorAll('form.finance-dialog select')[2].value"),String(bank.id));
  await setField('[aria-label="转账金额"]',"500");
  await waitFor("document.querySelector('form.finance-dialog').textContent.includes('借入后：欠款 ¥3,700.00')");
  evidence.layouts.push(await formLayout());evidence.screenshots.borrow1440=await screenshot("borrow-1440");
  await clickText("确认借入");await closed();evidence.flows.push({intent:"borrow",...await balances(bank.id,credit.id,"550000","-370000")});
  await viewport(375,812);
  const actions=await evaluate("[...document.querySelectorAll('.finance-account-transfer-actions button')].map(n=>{const r=n.getBoundingClientRect();return{height:r.height,width:r.width};})");
  assert.ok(actions.every(r=>r.height>=44&&r.width>=44));
  await accountAction("个人借款","还款");await setField('[aria-label="转账金额"]',"500");
  await waitFor("document.querySelector('form.finance-dialog').textContent.includes('还款后：欠款 ¥3,200.00')");
  await evaluate("document.querySelector('.finance-repayment-preview').scrollIntoView({block:'center'})");
  evidence.layouts.push(await formLayout());evidence.screenshots.repay375=await screenshot("repay-375");
  await clickText("确认还款");await closed();evidence.flows.push({intent:"partial-repay",...await balances(bank.id,credit.id,"500000","-320000")});
  await accountAction("个人借款","还款");await setField('[aria-label="转账金额"]',"3200");
  await waitFor("document.querySelector('form.finance-dialog').textContent.includes('还款后：已结清')");await clickText("确认还款");await closed();
  await waitFor("document.querySelector('section[aria-label=负债账户]').textContent.includes('已结清')");
  evidence.flows.push({intent:"exact-repay",...await balances(bank.id,credit.id,"180000","0")});
  await accountAction("个人借款","还款");await setField('[aria-label="转账金额"]',"100");
  await waitFor("document.querySelector('form.finance-dialog').textContent.includes('还款后：预存 ¥100.00')");
  await evaluate("document.querySelector('.finance-repayment-preview').scrollIntoView({block:'center'})");
  evidence.screenshots.prepaid375=await screenshot("prepaid-375");await clickText("确认还款");await closed();
  evidence.flows.push({intent:"overpay",...await balances(bank.id,credit.id,"170000","10000")});
  // Generic prepaid withdrawal remains neutral, after explicit intent is changed by the user.
  await accountAction("个人借款","借入");await setField('form.finance-dialog select',"transfer");await setField('[aria-label="转账金额"]',"50");
  await waitFor("document.querySelector('form.finance-dialog').textContent.includes('转账后：预存 ¥50.00')");
  assert.equal(await evaluate("document.querySelector('form.finance-dialog h2').textContent"),"普通转账");
  await setField('form.finance-dialog input[maxlength="500"]',"预存提取");await clickText("保存转账");await closed();
  evidence.flows.push({intent:"generic-prepaid-withdrawal",...await balances(bank.id,credit.id,"175000","5000")});
  await accountAction("个人借款","借入");await setField('form.finance-dialog select',"transfer");
  // Choose the target CREDIT explicitly in the existing public form.
  await setField('form.finance-dialog .finance-form-grid label:nth-child(2) select',String(other.id));
  await setField('[aria-label="转账金额"]',"30");assert.equal(await evaluate("document.querySelector('form.finance-dialog h2').textContent"),"普通转账");
  assert.equal(await evaluate("[...document.querySelectorAll('form.finance-dialog option')].some(n=>n.textContent.includes('已归档借款'))"),false);
  await clickText("保存转账");await closed();
  evidence.flows.push({intent:"generic-credit-to-credit",...await balances(bank.id,credit.id,"175000","2000")});
  const excluded=(await api('/accounts?view=all')).find(a=>a.id===other.id);assert.equal(excluded.balanceCents,"23000");assert.equal(excluded.includeInOverview,false);
  await clickLabel("隐藏金额");await accountAction("个人借款","还款");await setField('[aria-label="转账金额"]',"10");
  const preview=await evaluate("document.querySelector('.finance-repayment-preview').textContent");assert.ok(preview.includes('¥••••'));assert.ok(!preview.includes('¥1,750')&&!preview.includes('¥20.00'));
  await evaluate("document.querySelector('.finance-repayment-preview').scrollIntoView({block:'center'})");evidence.screenshots.privacy375=await screenshot("privacy-375");await clickText("取消");await closed();await clickLabel("显示金额");
  await viewport(1440,1000);await clickText("流水");await waitFor("document.querySelector('.finance-transaction-list button')");
  const history=await api('/transactions');const transfers=history.items.filter(t=>t.type==='TRANSFER');assert.equal(transfers.length,6);
  const rowNote="预存提取";
  assert.ok(await evaluate(`(() => {const row=[...document.querySelectorAll('.finance-transaction-list button')].find(n=>n.textContent.includes(${JSON.stringify(rowNote)}));if(!row)return false;row.click();return true;})()`));
  await waitFor("document.querySelector('.finance-detail-summary')?.textContent.includes('转出：个人借款')");
  const detail=await evaluate("document.querySelector('form.finance-dialog')?.textContent??document.querySelector('.finance-detail')?.textContent??document.querySelector('.time-modal').textContent");
  assert.ok(detail.includes('转入：银行主账户')&&detail.includes('¥50.00'));evidence.screenshots.history1440=await screenshot("history-1440");
  const [entries]=await connection.query("SELECT t.id,COUNT(*) AS count,SUM(e.amount_cents) AS sum FROM finance_transactions t JOIN finance_entries e ON e.transaction_id=t.id WHERE t.type=3 AND t.source_account_id IN (?,?,?) GROUP BY t.id",[bank.id,credit.id,other.id]);
  assert.equal(entries.length,6);assert.ok(entries.every(row=>row.count===2&&String(row.sum)==='0'));
  evidence.ledger={transferHeaders:entries.length,twoBalancedEntriesEach:true};
  await fs.writeFile(new URL(`${prefix}-browser.json`,reports),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
} finally {socket.close();await connection.end();}
