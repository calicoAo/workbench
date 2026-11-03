import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { before, after, test } from "node:test";
import mysql, { type Connection, type Pool } from "mysql2/promise";
const sourceUrl = process.env.TEST_DATABASE_URL;
if (!sourceUrl || !new URL(sourceUrl).pathname.endsWith("_test"))
    throw Error("Isolated TEST_DATABASE_URL ending _test required");
const source = new URL(sourceUrl), fresh = `wb_media_split_${process.pid}_test`, upgrade = `wb_media_upgrade_${process.pid}_test`;
let admin: Connection, pool: Pool, app: typeof import('../src/app.js').app, signToken: typeof import('../src/auth.js').signToken, provider: Server, calls = 0;
let providerMode="success";
const baikeUrl='https://baike.baidu.com/item/帕丁顿熊/14354362';
const baikeCover='https://bkimg.cdn.bcebos.com/pic/0823dd54564e9258dbbe38929382d158cdbf4ec7';
let commands: typeof import('../src/library-import/commands.js'), split: typeof import('../src/task-split/index.js');
const candidate = { title: "整理材料", description: "检查数据", priority: 3, difficulty: 2, categoryId: null, projectId: null, categorySuggestion: "资料", projectSuggestion: null, dueAtLocal: null, dueEvidence: null, estimatedMinutes: 30, durationEvidence: "整理材料30分钟", suggestedMinutes: 40 };
const sourceFixture = { provider: "TMDB" as const, entityType: "MOVIE" as const, stableSourceId: "550", canonicalUrl: "https://www.themoviedb.org/movie/550", attribution: "TMDB", metadata: { title: "Fight Club", originalTitle: "Fight Club", creator: "David Fincher", creatorRole: "director", releaseYear: 1999, description: "Original overview", descriptionLanguage: "en-US", coverRef: "https://image.tmdb.org/t/p/w500/a.jpg", isAnimation: false } };
async function api(path: string, body?: unknown, userId = 1, method = body ? "POST" : "GET") { const response = await app.request(`http://localhost/api${path}`, { method, headers: { Authorization: `Bearer ${signToken({ id: userId, username: "qa", displayName: "QA" })}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); const json = await response.json() as any; return { status: response.status, data: json.data, message: json.message }; }
const operation = () => crypto.randomUUID();
async function scalar(sql: string, values: unknown[] = []) { const [rows] = await pool.query(sql, values); return Number(Object.values((rows as any[])[0])[0]); }
async function migrate(name: string, from = 0, to = 1000) { await admin.query(`USE \`${name}\``); const dir = resolve(process.cwd().endsWith('/apps/api') ? '../../db/migration' : 'db/migration'); const version = (n: string) => { const m = /^V(\d+)(?:_(\d+))?__/.exec(n)!; return [+m[1], +(m[2] ?? 0)]; }; for (const file of (await readdir(dir)).filter(n => /^V\d+(?:_\d+)?__/.test(n)).sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1]))
    if (version(file)[0] >= from && version(file)[0] <= to)
        await admin.query(await readFile(resolve(dir, file), 'utf8')); }
