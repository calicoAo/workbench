import assert from "node:assert/strict";
import { test } from "node:test";
import https from "node:https";
import { Resolver } from "node:dns";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
// Pure Library evidence tests do not connect to a database.
process.env.DATABASE_URL ??= 'mysql://unused/unused_test';process.env.JWT_SECRET ??= 'unused-test-secret';
const { coverPageUrl, imageForPage, extractPageCovers, imageDimensions, discoverCovers, readCoverResource } = await import('../src/library-import/cover-discovery.js');
const page = new URL('https://standardebooks.org/ebooks/a/book');
const png = Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(300,16);png.writeUInt32BE(450,20);
test('HTML extraction decodes metadata, keeps functional image queries, limits CDN ownership, and never executes scripts',()=>{
 const html=`<meta content="/ebooks/a/book/cover.jpg?version=1&amp;size=large" property="og:image"><meta name="twitter:image" content="https://tracker.invalid/cover.jpg"><script type="application/ld+json">{"@type":"Book","image":{"url":"/ebooks/a/book/second.png"}}</script><img alt="logo cover" src="/logo.png"><img alt="Book cover" src="/third.webp"><meta property="og:image" content="https://127.0.0.1/x.jpg">`;
 assert.deepEqual(extractPageCovers(html,page).map(v=>v.imageUrl),['https://standardebooks.org/ebooks/a/book/cover.jpg?version=1&size=large','https://standardebooks.org/ebooks/a/book/second.png','https://standardebooks.org/third.webp']);
 assert.equal(coverPageUrl('https://standardebooks.org/ebooks/a/book/text/colophon')?.href,page.href);assert.equal(coverPageUrl('https://standardebooks.org/ebooks/a/book/translator/text/colophon')?.pathname,'/ebooks/a/book/translator');assert.equal(coverPageUrl('https://zh.m.wikipedia.org/zh-cn/Example')?.href,'https://zh.wikipedia.org/wiki/Example');assert.equal(coverPageUrl('https://store.steampowered.com/news/1'),null);assert.equal(coverPageUrl('https://standardebooks.org.evil.example/ebooks/a'),null);
 assert.equal(imageForPage('https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/413150/header.jpg?t=1',new URL('https://store.steampowered.com/app/413150/'))?.search,'?t=1');
 assert.equal(imageForPage('https://shared.akamai.steamstatic.com.evil.example/x.jpg',new URL('https://store.steampowered.com/app/413150/')),null);
 assert.equal(imageForPage('http://standardebooks.org/cover.jpg',page),null);assert.equal(imageForPage('/cover.svg',page),null);
});
test('image MIME and magic must agree; tiny and malformed files are rejected',()=>{
 assert.deepEqual(imageDimensions(png,'image/png'),{width:300,height:450});assert.equal(imageDimensions(png,'image/jpeg'),null);assert.equal(imageDimensions(Buffer.from('<html>error</html>'),'image/jpeg'),null);
});
test('multi-source discovery validates real evidence, bounds attempts, and has zero model calls',async()=>{
 let pages=0,images=0,searches=0;
 const result=await discoverCovers({title:'Test Book',originalTitle:null,creator:'Author',releaseYear:2000,sources:[{url:page.href,title:'Test Book'}]},'BOOK',AbortSignal.timeout(2000),async(url,kind)=>{if(kind==='page'){pages++;return {url,bytes:Buffer.from('<meta property="og:image" content="/cover.png">'),contentType:'text/html'};}images++;return {url,bytes:png,contentType:'image/png'};},async()=>{searches++;return {results:[]};});
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].sourcePageUrl,page.href);assert.equal(result.candidates[0].width,300);assert.equal(pages,1);assert.equal(images,1);assert.equal(searches,0);
});
test('one supplemental search only accepts title-matched supported pages; failed images never become candidates',async()=>{
 let searches=0;const seen:string[]=[];
 const result=await discoverCovers({title:'Test Book',originalTitle:null,creator:null,releaseYear:null,sources:[]},'BOOK',AbortSignal.timeout(2000),async(url,kind)=>{seen.push(url.href);return {url,bytes:kind==='page'?Buffer.from('<meta property="og:image" content="/cover.jpg">'):Buffer.from('bad image'),contentType:kind==='page'?'text/html':'image/jpeg'};},async()=>{searches++;return {results:[{url:'https://standardebooks.org/ebooks/a/wrong',title:'Unrelated work'},{url:page.href,title:'Test Book by Author'},{url:'https://127.0.0.1/x',title:'Test Book'}]};});
 assert.equal(searches,1);assert.equal(result.candidates.length,0);assert.equal(result.pageCalls,1);assert.ok(!seen.some(v=>v.includes('/wrong')));
});
test('public reader refuses unsupported origins before networking and propagates cancellation',async()=>{
 await assert.rejects(()=>readCoverResource(new URL('https://127.0.0.1/x'),'page',page,AbortSignal.timeout(1000)),/Unsupported/);
 await assert.rejects(()=>readCoverResource(new URL('https://tracker.invalid/a.jpg'),'image',page,AbortSignal.timeout(1000)),/Unsupported/);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>discoverCovers({title:'x',originalTitle:null,creator:null,releaseYear:null,sources:[{url:page.href,title:'x'}]},'BOOK',controller.signal));
});

