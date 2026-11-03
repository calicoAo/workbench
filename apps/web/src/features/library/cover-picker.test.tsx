// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Request} from '../../app/api';
import {LibraryCoverPicker,type CoverLookup} from './cover-picker';
afterEach(cleanup);
const selection={operationId:'parent',candidateIndex:0};
const option={id:'a'.repeat(32),imageUrl:'https://standardebooks.org/ebooks/a/cover.jpg',sourcePageUrl:'https://standardebooks.org/ebooks/a/book',sourceTitle:'Book source',width:300,height:450,kind:'COVER'};
const result:CoverLookup={operationId:'cover-op',parentOperationId:'parent',candidateIndex:0,status:'SUCCEEDED',result:{candidates:[option],failures:[]},pageCalls:1,imageCalls:1,searchCalls:0};
it('recovers a pending lookup via pure GET rather than another paid request',async()=>{
 const request=vi.fn(async()=>result) as unknown as Request,onChange=vi.fn();
 render(<LibraryCoverPicker request={request} selection={selection} saved={{...result,status:'PENDING'}} disabled={false} onChange={onChange} onChoose={vi.fn()} onBusy={vi.fn()}/>);
 await waitFor(()=>expect(onChange).toHaveBeenCalledWith(result));expect(request).toHaveBeenCalledWith('/api/library/import/ai-search/parent/covers/cover-op');
});
it('requires real image decoding before selection and auto-selects a verified first candidate',async()=>{
 const onChoose=vi.fn(async()=>{});render(<LibraryCoverPicker request={vi.fn() as unknown as Request} selection={selection} saved={result} disabled={false} onChange={vi.fn()} onChoose={onChoose} onBusy={vi.fn()}/>);
 const button=screen.getByRole('button',{name:'使用此封面'}) as HTMLButtonElement;expect(button.disabled).toBe(true);
 const img=screen.getByAltText('候选封面');Object.defineProperties(img,{decode:{value:async()=>{}},naturalWidth:{value:300},naturalHeight:{value:450}});fireEvent.load(img);
 await waitFor(()=>expect(onChoose).toHaveBeenCalledWith('cover-op',option.id));expect(screen.getByText(/封面阶段模型 token：0/)).toBeTruthy();
});
it('failed browser images cannot be selected',async()=>{
 const onChoose=vi.fn();render(<LibraryCoverPicker request={vi.fn() as unknown as Request} selection={selection} saved={result} disabled={false} onChange={vi.fn()} onChoose={onChoose} onBusy={vi.fn()}/>);
 fireEvent.error(screen.getByAltText('候选封面'));expect((screen.getByRole('button',{name:'使用此封面'}) as HTMLButtonElement).disabled).toBe(true);expect(onChoose).not.toHaveBeenCalled();
});
it('persists identity before first POST, permits empty results and never automatically retries',async()=>{
 const order:string[]=[];const request=vi.fn(async()=>{order.push('POST');return {...result,result:{candidates:[],failures:['PAGE_UNAVAILABLE']}};}) as unknown as Request;
 const onChange=vi.fn(()=>{order.push('SAVE')});render(<LibraryCoverPicker request={request} selection={selection} disabled={false} onChange={onChange} onChoose={vi.fn()} onBusy={vi.fn()}/>);
 await waitFor(()=>expect(onChange).toHaveBeenCalledTimes(2));expect(order[0]).toBe('SAVE');expect((request as any).mock.calls).toHaveLength(1);
});
it('ambiguous manga/series images require explicit selection and never become the default',async()=>{
 const onChoose=vi.fn(async()=>{});render(<LibraryCoverPicker request={vi.fn() as unknown as Request} selection={selection} saved={{...result,result:{candidates:[{...option,kind:'UNCONFIRMED'}],failures:[]}}} disabled={false} onChange={vi.fn()} onChoose={onChoose} onBusy={vi.fn()}/>);
 const img=screen.getByAltText('候选封面');Object.defineProperties(img,{decode:{value:async()=>{}},naturalWidth:{value:300},naturalHeight:{value:450}});fireEvent.load(img);
 await waitFor(()=>expect((screen.getByRole('button',{name:'使用此封面'}) as HTMLButtonElement).disabled).toBe(false));expect(onChoose).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'使用此封面'}));await waitFor(()=>expect(onChoose).toHaveBeenCalledWith('cover-op',option.id));
});
it('an explicitly omitted cover is preserved when images finish loading',async()=>{
 const onChoose=vi.fn();render(<LibraryCoverPicker request={vi.fn() as unknown as Request} selection={selection} saved={result} selectedId='__omit__' disabled={false} onChange={vi.fn()} onChoose={onChoose} onBusy={vi.fn()}/>);
 const img=screen.getByAltText('候选封面');Object.defineProperties(img,{decode:{value:async()=>{}},naturalWidth:{value:300},naturalHeight:{value:450}});fireEvent.load(img);
 await waitFor(()=>expect((screen.getByRole('button',{name:'使用此封面'}) as HTMLButtonElement).disabled).toBe(false));expect(onChoose).not.toHaveBeenCalled();
});
it('does not start a possibly paid operation when its identity cannot be persisted',async()=>{
 const request=vi.fn();render(<LibraryCoverPicker request={request as unknown as Request} selection={selection} disabled={false} onChange={()=>{throw Error('Draft storage full')}} onChoose={vi.fn()} onBusy={vi.fn()}/>);
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toBe('Draft storage full'));expect(request).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'重新查找封面（可能产生搜索费用）'})).toBeTruthy();
});