before(async () => {
    provider = createServer(async (req, res) => { calls++; let raw = ''; for await (const chunk of req)
        raw += chunk; const body = JSON.parse(raw); res.setHeader('Content-Type', 'application/json');
        if(req.url === '/v1/tools/fetch') {
          assert.equal(body.url,new URL(baikeUrl).href);
          if(providerMode==='baike-unavailable'){res.statusCode=403;res.end('{}');return;}
          if(providerMode==='baike-redirect'){res.statusCode=302;res.setHeader('Location','/forbidden-follow');res.end('{}');return;}
          if(providerMode==='baike-invalid'){res.end('{');return;}
          res.end(JSON.stringify({title:'帕丁顿熊',content:providerMode==='baike-no-image'?'作品正文，无图片':`![电影海报](${baikeCover}?x-bce-process=image/resize,w_500) ![站点图标](https://tracker.invalid/favicon.png)`}));return;
        }
        if(req.url === '/v1/tools/search' && providerMode.startsWith('baike')) {
          const content=`帕丁顿熊，2014年保罗·金执导电影。${providerMode==='baike-search-image'?`![电影海报](${baikeCover})`:''}`;
          res.end(JSON.stringify({results:[{url:baikeUrl+'?fromModule=search#1',title:'帕丁顿熊',content},{url:'https://baike.baidu.com/item/其他/123',title:'其他',content:'其他作品'},{url:baikeUrl+'?fromModule=duplicate',title:'重复出处',content}]}));return;
        }
        if(req.url === '/responses' && providerMode.startsWith('baike')) {
          if(providerMode==='baike-model-fail'){res.statusCode=500;res.end('{}');return;}
          const evidence=JSON.parse(body.input[1].content).evidence;assert.equal(evidence.length,2);assert.equal(evidence[0].url,new URL(baikeUrl).href);
          res.end(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({candidates:[{title:'帕丁顿熊',originalTitle:'Paddington',creator:'保罗·金',releaseYear:2014,description:'一只小熊来到伦敦。',sourceIndexes:[0],coverRef:baikeCover}]})}]}],usage:{input_tokens:200,output_tokens:120,output_tokens_details:{reasoning_tokens:0}}}));return;
        }
        if(req.url === '/v1/tools/search') { assert.equal(body.need_content,true); assert.ok(body.query.includes('-site:themoviedb.org')); res.end(JSON.stringify({results:[{url:'https://openlibrary.org/works/OL123W',title:'Open Library',content:'The Hobbit by J. R. R. Tolkien, 1937. A fantasy novel. ![cover](https://covers.openlibrary.org/b/id/42-L.jpg)'},{url:'http://untrusted.example',title:'Rejected',content:'Untrusted'}]}));return; }
        assert.equal(req.url, '/responses');
        if(body.text?.format?.name === 'library_media_candidates_v2') { assert.equal(body.model,'deepseek-flash'); assert.ok(body.input[0].content.includes('untrusted')); res.end(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({candidates:[{title:'The Hobbit',originalTitle:null,creator:'J. R. R. Tolkien',releaseYear:1937,description:'A fantasy novel.',sourceIndexes:[0,4],coverRef:'https://covers.openlibrary.org/b/id/42-L.jpg'},{title:'No invented cover',originalTitle:null,creator:null,releaseYear:null,description:null,sourceIndexes:[0],coverRef:'https://tracker.invalid/x.jpg'}]})}]}],usage:{input_tokens:200,output_tokens:120,output_tokens_details:{reasoning_tokens:0}}}));return; }
        assert.equal(body.reasoning.effort, 'none'); assert.equal(body.stream, false); assert.equal(body.text.format.type, 'json_schema');
        if(providerMode==="rate"){res.statusCode=429;res.end(JSON.stringify({error:"limited"}));return;}
        if(providerMode==="invalid"){res.end(JSON.stringify({status:"completed",output:[{type:"message",role:"assistant",content:[{type:"output_text",text:"not JSON"}]}]}));return;}
        if(providerMode==="incomplete"){res.end(JSON.stringify({status:"incomplete",output:[],usage:{input_tokens:20,output_tokens:8192}}));return;} res.end(JSON.stringify({ status: 'completed', output: [{ type: 'reasoning', content: [{ type: 'summary_text', text: 'DO NOT PARSE' }] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ candidates: [candidate], hasMore: false, unprocessedTextSpans: [] }) }] }], usage: { input_tokens: 300, output_tokens: 100, output_tokens_details: { reasoning_tokens: 0 } } })); });
    await new Promise<void>(r => provider.listen(0, '127.0.0.1', r));
    const addr = provider.address();
    if (!addr || typeof addr === 'string')
        throw Error();
    admin = await mysql.createConnection({ host: source.hostname, port: Number(source.port || 3306), user: decodeURIComponent(source.username), password: decodeURIComponent(source.password), multipleStatements: true });
    for (const name of [fresh, upgrade])
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await migrate(fresh);
    await migrate(upgrade, 0, 42);
    await admin.query("INSERT INTO library_items (user_id,type,title,status,version,created_at,updated_at) VALUES (1,'BOOK','Retained book','WANT',1,NOW(),NOW())");
    await migrate(upgrade, 43, 43);
    const url = new URL(sourceUrl);
    url.pathname = '/' + fresh;
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_SECRET = 'media-task-tests-only';
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_IMPORT_TOKEN_SECRET = 'test-preview-key-32-characters-minimum';
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${addr.port}`;
    [{ pool }, { app }, { signToken }, commands, split] = await Promise.all([import('../src/db/index.js'), import('../src/app.js'), import('../src/auth.js'), import('../src/library-import/commands.js'), import('../src/task-split/index.js')]);
    await pool.query("INSERT INTO users (id,username,display_name,timezone,created_at,updated_at) VALUES (992,'media-other','Other','Asia/Shanghai',NOW(),NOW())");
});
after(async () => { await pool?.end(); for (const name of [fresh, upgrade])
    await admin?.query(`DROP DATABASE IF EXISTS \`${name}\``); await admin?.end(); await new Promise<void>(r => provider?.close(() => r())); });
