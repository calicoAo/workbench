import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const cdpOrigin = process.env.WRITING_MARKDOWN_CDP_ORIGIN ?? "http://127.0.0.1:9335";
const webOrigin = process.env.WRITING_MARKDOWN_WEB_ORIGIN ?? "http://127.0.0.1:5185";
const apiOrigin = process.env.WRITING_MARKDOWN_API_ORIGIN ?? "http://127.0.0.1:3000";
const artifactDir = process.env.WRITING_MARKDOWN_ARTIFACT_DIR ?? path.resolve("docs/reports");
await fs.mkdir(artifactDir, { recursive: true });
const pages = await fetch(`${cdpOrigin}/json/list`).then((response) => response.json());
const target = pages.find((page) => page.type === "page");
if (!target) throw new Error("fresh Chrome page target not found");
const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0; const pending = new Map(); socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); const job = pending.get(message.id); if (!job) return; pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); });
function send(method, params = {}, timeout = 15000) { return new Promise((resolve, reject) => { const id = ++commandId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, timeout = 20000) { const started = Date.now(); while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(120); } throw new Error(`Timed out: ${expression}`); }
async function api(pathname, body, token, method = body === undefined ? "GET" : "POST") { const response = await fetch(`${apiOrigin}/api${pathname}`, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(`${pathname}: ${response.status} ${JSON.stringify(payload)}`); return payload.data; }
async function navigate(pathname, selector = ".app-shell") { await send("Page.navigate", { url: `${webOrigin}${pathname}` }); await waitFor("document.readyState === 'complete'"); await waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`); await sleep(450); }
async function setToken(token) { await evaluate(`localStorage.setItem("personal_workbench_token", ${JSON.stringify(token)})`); await send("Page.navigate", { url: `${webOrigin}/today` }); try { await waitFor("document.querySelector('.app-shell') !== null"); } catch (error) { const debug = await evaluate("({ url: location.href, text: document.body.textContent, html: document.body.innerHTML.slice(0, 1000) })"); console.error(JSON.stringify(debug)); throw error; } }
async function viewport(width, height) { await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 375 }); await waitFor(`innerWidth === ${width} && innerHeight === ${height}`); const value = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); if (width === 375) assert.deepEqual(value, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 }); else assert.ok(value.scrollWidth <= width); return value; }
async function screenshot(name) { const dimensions = await evaluate("({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth })"); assert.deepEqual(dimensions, { innerWidth: dimensions.innerWidth, innerHeight: dimensions.innerHeight, scrollWidth: dimensions.innerWidth }); if (dimensions.innerWidth === 375) assert.deepEqual(dimensions, { innerWidth: 375, innerHeight: 812, scrollWidth: 375 }); const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); const file = path.join(artifactDir, name); await fs.writeFile(file, Buffer.from(capture.data, "base64")); return { file, ...dimensions }; }
async function clickButton(text) { const found = await evaluate(`(() => { const node = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!node) return false; node.click(); return true; })()`); assert.equal(found, true, `missing button: ${text}`); await sleep(250); }

await send("Page.enable"); await send("Runtime.enable");
const owner = await api("/auth/register", { username: `md_qa_${Date.now()}`, displayName: "Writing Markdown QA", password: "writing-markdown-qa-password" });
const token = owner.token;
const date = "2026-10-10";
await api("/onboarding/flows/core-loop/skip", {}, token);
const businessToday = (await api("/hero", undefined, token)).businessDate;
await api("/hero/daily-entry/claim", {businessDate: businessToday}, token);
await api("/settings", { writingSlots: ["MORNING_WRITING", "JOURNAL", "STOCK_REVIEW"].map((slotKey, sortOrder) => ({ slotKey, sortOrder, enabled: true })) }, token, "PATCH");
const source = "# Reading Markdown\n\n**Bold thought**\n\n- [x] Completed\n- next\n\n| Record | Value |\n| --- | --- |\n| day | 10 |\n\n```js\nconst longLine = '" + "x".repeat(180) + "';\n```";
async function fill(label, value) {
  assert.equal(await evaluate(`(() => { const el=document.querySelector('[aria-label="'+${JSON.stringify(label)}+'"]'); if(!el)return false; Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true}));return true; })()`),true,`field ${label}`);
}
const evidence=[];
try {
  await navigate("/login", "body");
  await evaluate(`localStorage.setItem('personal_workbench_token',${JSON.stringify(token)})`);
  await viewport(1440,900);
  await navigate(`/notes?date=${date}`);
  if (await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='直接进入')")) await clickButton("直接进入");
  await clickButton("记一条"); await fill("随手记标题", "Markdown QA"); await fill("随手记正文",source); await clickButton("预览");
  await waitFor("document.querySelector('.markdown-input-preview h1')?.textContent==='Reading Markdown'");
  await clickButton("保存"); await waitFor("document.querySelector('[role=dialog]')===null");
  const notes=await api(`/quick-notes?date=${date}`,undefined,token);
  const note=notes.items.find(n=>n.title==='Markdown QA'); assert.ok(note); assert.equal(note.content,source);
  await evaluate("document.querySelector('.quick-note-card a')?.click() || [...document.querySelectorAll('a')].find(a=>a.href.includes('/notes/'))?.click()");
  await waitFor("document.querySelector('.quick-note-reading h1')!==null");
  assert.equal(await evaluate("document.querySelectorAll('.quick-note-detail textarea,.quick-note-detail input:not([disabled]),.quick-note-detail select').length"),0);
  await clickButton("编辑"); assert.equal(await evaluate("document.querySelector('[aria-label=随手记正文]').value"),source);
  const edited=source+"\n\n## Saved edit"; await fill("随手记正文",edited); await clickButton("保存修改");
  await waitFor("document.querySelector('.quick-note-reading h2')?.textContent==='Markdown QA' && [...document.querySelectorAll('.markdown-content h2')].some(n=>n.textContent==='Saved edit')");
  assert.equal((await api(`/quick-notes/${note.id}`,undefined,token)).content,edited);
  await navigate(`/notes/${note.id}?date=${date}`); assert.equal(await evaluate("document.querySelector('.quick-note-detail textarea')===null"),true);
  evidence.push(await screenshot("WB-WRITING-MARKDOWN-note-1440.png"));
  await viewport(375,812); evidence.push(await screenshot("WB-WRITING-MARKDOWN-note-375.png"));
  await clickButton("编辑"); await clickButton("预览"); evidence.push(await screenshot("WB-WRITING-MARKDOWN-note-edit-375.png"));
  await evaluate("document.querySelector('.quick-note-detail [type=submit]').scrollIntoView({block:'center'})");
  assert.equal(await evaluate("document.querySelector('.quick-note-detail [type=submit]').getBoundingClientRect().bottom < innerHeight - 72"),true,'mobile save stays above bottom navigation');
  evidence.push(await screenshot("WB-WRITING-MARKDOWN-note-edit-controls-375.png"));
  await clickButton("返回阅读");
  for (const [tab,label,pathName] of [["morning","晨写内容","morning-writings"],["journal","日记内容","journals"],["review","大盘结论","stock-reviews"]]) {
    if(tab==='review') await api("/stock-reviews",{reviewDate:date,goodPoints:"**Preserve good points**"},token);
    await navigate(`/journal?date=${date}&tab=${tab}`);
    assert.equal(await evaluate("document.querySelector('.journal-route textarea')===null"),true);
    const aria=tab==='morning'?'打开晨写编辑':tab==='journal'?'打开日记编辑':'打开复盘编辑';
    await evaluate(`document.querySelector('[aria-label="'+${JSON.stringify(aria)}+'"]').click()`);
    await waitFor("document.querySelector('.writing-modal textarea')!==null"); await fill(label, source);
    if(tab==='review') await fill("操作记录","## Operations\n\n> Patient");
    await evaluate("document.querySelector('.writing-modal [type=submit]').click()");
    await waitFor("document.querySelector('[role=dialog]')===null && document.querySelector('.writing-reading h1')?.textContent==='Reading Markdown'");
    const record=await api(`/${pathName}?date=${date}`,undefined,token); assert.equal(tab==='review'?record.marketSummary:record.content,source); if(tab==='review') assert.equal(record.goodPoints,"**Preserve good points**");
    await navigate(`/journal?date=${date}&tab=${tab}`); assert.equal(await evaluate("document.querySelector('.journal-route textarea')===null"),true);
    evidence.push(await screenshot(`WB-WRITING-MARKDOWN-${tab}-375.png`));
  }
  await viewport(1440,900); await navigate(`/journal?date=${date}&tab=journal`); evidence.push(await screenshot("WB-WRITING-MARKDOWN-journal-1440.png"));
  await api(`/quick-notes/${note.id}/inspiration`,{operationId:crypto.randomUUID(),tagNames:[]},token);
  await navigate(`/inspirations?date=${date}`); await waitFor("document.querySelector('.inspiration-card')!==null");
  await evaluate("[...document.querySelectorAll('a')].find(a=>a.textContent==='查看原文').click()");
  await waitFor("document.querySelector('.quick-note-reading h1')!==null"); assert.equal(await evaluate("document.querySelector('.quick-note-detail textarea')===null"),true);
  await clickButton("归档");
  await navigate(`/writing/archive?date=${date}`); await waitFor("document.querySelector('.writing-archive-item a')!==null");
  await evaluate("document.querySelector('.writing-archive-item a').click()");
  await waitFor("document.querySelector('.quick-note-reading h1')!==null");
  assert.equal(await evaluate("document.querySelector('.quick-note-detail textarea')===null"),true);
  assert.ok((await api(`/quick-notes/${note.id}`,undefined,token)).archivedAt);
  await navigate(`/journal?date=${date}&tab=morning&edit=1`); await waitFor("document.querySelector('.writing-modal textarea')!==null");
  assert.equal(await evaluate("document.querySelector('[aria-label=晨写内容]').value"),source); await clickButton("取消");
  await api("/settings",{locale:"en"},token,"PATCH"); await navigate(`/notes/${note.id}?date=${date}`); await clickButton("Edit"); await clickButton("Preview");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Markdown preview\"]')!==null"),true);
  evidence.push(await screenshot("WB-WRITING-MARKDOWN-note-en-1440.png"));
  console.log(JSON.stringify({result:"PASS",realPublicUIAndAPI:"PASS",exactViewport:"PASS",readonlyByDefault:"PASS",markdownSourcePersistence:"PASS",allWritingOwners:"PASS",sourceLinkAndHistoricalEdit:"PASS",i18n:"PASS",evidence},null,2));
} finally { socket.close(); }