test('socket reader refuses private DNS, off-source redirects, rejected responses and oversized streams', async t => {
 let responseCase = 'private', requests = 0;
 t.mock.method(Resolver.prototype, 'resolve4', ((_host: string, callback: any) => {queueMicrotask(() => callback(null,['127.0.0.1']));}) as any);
 t.mock.method(https, 'get', ((_url: URL, options: any, listener: (response: any) => void) => {
  requests++;
  const req = new EventEmitter();
  queueMicrotask(() => {
   if(responseCase === 'private') {
    options.lookup('127.0.0.1', {all:true}, (error: Error | null) => req.emit('error', error ?? Error('Private address was accepted')));
    return;
   }
   const response = Object.assign(Readable.from([responseCase === 'oversize' ? Buffer.alloc(2 * 1024 * 1024 + 1) : Buffer.from('page')]), {
    statusCode: responseCase === 'redirect' ? 302 : responseCase === 'denied' ? 403 : 200,
    headers: {'content-type':'text/html', ...(responseCase === 'redirect' ? {location:'https://127.0.0.1/private'} : {}), ...(responseCase === 'compressed' ? {'content-encoding':'gzip'} : {})}
   });
   listener(response);
  });
  return req;
 }) as any);
 await assert.rejects(() => readCoverResource(page, 'page', page, AbortSignal.timeout(3000)), /Non-public/);
 for(const value of ['redirect','denied','compressed','oversize']) {
  responseCase = value;
  await assert.rejects(() => readCoverResource(page, 'page', page, AbortSignal.timeout(3000)), /Unsupported|unavailable|too large/);
 }
 assert.equal(requests,5,'Rejected redirect must not start another socket');
});
test('a mixed manga/animation encyclopedia image stays unconfirmed and searches for an official animation visual',async()=>{
 const result=await discoverCovers({title:'Frieren',originalTitle:'葬送のフリーレン',creator:null,releaseYear:2023,sources:[{url:'https://en.wikipedia.org/wiki/Frieren',title:'Frieren'}]},'SERIES',AbortSignal.timeout(1000),async(url,kind)=>({url,bytes:kind==='page'?Buffer.from(`<meta property="og:image" content="${url.hostname==='en.wikipedia.org'?'https://upload.wikimedia.org/wikipedia/en/cover.jpg':'https://frieren-anime.jp/poster.png'}">`):png,contentType:kind==='page'?'text/html':'image/png'}),async()=>({results:[{url:'https://frieren-anime.jp/',title:'葬送のフリーレン アニメ公式'}]}));
 assert.equal(result.searchCalls,1);assert.equal(result.candidates[0].kind,'POSTER');assert.equal(result.candidates[0].sourcePageUrl,'https://frieren-anime.jp/');assert.equal(result.candidates[1].kind,'UNCONFIRMED');
});

test('long titles leave the complete bounded search scope intact', async()=>{
 let query = '';
 await discoverCovers({title:'Book '.repeat(40),originalTitle:null,creator:null,releaseYear:null,sources:[]},'BOOK',AbortSignal.timeout(1000),async()=>{throw Error('No pages expected')},async value=>{query=value;return {results:[]};});
 assert.ok(query.length<=128);assert.ok(query.endsWith('site:gutenberg.org/ebooks)'));
});