test('V43 fresh and V42 upgrade preserve existing item, default permission off', async () => { const [rows] = await admin.query(`SELECT title,description,release_year FROM \`${upgrade}\`.library_items`); assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{ title: 'Retained book', description: null, release_year: null }]); assert.equal((await api('/ai/settings')).data.allowTasks, 0); });
test('signed previews, source identity isolation, concurrent confirms, replay after expiry, edit preservation and unlink', async () => {
    const preview = await commands.resolvePreview(1, { provider: 'TMDB', entityType: 'MOVIE', sourceIdOrInput: '550' }, async () => sourceFixture);
    const body = { previewToken: preview.previewToken, fingerprint: preview.fingerprint, operationId: operation(), mode: 'create' as const, edits: { title: 'My title', description: '<b>My overview</b>' } };
    const tampered = await api('/library/import/confirm', { ...body, edits: { coverRef: 'https://tracker.invalid/x' } });
    assert.equal(tampered.status, 400);
    assert.equal((await api('/library/import/confirm', body, 992)).status, 404);
    const [a, b] = await Promise.all([api('/library/import/confirm', body), api('/library/import/confirm', { ...body, operationId: operation() })]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.data.id, b.data.id);
    assert.equal(await scalar('SELECT COUNT(*) FROM library_items'), 1);
    assert.equal(await scalar('SELECT COUNT(*) FROM library_item_sources'), 1);
    const id = a.data.id;
    assert.equal((await api(`/library/items/${id}`,{expectedVersion:1,type:"BOOK"},1,"PUT")).status,409);
    const detail = await api(`/library/items/${id}`);
    assert.equal(detail.data.item.description, 'My overview');
    assert.equal(detail.data.sources[0].stableSourceId, '550');
    assert.equal((await api('/library/items')).data.items[0].description, undefined);
    const receipt = await api(`/library/import/operations/${body.operationId}`);
    assert.equal(receipt.data.itemId, id);
    assert.equal((await api(`/library/import/operations/${body.operationId}`, undefined, 992)).data.status, 'not_found');
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60000;
    try {
        assert.equal((await commands.confirmImport(1, body) as any).id, id);
    }
    finally {
        Date.now = realNow;
    }
    await api(`/library/items/${id}`, { expectedVersion: 1, shortNote: 'Personal opinion', creator: 'My creator' }, 1, 'PUT');
    const changed = { ...sourceFixture, metadata: { ...sourceFixture.metadata, title: 'New source title', creator: 'New source creator', description: 'New source overview' } };
    const refresh = await commands.resolvePreview(1, { provider: 'TMDB', entityType: 'MOVIE', sourceIdOrInput: '550', targetItemId: id }, async () => changed);
    assert.equal(refresh.defaults.description, 'My overview');
    assert.equal(refresh.defaults.creator, 'My creator');
    await commands.confirmImport(1, { previewToken: refresh.previewToken, fingerprint: refresh.fingerprint, operationId: operation(), mode: 'refresh', targetItemId: id, expectedVersion: 2, edits: {} });
    const latest = await api(`/library/items/${id}`);
    assert.equal(latest.data.item.shortNote, 'Personal opinion');
    assert.equal(latest.data.item.creator, 'My creator');
    const unlink = await api(`/library/items/${id}/sources/${latest.data.sources[0].id}`, { operationId: operation(), expectedVersion: 3 }, 1, 'DELETE');
    assert.equal(unlink.status, 200);
    assert.equal((await api(`/library/items/${id}`)).data.sources.length, 0);
});
test('DeepSeek adapter contract, permission, generation identity and real transactional publication replay', async () => {
    const input = { operationId: operation(), draftId: operation(), text: '整理材料30分钟' };
    assert.equal((await api('/tasks/split/preview', input)).status, 403);
    assert.equal(calls, 0);
    const settings = (await api('/ai/settings')).data;
    await api('/ai/settings', { expectedVersion: settings.version, enabled: true, allowTasks: true }, 1, 'PUT');
    const [a, b] = await Promise.all([api('/tasks/split/preview', input), api('/tasks/split/preview', input)]);
    assert.ok([200, 202].includes(a.status));
    assert.ok([200, 202].includes(b.status));
    assert.equal(calls, 1);
    const generated = await api(`/tasks/split/preview/${input.operationId}`);
    assert.equal(generated.data.status, 'SUCCEEDED');
    assert.equal(generated.data.usage.reasoningTokens, 0);
    assert.equal(generated.data.result.candidates[0].estimatedMinutes, 30);
    await api('/tasks/split/preview', input);
    assert.equal(calls, 1);
    assert.equal((await api('/tasks/split/preview', { ...input, text: 'Changed' })).status, 409);
    assert.equal((await api(`/tasks/split/preview/${input.operationId}`, undefined, 992)).status, 403);
    const payload = { operationId: operation(), recordTimezone: 'Asia/Shanghai', title: 'Published split draft', priority: 3, difficulty: 2, estimatedMinutes: 30 };
    const [published, replayed] = await Promise.all([api('/tasks', payload), api('/tasks', payload)]);
    assert.equal(published.status, 200);
    assert.equal(replayed.status, 200);
    assert.equal(published.data.id, replayed.data.id);
    assert.equal((await api(`/tasks/split/publish-status/${payload.operationId}`)).data.taskId, published.data.id);
    assert.equal(await scalar("SELECT COUNT(*) FROM tasks WHERE title='Published split draft'"), 1);
});
test('expired pending derives unknown without GET writes; explicit POST cleans claim, no paid replay', async () => {
    const input = { operationId: operation(), draftId: operation(), text: '整理材料30分钟' };
    let release: () => void = () => { };
    const wait = new Promise<void>(r => { release = r; });
    const running = split.generateSplit(1, input, { provider: 'controlled', model: 'stub', generateStructured: async () => { await wait; return { payload: { candidates: [], hasMore: false, unprocessedTextSpans: [] } }; } });
    for (let i = 0; i < 30 && !(await scalar('SELECT COUNT(*) FROM ai_artifacts WHERE operation_id=?', [input.operationId])); i++)
        await new Promise(r => setTimeout(r, 10));
    await pool.query("UPDATE ai_artifacts SET created_at='2000-01-01 00:00:00',generation_context=JSON_SET(generation_context,'$.timeoutAt','2000-01-01T00:00:00.000Z') WHERE operation_id=?", [input.operationId]);
    assert.equal((await api(`/tasks/split/preview/${input.operationId}`)).data.status, 'FAILED_UNKNOWN');
    assert.equal(await scalar("SELECT COUNT(*) FROM ai_artifacts WHERE operation_id=? AND status='PENDING'", [input.operationId]), 1);
    await split.generateSplit(1, { ...input, operationId: operation() }, { provider: 'mock', model: 'stub', generateStructured: async () => ({ payload: { candidates: [], hasMore: false, unprocessedTextSpans: [] } }) });
    release();
    await running;
    assert.equal((await api(`/tasks/split/preview/${input.operationId}`)).data.status, 'FAILED_UNKNOWN');
});
test('source URL and IP allowlists, evidence guard, invalid JSON schema', async () => {
    const { extractIdentity, publicAddress } = await import('../src/library-import/providers.js');
    for (const ip of ['127.0.0.1', '10.0.0.1', '198.18.4.3', '::1', '::ffff:127.0.0.1', 'fc00::1'])
        assert.equal(publicAddress(ip), false);
    assert.equal(publicAddress('207.241.234.205'), true);
    assert.throws(() => extractIdentity('TMDB', 'MOVIE', 'https://api.themoviedb.org@127.0.0.1/movie/1'));
    assert.equal(extractIdentity('OPEN_LIBRARY', 'BOOK', '978-0140328721'), '9780140328721');
    const { validateEvidence } = await import('../src/task-split/contract.js');
    const c = validateEvidence({ ...candidate, dueAtLocal: '2026-11-03T10:00', dueEvidence: '明天10点' }, '明天10点整理材料30分钟', '2026-11-02');
    assert.equal(c.dueAtLocal, '2026-11-03T10:00');
    assert.equal(validateEvidence({ ...candidate, dueAtLocal: '2026-12-01', dueEvidence: '明天' }, '明天整理材料30分钟', '2026-11-02').dueAtLocal, null);
    const bad = await split.generateSplit(1, { operationId: operation(), draftId: operation(), text: 'input' }, { provider: 'mock', model: 'stub', generateStructured: async () => ({ payload: { candidates: [{ title: 'bad' }], hasMore: false, unprocessedTextSpans: [] } }) });
    assert.equal(bad.status, 'FAILED');
});
test('context overflow requires explicit selection; full-directory name checks include unavailable entries', async () => {
    await pool.query("INSERT INTO projects (user_id,name,status,archived_at,version,created_at,updated_at) VALUES (1,'Existing archived project',0,NOW(),1,NOW(),NOW())");
    const checked = await api('/tasks/split/name-check?kind=project&name=' + encodeURIComponent('Existing archived project'));
    assert.equal(checked.data.matches[0].available, false);
    for (let i = 0; i < 51; i++)
        await pool.query("INSERT INTO projects (user_id,name,status,version,created_at,updated_at) VALUES (1,?,0,1,NOW(),NOW())", ['Context project ' + i]);
    const context = await api('/tasks/split/context');
    assert.equal(context.data.selectionRequired, true);
    let calls = 0;
    const gateway = { provider: 'mock', model: 'stub', generateStructured: async () => { calls++; return { payload: { candidates: [], hasMore: false, unprocessedTextSpans: [] } }; } };
    const input = { operationId: operation(), draftId: operation(), text: 'Plan' };
    await assert.rejects(() => split.generateSplit(1, input, gateway), /Select at most 50/);
    assert.equal(calls, 0);
    const generated = await split.generateSplit(1, { ...input, contextSelectionIds: { projects: [context.data.projects[0].id], categories: [] } }, gateway);
    assert.equal(generated.status, 'SUCCEEDED');
    assert.equal(calls, 1);
    const settings = (await api('/ai/settings', undefined, 992)).data;
    await api('/ai/settings', { expectedVersion: settings.version, enabled: true, allowTasks: true }, 992, 'PUT');
    assert.equal((await api(`/tasks/split/preview/${input.operationId}`, undefined, 992)).status, 404);
});
test('daily quota rejects before provider call and unchanged operation still replays', async () => {
    const [rows] = await pool.query("SELECT * FROM ai_artifacts WHERE feature_key='TASK_SPLIT' AND status='SUCCEEDED' LIMIT 1");
    const template = (rows as any[])[0];
    for (let i = 0; i < 20; i++)
        await pool.query("INSERT INTO ai_artifacts (user_id,operation_id,artifact_type,feature_key,source_refs,source_versions,source_fingerprint,provider,model,prompt_version,generation_context,status,stale,created_at,updated_at) VALUES (1,?,'TASK_DRAFTS','TASK_SPLIT',JSON_ARRAY(),JSON_OBJECT(),?,'mock','stub','task-split-v1',?,'FAILED',0,?,?)", [operation(), template.source_fingerprint, JSON.stringify(template.generation_context), new Date(), new Date()]);
    const context = await split.splitContext(1);
    let calls = 0;
    await assert.rejects(() => split.generateSplit(1, { operationId: operation(), draftId: operation(), text: 'Quota', contextSelectionIds: { projects: [context.projects[0].id], categories: [] } }, { provider: 'mock', model: 'stub', generateStructured: async () => { calls++; return { payload: {} }; } }), /Daily generation quota/);
    assert.equal(calls, 0);
});

