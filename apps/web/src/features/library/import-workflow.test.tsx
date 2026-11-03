// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {MemoryRouter} from "react-router";
import type {Request} from "../../app/api";
import {MediaImportWorkflow} from "./import-workflow";
beforeEach(()=>localStorage.clear());afterEach(cleanup);
const metadata={title:"Test movie",originalTitle:"Test",creator:null,releaseYear:2026,description:"Source text",coverRef:null,descriptionLanguage:"en-US",isAnimation:false,creatorRole:null};
const preview={previewToken:"signed",fingerprint:"f".repeat(64),expiresAt:Date.now()+600000,source:{metadata,canonicalUrl:"https://www.themoviedb.org/movie/550",attribution:"TMDB"},existingItemId:null,defaults:metadata,changes:[]};
describe("Library import draft recovery",()=>{
 it("previews and imports an AI candidate with cover without TMDB or Open Library API calls",async()=>{
  const op=crypto.randomUUID();const candidateResult={operationId:op,query:"The Hobbit",mediaType:"BOOK",status:"SUCCEEDED",searchCalls:1,result:{candidates:[{title:"The Hobbit",originalTitle:null,creator:"Tolkien",releaseYear:1937,description:"A novel",coverRef:"https://covers.openlibrary.org/b/id/42-L.jpg",sources:[{url:"https://publisher.example/book",title:"Publisher"}]}]}};
  const aiPreview={...preview,source:{...preview.source,metadata:{...preview.source.metadata,coverRef:"https://covers.openlibrary.org/b/id/42-L.jpg"}}};
  const onSaved=vi.fn();const request=vi.fn(async(path:string,init?:RequestInit)=>{if(path.endsWith('/covers'))return {operationId:crypto.randomUUID(),status:'SUCCEEDED',result:{candidates:[],failures:[]},pageCalls:0,imageCalls:0,searchCalls:0};if(path.endsWith('/ai-search'))return {...candidateResult,operationId:JSON.parse(String(init?.body)).operationId};if(path.endsWith('/preview'))return aiPreview;if(path.includes('/operations/'))return {status:'not_found'};if(path.endsWith('/confirm'))return {id:42};throw Error(path);}) as unknown as Request;
  render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("来源与类型"),{target:{value:"WEB_SEARCH:BOOK"}});
  fireEvent.change(screen.getByLabelText("AI 搜索词"),{target:{value:"The Hobbit"}});fireEvent.click(screen.getByRole("button",{name:"AI 搜索"}));await screen.findByText("Publisher");fireEvent.click(screen.getByText("预览并查找封面"));await screen.findByText('确认保存资料');
  expect((screen.getByAltText('来源封面') as HTMLImageElement).src).toContain('42-L.jpg');
  fireEvent.click(screen.getByText('确认保存资料'));await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(42));
  expect(localStorage.getItem('wb.library-import.v1:7')).toBeNull();
  expect(localStorage.getItem('wb.library-ai-search.v1:7')).toBeNull();
  expect((request as any).mock.calls.every((args:any[])=>!args[0].includes('/resolve')&&!args[0].includes('/import/search?'))).toBe(true);
 });
 it.each([false,true])("clears an acknowledged TMDB draft, including an existing source (existing=%s)",async(existing)=>{
  const onSaved=vi.fn();const request=vi.fn(async(path:string)=>{if(path.endsWith('/resolve'))return {...preview,existingItemId:existing?42:null};if(path.includes('/operations/'))return {status:'not_found'};if(path.endsWith('/confirm'))return {id:42,existing};throw Error(path);}) as unknown as Request;
  const mounted=render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('来源与类型'),{target:{value:'TMDB:MOVIE'}});
  fireEvent.change(screen.getByLabelText('搜索词或来源网址'),{target:{value:'550'}});fireEvent.click(screen.getByText('按网址 / ID 解析'));await screen.findByText('确认保存资料');
  fireEvent.click(screen.getByText('确认保存资料'));await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(42));
  expect(localStorage.getItem('wb.library-import.v1:7')).toBeNull();
  mounted.unmount();render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);
  expect((screen.getByLabelText('AI 搜索词') as HTMLInputElement).value).toBe('');
  expect(screen.queryByText('确认保存资料')).toBeNull();
 });
 it("removes legacy committed drafts and only their associated AI search",()=>{
  localStorage.setItem('wb.library-import.v1:7',JSON.stringify({schemaVersion:1,revision:'old',provider:'WEB_SEARCH',entityType:'MOVIE',input:'Saved movie',committedId:42,aiSelection:{operationId:'saved-search',candidateIndex:0}}));
  localStorage.setItem('wb.library-ai-search.v1:7',JSON.stringify({operationId:'saved-search',status:'SUCCEEDED'}));
  localStorage.setItem('wb.library-ai-search.v1:8',JSON.stringify({operationId:'other-user',status:'SUCCEEDED'}));
  render(<MemoryRouter><MediaImportWorkflow request={vi.fn()} userId={7} onConfirm={vi.fn()} onSaved={vi.fn()}/></MemoryRouter>);
  expect(localStorage.getItem('wb.library-import.v1:7')).toBeNull();
  expect(localStorage.getItem('wb.library-ai-search.v1:7')).toBeNull();
  expect(localStorage.getItem('wb.library-ai-search.v1:8')).not.toBeNull();
  fireEvent.change(screen.getByLabelText('AI 搜索词'),{target:{value:'Next work'}});
  expect(screen.queryByRole('alert')).toBeNull();
 });
 it("retains source failure input across unmount and never creates on resolve",async()=>{
  const request=vi.fn(async()=>{throw Error("source unavailable");}) as unknown as Request;
  const mounted=render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={vi.fn()}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("来源与类型"),{target:{value:"TMDB:MOVIE"}});
  fireEvent.change(screen.getByLabelText("搜索词或来源网址"),{target:{value:"550"}});fireEvent.click(screen.getByText("按网址 / ID 解析"));expect(await screen.findByRole("alert")).toBeTruthy();
  mounted.unmount();render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={vi.fn()}/></MemoryRouter>);expect((screen.getByLabelText("搜索词或来源网址") as HTMLInputElement).value).toBe("550");expect((request as any).mock.calls.every((args:any[])=>!args[0].endsWith('/confirm'))).toBe(true);
 });
 it("freezes a lost acknowledgment and recovers through receipt GET without another confirmation",async()=>{
  let committed=false,posts=0;const onSaved=vi.fn();
  const request=vi.fn(async(path:string)=>{if(path.endsWith('/resolve'))return preview;if(path.includes('/operations/'))return committed?{status:'committed',itemId:42}:{status:'not_found'};if(path.endsWith('/confirm')){posts++;committed=true;throw Error('lost acknowledgment');}throw Error(path);}) as unknown as Request;
  const mounted=render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("来源与类型"),{target:{value:"TMDB:MOVIE"}});
  fireEvent.change(screen.getByLabelText("搜索词或来源网址"),{target:{value:"550"}});fireEvent.click(screen.getByText("按网址 / ID 解析"));await screen.findByText('确认保存资料');fireEvent.click(screen.getByText('确认保存资料'));await screen.findByRole('alert');
  const frozen=JSON.parse(localStorage.getItem('wb.library-import.v1:7')!).frozen;expect(frozen.operationId).toBeTruthy();mounted.unmount();
  const resumed=render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(42));expect(posts).toBe(1);expect(localStorage.getItem('wb.library-import.v1:7')).toBeNull();
  resumed.unmount();render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);fireEvent.change(screen.getByLabelText('AI 搜索词'),{target:{value:'Next work'}});expect(JSON.parse(localStorage.getItem('wb.library-import.v1:7')!).frozen).toBeUndefined();
 });
 it.each(['not_found','failed'])('keeps an unresolved frozen draft after read-only recovery (%s)',async(status)=>{
  const frozen={operationId:crypto.randomUUID()};const saved={schemaVersion:1,revision:'pending',provider:'TMDB',entityType:'MOVIE',input:'550',preview,edits:metadata,frozen};
  localStorage.setItem('wb.library-import.v1:7',JSON.stringify(saved));const request=vi.fn(async()=>({status}));
  render(<MemoryRouter><MediaImportWorkflow request={request as unknown as Request} userId={7} onConfirm={vi.fn()} onSaved={vi.fn()}/></MemoryRouter>);
  await waitFor(()=>expect((screen.getByRole('button',{name:'查询结果 / 重试原确认'}) as HTMLButtonElement).disabled).toBe(false));
  expect(request).toHaveBeenCalledExactlyOnceWith(`/api/library/import/operations/${frozen.operationId}`);
  expect(JSON.parse(localStorage.getItem('wb.library-import.v1:7')!)).toEqual(saved);
 });
 it.each([false,true])('handles a late success without deleting a newer tab draft (newer=%s)',async(newer)=>{
  let finish!:(value:{id:number})=>void;const response=new Promise<{id:number}>(resolve=>{finish=resolve;});const onSaved=vi.fn();
  const request=vi.fn(async(path:string)=>{if(path.endsWith('/resolve'))return preview;if(path.includes('/operations/'))return {status:'not_found'};if(path.endsWith('/confirm'))return response;throw Error(path);}) as unknown as Request;
  const mounted=render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('来源与类型'),{target:{value:'TMDB:MOVIE'}});fireEvent.change(screen.getByLabelText('搜索词或来源网址'),{target:{value:'550'}});fireEvent.click(screen.getByText('按网址 / ID 解析'));await screen.findByText('确认保存资料');fireEvent.click(screen.getByText('确认保存资料'));
  await waitFor(()=>expect((request as any).mock.calls.some((args:any[])=>args[0].endsWith('/confirm'))).toBe(true));
  const next={...JSON.parse(localStorage.getItem('wb.library-import.v1:7')!),revision:'another-tab',input:'Next work',frozen:undefined};if(newer)localStorage.setItem('wb.library-import.v1:7',JSON.stringify(next));
  mounted.unmount();await act(async()=>{finish({id:42});await response;});
  expect(onSaved).not.toHaveBeenCalled();
  if(newer)expect(JSON.parse(localStorage.getItem('wb.library-import.v1:7')!)).toEqual(JSON.parse(JSON.stringify(next)));else expect(localStorage.getItem('wb.library-import.v1:7')).toBeNull();
 });
 it('preserves a newer AI search when cleaning a legacy committed import',()=>{
  const search={operationId:'new-search',status:'SUCCEEDED',query:'New book',mediaType:'BOOK',result:{candidates:[]}};
  localStorage.setItem('wb.library-import.v1:7',JSON.stringify({schemaVersion:1,revision:'old',provider:'WEB_SEARCH',entityType:'BOOK',input:'Saved book',committedId:42,aiSelection:{operationId:'old-search',candidateIndex:0}}));localStorage.setItem('wb.library-ai-search.v1:7',JSON.stringify(search));
  render(<MemoryRouter><MediaImportWorkflow request={vi.fn()} userId={7} onConfirm={vi.fn()} onSaved={vi.fn()}/></MemoryRouter>);
  expect(localStorage.getItem('wb.library-import.v1:7')).toBeNull();expect(JSON.parse(localStorage.getItem('wb.library-ai-search.v1:7')!)).toEqual(search);
 });
});
