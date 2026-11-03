// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {MemoryRouter} from "react-router";
import type {Request} from "../../app/api";
import {MediaImportWorkflow} from "./import-workflow";
beforeEach(()=>localStorage.clear());afterEach(cleanup);
const metadata={title:"Test movie",originalTitle:"Test",creator:null,releaseYear:2026,description:"Source text",coverRef:null,descriptionLanguage:"en-US",isAnimation:false,creatorRole:null};
const preview={previewToken:"signed",fingerprint:"f".repeat(64),expiresAt:Date.now()+600000,source:{metadata,canonicalUrl:"https://www.themoviedb.org/movie/550",attribution:"TMDB"},existingItemId:null,defaults:metadata,changes:[]};
describe("Library import draft recovery",()=>{
 it("places AI candidate discovery before the existing trusted-source search",async()=>{
  const candidateResult={operationId:crypto.randomUUID(),query:"The Hobbit",mediaType:"BOOK",status:"SUCCEEDED",searchCalls:1,fetchCalls:0,result:{candidates:[{title:"The Hobbit",originalTitle:null,creator:"J. R. R. Tolkien",releaseYear:1937,description:null,sources:[{url:"https://openlibrary.org/works/OL123W",title:"Open Library"}]}]}};
  const request=vi.fn(async(path:string)=>{if(path.endsWith('/ai-search'))return candidateResult;throw Error(path);}) as unknown as Request;
  render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={vi.fn()}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("来源与类型"),{target:{value:"OPEN_LIBRARY:BOOK"}});
  fireEvent.change(screen.getByPlaceholderText("输入书名、电影或剧集名称"),{target:{value:"The Hobbit"}});fireEvent.click(screen.getByRole("button",{name:"AI 搜索"}));await screen.findByText("Open Library");fireEvent.click(screen.getByText("用此名称查可信资料"));expect((screen.getByLabelText("搜索词或来源网址") as HTMLInputElement).value).toBe("The Hobbit");
 });
 it("retains source failure input across unmount and never creates on resolve",async()=>{
  const request=vi.fn(async()=>{throw Error("source unavailable");}) as unknown as Request;
  const mounted=render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={vi.fn()}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("搜索词或来源网址"),{target:{value:"550"}});fireEvent.click(screen.getByText("按网址 / ID 解析"));expect(await screen.findByRole("alert")).toBeTruthy();
  mounted.unmount();render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={vi.fn()}/></MemoryRouter>);expect((screen.getByLabelText("搜索词或来源网址") as HTMLInputElement).value).toBe("550");expect((request as any).mock.calls.every((args:any[])=>!args[0].endsWith('/confirm'))).toBe(true);
 });
 it("freezes a lost acknowledgment and recovers through receipt GET without another confirmation",async()=>{
  let committed=false,posts=0;const onSaved=vi.fn();
  const request=vi.fn(async(path:string)=>{if(path.endsWith('/resolve'))return preview;if(path.includes('/operations/'))return committed?{status:'committed',itemId:42}:{status:'not_found'};if(path.endsWith('/confirm')){posts++;committed=true;throw Error('lost acknowledgment');}throw Error(path);}) as unknown as Request;
  const mounted=render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("搜索词或来源网址"),{target:{value:"550"}});fireEvent.click(screen.getByText("按网址 / ID 解析"));await screen.findByText('确认保存资料');fireEvent.click(screen.getByText('确认保存资料'));await screen.findByRole('alert');
  const frozen=JSON.parse(localStorage.getItem('wb.library-import.v1:7')!).frozen;expect(frozen.operationId).toBeTruthy();mounted.unmount();
  render(<MemoryRouter><MediaImportWorkflow request={request} userId={7} onConfirm={vi.fn()} onSaved={onSaved}/></MemoryRouter>);fireEvent.click(screen.getByText('查询结果 / 重试原确认'));await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(42));expect(posts).toBe(1);expect(JSON.parse(localStorage.getItem('wb.library-import.v1:7')!).frozen).toEqual(frozen);
 });
});