test("DeepSeek rate limits, invalid JSON, truncation and body cap never auto-retry",async()=>{
 const {deepseekGateway}=await import("../src/deepseek.js");const request={schemaName:"test",schema:{type:"object"},system:"Return JSON",user:"test"};
 for(const mode of ["rate","invalid","incomplete"]){providerMode=mode;const before=calls;await assert.rejects(()=>deepseekGateway.generateStructured(request));assert.equal(calls,before+1);}
 const before=calls;await assert.rejects(()=>deepseekGateway.generateStructured({...request,user:"a".repeat(32768)}),/32 KiB/);assert.equal(calls,before);providerMode="success";
});

test('Open Library editions canonicalize merged works; TV empty creators and Chinese overview have explicit fallbacks',async()=>{
 const {resolveMedia}=await import('../src/library-import/providers.js');
 const book=await resolveMedia('OPEN_LIBRARY','BOOK','9780140328721',async(url)=>{
  const paths:Record<string,unknown>={
   '/isbn/9780140328721.json':{key:'/books/OL4M',works:[{key:'/works/OL1W'}]},
   '/works/OL1W.json':{type:{key:'/type/redirect'},location:'/works/OL2W'},
   '/works/OL2W.json':{key:'/works/OL2W',title:'Merged work',description:{value:'<b>Plain description</b>'},authors:[{author:{key:'/authors/OL3A'}}],covers:[42]},
   '/authors/OL3A.json':{name:'First Author'},'/search.json':{docs:[{first_publish_year:1970}]}
  };assert.ok(url.pathname in paths,url.href);return {url,data:paths[url.pathname]};
 });
 assert.equal(book.stableSourceId,'OL2W');assert.equal(book.metadata.editionId,'OL4M');assert.equal(book.metadata.releaseYear,1970);assert.equal(book.metadata.creator,'First Author');assert.equal(book.metadata.description,'Plain description');assert.equal(book.metadata.coverRef,'https://covers.openlibrary.org/b/id/42-L.jpg');
 const tv=await resolveMedia('TMDB','SERIES','1',async(url)=>({url,data:{id:1,name:'Series',original_name:'Original',created_by:[],production_companies:[{name:'Studio'}],overview:url.searchParams.get('language')==='en-US'?'English overview':'',poster_path:'/safe.jpg',first_air_date:'2001-01-01',genres:[{id:16}]}}));
 assert.equal(tv.metadata.creator,'Studio');assert.equal(tv.metadata.creatorRole,'production_company');assert.equal(tv.metadata.descriptionLanguage,'en-US');assert.equal(tv.metadata.releaseYear,2001);assert.equal(tv.metadata.isAnimation,true);
});

test('Library AI search enforces its permission, persists candidates, filters unverified citations, and replays by operation',async()=>{
 const ai=await import('../src/library-import/ai-search.js');
 const settings=(await api('/ai/settings')).data;
 await api('/ai/settings',{expectedVersion:settings.version,enabled:true,allowLibrary:false},1,'PUT');
 const input={operationId:operation(),query:'The Hobbit',mediaType:'BOOK' as const};
 const before=calls;
 await assert.rejects(()=>ai.searchLibrary(1,input),/permission/);
 const changed=(await api('/ai/settings')).data;
 await api('/ai/settings',{expectedVersion:changed.version,enabled:true,allowLibrary:true},1,'PUT');
 const first=await ai.searchLibrary(1,input);
 const replay=await ai.searchLibrary(1,input);
 assert.equal(calls,before+2);
 assert.equal(first.status,'SUCCEEDED');assert.deepEqual((first.result as any).candidates[0].sources,[{url:'https://openlibrary.org/works/OL123W',title:'Open Library'}]);
 assert.equal((replay.result as any).candidates[0].title,'The Hobbit');
 assert.equal((await api(`/library/import/ai-search/${input.operationId}`)).data.status,'SUCCEEDED');
 assert.equal((await api(`/library/import/ai-search/${input.operationId}`,undefined,992)).status,403);
 await assert.rejects(()=>ai.searchLibrary(1,{...input,query:'Different title'}),/different parameters/);
});

test('AI candidates import directly, preserve covers/provenance and survive reentry without TMDB; concurrent confirms reuse one item', async()=>{
 const ai=await import('../src/library-import/ai-search.js');
 const input={operationId:operation(),query:'The Hobbit direct',mediaType:'BOOK'};
 const before=calls;
 const first=await ai.searchLibrary(1,input);
 assert.equal(first.status,'SUCCEEDED');
 assert.equal((first.result as any).candidates[0].coverRef,'https://covers.openlibrary.org/b/id/42-L.jpg');
 assert.equal((first.result as any).candidates[1].coverRef,null);
 const previewResponse=await api(`/library/import/ai-search/${input.operationId}/preview`,{candidateIndex:0});
 assert.equal(previewResponse.status,200);
 const preview=previewResponse.data;
 assert.equal(preview.source.provider,'WEB_SEARCH');
 const body={operationId:operation(),previewToken:preview.previewToken,fingerprint:preview.fingerprint,mode:'create',edits:{title:'Reviewed Hobbit'}};
 assert.equal((await api('/library/import/confirm',{...body,coverRef:'https://tracker.invalid/x.jpg'})).status,400);
 const [a,b]=await Promise.all([api('/library/import/confirm',body),api('/library/import/confirm',{...body,operationId:operation()})]);
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.data.id,b.data.id);
 const detail=(await api(`/library/items/${a.data.id}`)).data;
 assert.equal(detail.item.coverRef,preview.source.metadata.coverRef);assert.equal(detail.item.title,'Reviewed Hobbit');assert.equal(detail.item.shortNote,null);
 assert.equal(detail.sources[0].provider,'WEB_SEARCH');assert.equal(detail.sources[0].references[0].url,'https://openlibrary.org/works/OL123W');
 assert.equal((await api(`/library/import/ai-search/${input.operationId}/preview`,{candidateIndex:5})).status,400);
 const settings=(await api('/ai/settings',undefined,992)).data;await api('/ai/settings',{expectedVersion:settings.version,enabled:true,allowLibrary:true},992,'PUT');
 assert.equal((await api(`/library/import/ai-search/${input.operationId}/preview`,{candidateIndex:0},992)).status,404);
 const refreshed=await api(`/library/import/ai-search/${input.operationId}/preview`,{candidateIndex:0,targetItemId:a.data.id});
 assert.equal(refreshed.status,200);assert.equal(refreshed.data.defaults.title,'Reviewed Hobbit');
 const noCover=await api('/library/import/confirm',{operationId:operation(),previewToken:refreshed.data.previewToken,fingerprint:refreshed.data.fingerprint,mode:'refresh',targetItemId:a.data.id,expectedVersion:refreshed.data.expectedVersion,edits:{},omitCover:true});assert.equal(noCover.status,200);assert.equal((await api(`/library/items/${a.data.id}`)).data.item.coverRef,null);
 const afterOmit=await api(`/library/import/ai-search/${input.operationId}/preview`,{candidateIndex:0,targetItemId:a.data.id});assert.equal(afterOmit.data.defaults.coverRef,null,'explicitly omitted cover remains a user edit in later three-way refresh');assert.equal(afterOmit.data.source.metadata.coverRef,'https://covers.openlibrary.org/b/id/42-L.jpg');
 assert.equal(calls,before+2,'preview/confirm/refresh never fetch external metadata');
});

test('web evidence URL boundaries reject private/tracking covers and only identify supported image references',async()=>{
 const {referenceUrl,coverUrl,evidenceCovers}=await import('../src/library-import/web-search.js');
 for(const value of ['http://example.com','https://127.0.0.1/x','https://10.0.0.1/x','https://user:password@example.com/x','https://www.douban.com/x','https://api.themoviedb.org/x']) assert.equal(referenceUrl(value),null,value);
 assert.equal(referenceUrl('https://publisher.example/book?utm_source=track#part'),'https://publisher.example/book');
 for(const value of ['https://tracker.invalid/x.jpg','https://upload.wikimedia.org/x.svg/a.png','https://books.google.com/books/content?id=1']) assert.equal(coverUrl(value),null,value);
 assert.deepEqual(evidenceCovers('![x](https://covers.openlibrary.org/b/id/42-L.jpg) https://tracker.invalid/x.jpg'),['https://covers.openlibrary.org/b/id/42-L.jpg']);
});

test('Library unknown searches recover read-only, clean expired claims explicitly and never charge on replay',async()=>{
 const ai=await import('../src/library-import/ai-search.js');
 const input={operationId:operation(),query:'Expired library search',mediaType:'GAME'};
 let attempts=0;const gateway={provider:'mock',model:'bounded-fixture',search:async()=>{attempts++;return {payload:{candidates:[]},evidence:[],searchCalls:1,fetchCalls:0};}};
 await ai.searchLibrary(992,input,gateway);
 await pool.query("UPDATE ai_artifacts SET status='PENDING',created_at=?,generation_context=JSON_SET(generation_context,'$.timeoutAt','2000-01-01T00:00:00Z') WHERE user_id=992 AND operation_id=?",[new Date(Date.now()-95000),input.operationId]);
 assert.equal((await ai.getLibrarySearch(992,input.operationId)).status,'FAILED_UNKNOWN');
 const [[stored]]=await pool.query<any[]>("SELECT status FROM ai_artifacts WHERE user_id=992 AND operation_id=?",[input.operationId]);assert.equal(stored.status,'PENDING');
 await ai.searchLibrary(992,input,gateway);assert.equal(attempts,1);
 const next=await ai.searchLibrary(992,{...input,operationId:operation()},gateway);assert.equal(next.status,'SUCCEEDED');assert.equal(attempts,2);
 const failed=await ai.searchLibrary(992,{...input,operationId:operation()},{...gateway,search:async()=>{attempts++;throw Object.assign(Error('provider timed out after search'),{searchCalls:1});}});
 assert.equal(failed.status,'FAILED_UNKNOWN');assert.equal(failed.searchCalls,1);const before=attempts;
 await ai.searchLibrary(992,{...input,operationId:failed.operationId},gateway);assert.equal(attempts,before);
});

test('metadata search no longer Fetches Baike; images are discovered only after explicit work selection',async()=>{
 const ai=await import('../src/library-import/ai-search.js');providerMode='baike';
 try {const before=calls;const input={operationId:operation(),query:'帕丁顿熊',mediaType:'MOVIE'};const result=await ai.searchLibrary(1,input);assert.equal(result.status,'SUCCEEDED');assert.equal(result.fetchCalls,0);assert.equal(calls,before+2);assert.equal((result.result as any).candidates[0].coverRef,null);await ai.searchLibrary(1,input);assert.equal(calls,before+2);}finally{providerMode='success';}
});
test('Baike images require dedicated image paths AND matching Baike article evidence',async()=>{
 const {baikeArticle,coverUrl,evidenceCovers}=await import('../src/library-import/web-search.js');
 assert.equal(baikeArticle(baikeUrl+'?track=1#cover'),new URL(baikeUrl).href);
 for(const u of ['https://baike.baidu.com.evil.example/item/a/1','https://baike.baidu.com/tashuolist/a/1','https://baike.baidu.com@127.0.0.1/item/a'])assert.equal(baikeArticle(u),null);
 for(const u of ['https://bkimg.cdn.bcebos.com/favicon.png','https://bkimg.cdn.bcebos.com.evil.example/pic/1234567890123456','https://imgsrc.baidu.com/forum/pic/item/1234567890123456.jpg',baikeCover+'.svg'])assert.equal(coverUrl(u),null);
 assert.equal(coverUrl(baikeCover+'?x-bce-process=image/resize,w_500'),baikeCover);
 assert.deepEqual(evidenceCovers(`![海报](${baikeCover})`,'https://untrusted.example/a'),[]);
 assert.deepEqual(evidenceCovers(`![海报](${baikeCover})`,baikeUrl),[baikeCover]);
});

test('cover artifacts bind user/work, preserve zero-token usage and preview choice; duplicate confirmation stays idempotent',async()=>{
 const ai=await import('../src/library-import/ai-search.js'),covers=await import('../src/library-import/ai-covers.js');
 const parent=operation();const payload={title:'Cover flow unique book',originalTitle:null,creator:null,releaseYear:2000,description:null,coverRef:null,sourceIndexes:[0]};await ai.searchLibrary(1,{operationId:parent,query:'cover flow',mediaType:'BOOK'},{provider:'mock',model:'fixture',search:async()=>({payload:{candidates:[payload,{...payload,title:'Other book'}]},evidence:[{url:'https://standardebooks.org/ebooks/a/book',title:'Book source',content:'Book',covers:[]}],searchCalls:1,fetchCalls:0})});
 let probes=0;const selected={id:'a'.repeat(32),imageUrl:'https://standardebooks.org/ebooks/a/book/downloads/cover.jpg',sourcePageUrl:'https://standardebooks.org/ebooks/a/book',sourceTitle:'Reviewed book',extractionMethod:'PAGE_META',kind:'COVER' as const,width:1400,height:2100,needsReview:true as const};
 const discover=async()=>{probes++;return {candidates:[selected],failures:[],pageCalls:1,imageCalls:1,searchCalls:0};};
 const input={operationId:operation(),candidateIndex:0};const [a,b]=await Promise.all([covers.findLibraryCovers(1,parent,input,undefined,discover),covers.findLibraryCovers(1,parent,input,undefined,discover)]);
 assert.ok([a.status,b.status].includes('SUCCEEDED'));assert.equal(probes,1);
 const read=await covers.getLibraryCovers(1,parent,input.operationId);assert.deepEqual(read.usage,{inputTokens:0,outputTokens:0,reasoningTokens:0});assert.equal(read.pageCalls,1);
 await assert.rejects(()=>covers.getLibraryCovers(992,parent,input.operationId),/found/);
 await assert.rejects(()=>covers.findLibraryCovers(1,parent,{...input,candidateIndex:1},undefined,discover),/different parameters/);
 assert.equal((await api(`/library/import/ai-search/${parent}/preview`,{candidateIndex:1,coverOperationId:input.operationId,coverCandidateId:selected.id})).status,409);
 assert.equal((await api(`/library/import/ai-search/${parent}/preview`,{candidateIndex:0,coverCandidateId:selected.id})).status,400);
 const preview=await api(`/library/import/ai-search/${parent}/preview`,{candidateIndex:0,coverOperationId:input.operationId,coverCandidateId:selected.id});assert.equal(preview.status,200);assert.equal(preview.data.source.metadata.coverRef,selected.imageUrl);
 const body={operationId:operation(),mode:'create',previewToken:preview.data.previewToken,fingerprint:preview.data.fingerprint,edits:{}};
 const [one,two]=await Promise.all([api('/library/import/confirm',body),api('/library/import/confirm',{...body,operationId:operation()})]);assert.equal(one.status,200);assert.equal(one.data.id,two.data.id);
 const detail=(await api(`/library/items/${one.data.id}`)).data;
 assert.equal(detail.item.coverRef,selected.imageUrl);assert.ok(detail.sources[0].references.some((row:any)=>row.url===selected.sourcePageUrl));
 assert.equal(probes,1);await covers.findLibraryCovers(1,parent,input,undefined,discover);assert.equal(probes,1);
 const failedInput={operationId:operation(),candidateIndex:0};const failed=await covers.findLibraryCovers(1,parent,failedInput,undefined,async()=>{throw Object.assign(Error('timeout'),{pageCalls:2,imageCalls:1,searchCalls:1});});assert.equal(failed.status,'FAILED_UNKNOWN');assert.equal(failed.searchCalls,1);assert.equal(failed.usage.inputTokens,0);
 await pool.query("UPDATE ai_artifacts SET status='PENDING',created_at=?,generation_context=JSON_SET(generation_context,'$.timeoutAt','2000-01-01T00:00:00Z') WHERE operation_id=?",[new Date(Date.now()-50000),failedInput.operationId]);
 assert.equal((await covers.getLibraryCovers(1,parent,failedInput.operationId)).status,'FAILED_UNKNOWN');assert.equal(await scalar("SELECT COUNT(*) FROM ai_artifacts WHERE operation_id=? AND status='PENDING'",[failedInput.operationId]),1);
 await covers.findLibraryCovers(1,parent,{operationId:operation(),candidateIndex:0},undefined,discover);assert.equal(probes,2);
});
