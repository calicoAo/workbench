// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "../../app/api";
import { I18nProvider } from "../../app/i18n";
import { type ComponentProps } from "react";
import { CategoryMappingEditor } from "../categories";
import { GrowthPage as CanonicalGrowthPage, type GrowthOverview } from ".";
import type { CategoryDetail } from "./category-detail";
import { PIXEL_ASSET_MANIFEST } from "./pixel-assets";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
const ranges = [["2026-08-26", "2026-08-30"], ["2026-08-31", "2026-09-04"], ["2026-09-05", "2026-09-09"], ["2026-09-10", "2026-09-14"], ["2026-09-15", "2026-09-19"], ["2026-09-20", "2026-09-24"]];
const careerMetrics = { actualSeconds: 21600, actualMinutes: 360, completionEventCount: 3, closedSegmentCount: 2 };
const learningMetrics = { actualSeconds: 10800, actualMinutes: 180, completionEventCount: 1, closedSegmentCount: 1 };
const unmappedMetrics = { actualSeconds: 3600, actualMinutes: 60, completionEventCount: 1, closedSegmentCount: 1 };
const totalMetrics = { actualSeconds: 36000, actualMinutes: 600, completionEventCount: 5, closedSegmentCount: 4 };
const categoryTrend = (metrics: typeof totalMetrics) => ranges.map(([from, to], index) => ({ from, to, ...(index === 5 ? metrics : { actualSeconds: 0, actualMinutes: 0, completionEventCount: 0, closedSegmentCount: 0 }) }));
const overview: GrowthOverview = {
  period: { days: 30, from: "2026-08-26", to: "2026-09-24", timezone: "Asia/Shanghai" },
  hero: { level: 3, xpTotal: 400, coins: 27, xpInLevel: 150, xpForNextLevel: 450 },
  summary: { ...totalMetrics, mappedActualSeconds: 32400, mappedActualMinutes: 540, completedTaskCount: 5, habitCompletedCount: 3 },
  dimensions: [
    { id: 1, dimensionKey: "career", name: "事业", iconKey: "briefcase", color: "#5B8DEF", sortOrder: 10, ...careerMetrics, share: 2 / 3, completedTaskCount: 3, lastActivityDate: "2026-09-23" },
    { id: 2, dimensionKey: "learning", name: "学习", iconKey: "book-open", color: "#B28DFF", sortOrder: 20, ...learningMetrics, share: 1 / 3, completedTaskCount: 1, lastActivityDate: "2026-09-22" }
  ],
  unmapped: { ...unmappedMetrics, completedTaskCount: 1, lastActivityDate: "2026-09-21" },
  categoryBreakdown: [
    { categoryRef: "category:7", categoryId: 7, attribution: "CATEGORY", availability: "AVAILABLE", name: "工作", color: "#3B82F6", icon: "briefcase", enabled: 1, dimensionKey: "career", resolvedDimensionKey: "career", unmappedReason: null, ...careerMetrics, lastActivityDate: "2026-09-23", trend: categoryTrend(careerMetrics) },
    { categoryRef: "category:9", categoryId: 9, attribution: "CATEGORY", availability: "AVAILABLE", name: "读书", color: "#B28DFF", icon: "book-open", enabled: 1, dimensionKey: "learning", resolvedDimensionKey: "learning", unmappedReason: null, ...learningMetrics, lastActivityDate: "2026-09-22", trend: categoryTrend(learningMetrics) },
    { categoryRef: "category:8", categoryId: 8, attribution: "CATEGORY", availability: "AVAILABLE", name: "其他", color: "#64748B", icon: "circle", enabled: 0, dimensionKey: null, resolvedDimensionKey: null, unmappedReason: "NO_MAPPING", ...unmappedMetrics, lastActivityDate: "2026-09-21", trend: categoryTrend(unmappedMetrics) }
  ],
  trend: categoryTrend(totalMetrics).map((bucket, index) => ({ ...bucket, completedTaskCount: bucket.completionEventCount, habitCompletedCount: index === 5 ? 3 : 0 })),
  recent: [{ id: 1, kind: "TASK_COMPLETION", businessDate: "2026-09-23", title: "完成 Growth V1", dimensionName: "事业", xpDelta: 20 }]
};
const config = { dimensions: [{ id: 1, dimensionKey: "career", name: "事业", iconKey: "briefcase", color: "#5B8DEF", sortOrder: 10, enabled: 1, version: 1 }, { id: 2, dimensionKey: "learning", name: "学习", iconKey: "book-open", color: "#B28DFF", sortOrder: 20, enabled: 1, version: 1 }], categories: [{ id: 7, name: "工作", color: "#3B82F6", icon: "briefcase", dimensionKey: "career", enabled: 1 }, { id: 8, name: "其他", color: "#64748B", icon: "circle", dimensionKey: null, enabled: 0 }] };
function GrowthPage(props: Omit<ComponentProps<typeof CanonicalGrowthPage>, "categoryMapping">) {
  return <CanonicalGrowthPage {...props} categoryMapping={<CategoryMappingEditor request={props.request} userId={props.userId} onNotice={props.onError} />} />;
}
function request(): Request {
 let categories = config.categories.map(c => ({ ...c, targetMinutes: 6000 }));
 return vi.fn(async (path: string, init?: RequestInit) => {
  if (path.startsWith("/api/growth/overview")) return overview;
  if (path === "/api/growth/dimensions" && !init?.method) return { ...config, categories };
  if (path === "/api/task-categories?includeDisabled=true") return categories;
  if (path.startsWith("/api/task-categories/") && init?.method === "PUT") { const id = Number(path.split('/').at(-1)); categories = categories.map(c => c.id === id ? { ...c, ...JSON.parse(String(init.body)) } : c); return { id }; }
  if (init?.method) return {};
  throw new Error(path);
 }) as Request;
}
function wrapper(children: React.ReactNode) { return <I18nProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider></I18nProvider>; }

describe("Hero Growth V1", () => {
  it("accepts the G1 contract and adds progressive category UI", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<I18nProvider><QueryClientProvider client={client}><MemoryRouter><GrowthPage request={request()} userId={1} date="2026-09-24" onError={vi.fn()} /></MemoryRouter></QueryClientProvider></I18nProvider>);
    await screen.findByText("你的角色正在成长");
    const canonical = client.getQueryData<GrowthOverview>(["growth-overview", 1, 30, "2026-09-24"])!;
    expect(canonical.summary.actualSeconds).toBe(36000);
    expect(canonical.categoryBreakdown[0]).toMatchObject({ categoryId: 7, dimensionKey: "career", actualSeconds: 21600, completionEventCount: 3, closedSegmentCount: 2 });
    expect(canonical.categoryBreakdown[2].enabled).toBe(0);
    expect(screen.getByRole("button", { name: "全部分类" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "投入分布" })).toBeTruthy();
  });

  it("retains loading and error behavior with the extended response contract", async () => {
    let reject!: (reason: Error) => void;
    const api = vi.fn((path: string) => path === "/api/growth/dimensions" ? Promise.resolve(config) : new Promise((_resolve, fail) => { reject = fail; })) as Request;
    render(wrapper(<GrowthPage request={api} userId={1} date="2026-09-24" onError={vi.fn()} />));
    expect(screen.getByText("正在整理成长轨迹...")).toBeTruthy();
    reject(new Error("Read failed"));
    expect(await screen.findByText("成长页加载失败。")).toBeTruthy();
  });

  it("translates default dimensions but preserves custom dimension names", async () => {
    localStorage.setItem("workbench:locale", "en");
    const localizedOverview = { ...overview, dimensions: [{ ...overview.dimensions[0], name: "事业力" }, { ...overview.dimensions[1], name: "设置" }] };
    const localizedConfig = { ...config, dimensions: [{ ...config.dimensions[0], name: "事业力" }, { ...config.dimensions[1], name: "设置" }] };
    const api = vi.fn(async (path: string) => path.startsWith("/api/growth/overview") ? localizedOverview : localizedConfig) as unknown as Request;
    render(wrapper(<GrowthPage request={api} userId={1} date="2026-09-24" onError={vi.fn()} />));
    expect((await screen.findAllByText("Career")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("设置").length).toBeGreaterThan(0);
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("renders hero XP, investment distribution, cards and visible unmapped attribution", async () => { render(wrapper(<GrowthPage request={request()} userId={1} date="2026-09-24" onError={vi.fn()} />)); expect(await screen.findByText("你的角色正在成长")).toBeTruthy(); expect(screen.getByText("Lv.3")).toBeTruthy(); expect(screen.getByText("经验 150/450")).toBeTruthy(); expect(screen.getByRole("heading", { name: "投入分布" })).toBeTruthy(); expect(screen.getByText("未映射")).toBeTruthy(); expect(screen.getByText(/按当前分类映射计算/)).toBeTruthy(); expect(screen.queryByText(/能力值/)).toBeNull(); });
  it("switches period, manages dimensions and maps categories through shared config", async () => { const api = request(); render(wrapper(<GrowthPage request={api} userId={1} date="2026-09-24" onError={vi.fn()} />)); await screen.findByText("你的角色正在成长"); fireEvent.click(screen.getByRole("button", { name: "7 天" })); await waitFor(() => expect((api as ReturnType<typeof vi.fn>).mock.calls.some(([path]) => path.includes("period=7"))).toBe(true)); fireEvent.click(await screen.findByRole("button", { name: "配置" })); fireEvent.click(await screen.findByRole("button", { name: "成长维度" })); expect((await screen.findAllByRole("button", { name: "停用" })).length).toBe(2); fireEvent.click(screen.getByRole("button", { name: "分类映射" })); fireEvent.change(await screen.findByLabelText("其他成长维度"), { target: { value: "learning" } }); fireEvent.click(screen.getByRole("button", { name: "保存其他映射" })); await waitFor(() => expect(api).toHaveBeenCalledWith("/api/task-categories/8", { method: "PUT", body: JSON.stringify({ dimensionKey: "learning" }) })); });
  it("uses neutral same-size fallbacks and reserves pixel rendering slots", async () => { expect(PIXEL_ASSET_MANIFEST["hero-avatar"].src).toBe("/pixel/growth/hero-avatar@4x.png"); render(wrapper(<GrowthPage request={request()} userId={1} date="2026-09-24" onError={vi.fn()} />)); await screen.findByText("你的角色正在成长"); const slot = screen.getByLabelText("英雄半身像占位"); expect(slot.classList.contains("pixel-icon-slot")).toBe(true); const image = slot.querySelector("img")!; expect(image.classList.contains("pixel-image")).toBe(true); fireEvent.error(image); expect(slot.querySelector("img")).toBeNull(); expect(slot.querySelector("svg")).toBeTruthy(); });
  it("shows a clear zero-data empty state without NaN", async () => {
    const zero = { actualSeconds: 0, actualMinutes: 0, completionEventCount: 0, closedSegmentCount: 0 };
    const empty: GrowthOverview = {
      ...overview,
      summary: { ...zero, mappedActualSeconds: 0, mappedActualMinutes: 0, completedTaskCount: 0, habitCompletedCount: 0 },
      dimensions: overview.dimensions.map((item) => ({ ...item, ...zero, share: 0, completedTaskCount: 0, lastActivityDate: null })),
      unmapped: { ...zero, completedTaskCount: 0, lastActivityDate: null },
      categoryBreakdown: overview.categoryBreakdown.map((item) => ({ ...item, ...zero, lastActivityDate: null, trend: item.trend.map((bucket) => ({ ...bucket, ...zero })) })),
      trend: overview.trend.map((bucket) => ({ ...bucket, ...zero, completedTaskCount: 0, habitCompletedCount: 0 })),
      recent: []
    };
    const emptyRequest = vi.fn(async (path: string) => path === "/api/growth/dimensions" ? config : empty) as Request;
    render(wrapper(<GrowthPage request={emptyRequest} userId={1} date="2026-09-24" onError={vi.fn()} />));
    expect(await screen.findByText("还没有成长记录")).toBeTruthy(); expect(document.body.textContent).not.toContain("NaN");
  });
});

const detailBase: CategoryDetail = { period: overview.period, category: overview.categoryBreakdown[0], dimension: config.dimensions[0], tasks: [{ taskRef: "task:11", taskId: 11, title: "Agent Core", available: true, ...careerMetrics }], task: null, executions: [], completions: [], sessions: [], nextCursor: null };
const history: CategoryDetail = { ...detailBase, tasks: [], task: { ...detailBase.tasks[0], completionNote: "Separate Task reflection" }, sessions: [{ id: 22, note: "Only one Session note", startedAt: "2026-09-23T15:55:00Z", endedAt: "2026-09-24T00:15:00Z" }], executions: [31,32].map((id) => ({ source: "TIMER_SEGMENT", sourceId: id, timerSessionId: 22, startedAt: "2026-09-23T15:55:00Z", endedAt: "2026-09-23T16:15:00Z", fullDurationSeconds: 1200, attributedSeconds: 900, recordTimezone: "Asia/Shanghai", slices: [{ businessDate: "2026-09-24", startedAt: "2026-09-23T16:00:00Z", endedAt: "2026-09-23T16:15:00Z", durationSeconds: 900 }] })), completions: [{ id: 8, businessDate: "2026-09-24", occurredAt: "2026-09-24T00:15:00Z", lifecycleVersion: 2 }] };
function DrilldownDriver() {
 const location=useLocation(),navigate=useNavigate();
 return <><output data-testid="growth-url">{location.pathname}{location.search}{location.hash}</output><button onClick={()=>navigate(-1)}>browser-back</button><button onClick={()=>navigate(1)}>browser-forward</button></>;
}
function drilldownRequest(): Request {
 return vi.fn(async(path:string) => {
  if(path.startsWith('/api/growth/categories/')) {
   if(path.includes('category%3A999')||path.includes('task%3A999'))throw new Error('not found');
   const selected=path.includes('taskRef=')?history:detailBase;
   if(path.includes('category%3A8'))return {...selected,category:overview.categoryBreakdown[2],dimension:null};
   return selected;
  }
  return path.startsWith('/api/growth/overview')?overview:config;
 }) as Request;
}
function mountDrilldown(path='/growth?date=2026-09-24', api=drilldownRequest(), userId=1) {
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const tree=(user:number)=><I18nProvider><QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><DrilldownDriver/><GrowthPage request={api} userId={user} date="2026-09-24" onError={vi.fn()}/></MemoryRouter></QueryClientProvider></I18nProvider>;
 return {...render(tree(userId)),client,api,tree};
}
async function openCategory() { fireEvent.click(await screen.findByRole('button',{name:'事业',expanded:false}));fireEvent.click(await screen.findByRole('button',{name:'查看分类：工作'}));await screen.findByRole('heading',{name:'贡献任务'}); }

describe('G2 Category drilldown',()=>{
 it('01 exposes three perceivable sections and preserves configuration',async()=>{mountDrilldown();await screen.findByText('你的角色正在成长');for(const name of ['总览','全部分类','配置'])expect(screen.getByRole('button',{name})).toBeTruthy();expect(screen.getByRole('button',{name:'总览'}).getAttribute('aria-pressed')).toBe('true');fireEvent.click(screen.getByRole('button',{name:'配置'}));expect(await screen.findByRole('button',{name:'新增维度'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'分类映射'}));expect(await screen.findByLabelText('其他成长维度')).toBeTruthy();});
 it('02 expands/collapses configured Dimension with accessible state',async()=>{mountDrilldown();const button=await screen.findByRole('button',{name:'事业',expanded:false});fireEvent.click(button);expect(button.getAttribute('aria-expanded')).toBe('true');expect(screen.getByRole('button',{name:'查看分类：工作'})).toBeTruthy();expect(screen.getByText(/维度投入占比/)).toBeTruthy();fireEvent.click(button);expect(button.getAttribute('aria-expanded')).toBe('false');expect(screen.queryByRole('button',{name:'查看分类：工作'})).toBeNull();});
 it('03 lists only Categories for selected Dimension',async()=>{mountDrilldown();fireEvent.click(await screen.findByRole('button',{name:'事业',expanded:false}));expect(screen.queryByRole('button',{name:'查看分类：读书'})).toBeNull();expect(screen.getByRole('button',{name:'查看分类：工作'})).toBeTruthy();});
 it('04 All Categories includes mapped, unmapped and disabled identities',async()=>{mountDrilldown('/growth?view=categories');expect(await screen.findByRole('button',{name:'查看分类：工作'})).toBeTruthy();expect(screen.getByRole('button',{name:'查看分类：其他'})).toBeTruthy();expect(screen.getByText(/未映射能力维度.*已停用/)).toBeTruthy();});
 it('05 zero-activity definitions stay discoverable with real zero metrics',async()=>{const api=vi.fn(async(path:string)=>path.startsWith('/api/growth/overview')?{...overview,categoryBreakdown:[{...overview.categoryBreakdown[0],actualSeconds:0,actualMinutes:0,completionEventCount:0,closedSegmentCount:0}]}:config) as Request;mountDrilldown('/growth?view=categories',api);expect(await screen.findByRole('button',{name:'查看分类：工作'})).toBeTruthy();expect(screen.getByText('0h 0m 0s')).toBeTruthy();});
 it('06 shows canonical category metrics/trend and current mapping',async()=>{mountDrilldown('/growth?category=category%3A7');expect(await screen.findByRole('heading',{name:'贡献任务'})).toBeTruthy();expect(screen.getAllByText('6h 0m 0s').length).toBe(2);expect(screen.getByRole('img',{name:'周期投入趋势'})).toBeTruthy();expect(screen.getByText('当前映射：事业')).toBeTruthy();});
 it('07 task navigation is read-only and links canonical Task detail',async()=>{mountDrilldown();await openCategory();fireEvent.click(screen.getByRole('button',{name:'查看任务贡献：Agent Core'}));expect(await screen.findByRole('heading',{name:'执行记录'})).toBeTruthy();expect(screen.getByRole('link',{name:'打开任务详情'}).getAttribute('href')).toBe('/tasks/11?date=2026-09-24');expect(screen.queryByRole('button',{name:'保存任务'})).toBeNull();});
 it('08 reporting period survives every drilldown and period changes clear cursor',async()=>{const {api}=mountDrilldown('/growth?period=7');await openCategory();expect(screen.getByTestId('growth-url').textContent).toContain('period=7');fireEvent.click(screen.getByRole('button',{name:'90 天'}));await waitFor(()=>expect(api).toHaveBeenCalledWith(expect.stringContaining('category%3A7?period=90')));expect(screen.getByTestId('growth-url').textContent).toContain('category=category%3A7');});
 it('09 browser Back/Forward restores category, Task and Dimension contexts',async()=>{mountDrilldown();await openCategory();fireEvent.click(screen.getByRole('button',{name:'查看任务贡献：Agent Core'}));await screen.findByRole('heading',{name:'执行记录'});fireEvent.click(screen.getByText('browser-back'));expect(await screen.findByRole('heading',{name:'贡献任务'})).toBeTruthy();fireEvent.click(screen.getByText('browser-forward'));expect(await screen.findByRole('heading',{name:'执行记录'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'返回分类'}));await screen.findByRole('heading',{name:'贡献任务'});fireEvent.click(screen.getByRole('button',{name:'返回成长'}));expect(await screen.findByRole('button',{name:'事业',expanded:true})).toBeTruthy();expect(document.activeElement?.className).toBe('growth-detail-focus');});
 it('10 direct links and remount restore meaningful selection from URL',async()=>{const path='/growth?view=categories&period=90&category=category%3A7&task=task%3A11';const first=mountDrilldown(path);await screen.findByRole('heading',{name:'执行记录'});first.unmount();mountDrilldown(path);expect(await screen.findByRole('heading',{name:'执行记录'})).toBeTruthy();expect(screen.getByRole('button',{name:'90 天'}).getAttribute('aria-pressed')).toBe('true');});
 it('11 invalid Category and Dimension references are recoverable',async()=>{mountDrilldown('/growth?category=category%3A999&dimension=gone');expect(await screen.findByRole('alert')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'返回成长'}));expect(await screen.findByText('该维度不可用，请选择其他维度。')).toBeTruthy();expect(screen.getByRole('button',{name:'事业',expanded:false})).toBeTruthy();});
 it('12 detail loading/error/retry has an announced state and retains selection',async()=>{const base=drilldownRequest();let reject!: (reason:Error)=>void;let attempt=0;const api=vi.fn((path:string)=>path.startsWith('/api/growth/categories/')&&attempt++===0?new Promise((_resolve,fail)=>{reject=fail;}):base(path)) as Request;mountDrilldown('/growth?category=category%3A7',api);expect(await screen.findByText('正在加载贡献详情…')).toBeTruthy();reject(new Error('transient'));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'重试'}));expect(await screen.findByRole('heading',{name:'贡献任务'})).toBeTruthy();});
 it('13 user switch never shows previous or late response metadata',async()=>{let resolve!: (data:CategoryDetail)=>void;const base=drilldownRequest();const api=vi.fn((path:string)=>path.startsWith('/api/growth/categories/')?new Promise<CategoryDetail>(done=>{resolve=done;}):base(path)) as Request;const run=mountDrilldown('/growth?category=category%3A7',api);await screen.findByText('正在加载贡献详情…');const oldResolve=resolve;run.rerender(run.tree(2));await waitFor(()=>expect(run.client.getQueryState(['growth-overview',2,'category','category:7',30,'2026-09-24',null,null])).toBeTruthy());oldResolve({...detailBase,category:{...detailBase.category,name:'PRIVATE USER ONE'}});await waitFor(()=>expect(run.client.getQueryData(['growth-overview',1,'category','category:7',30,'2026-09-24',null,null])).toBeTruthy());expect(screen.queryByText('PRIVATE USER ONE')).toBeNull();resolve({...detailBase,category:{...detailBase.category,name:'User Two'}});expect(await screen.findByRole('heading',{name:'User Two'})).toBeTruthy();});
 it('14 multi-Segment records separate full interval and attributed duration',async()=>{mountDrilldown('/growth?category=category%3A7&task=task%3A11');await screen.findByRole('heading',{name:'执行记录'});expect(document.querySelectorAll('.growth-execution-record').length).toBe(2);expect(screen.getAllByText(/完整区间时长：0h 20m 0s.*本期归属投入：0h 15m 0s/).length).toBe(2);expect(screen.getAllByText('业务日期切片').length).toBe(2);});
 it('15 Session note is displayed once and distinguished from completionNote',async()=>{mountDrilldown('/growth?category=category%3A7&task=task%3A11');await screen.findByText('Only one Session note');expect(screen.getAllByText('Only one Session note').length).toBe(1);expect(screen.getByText('Separate Task reflection')).toBeTruthy();expect(screen.getByRole('heading',{name:'任务完成反思（当前）'})).toBeTruthy();expect(screen.getByText('本次执行备注')).toBeTruthy();});
 it('16 accurate event/Segment explanations and existing radar survive',async()=>{mountDrilldown();expect(await screen.findByRole('img',{name:'成长投入雷达'})).toBeTruthy();expect(screen.getAllByText('完成事件').length).toBeGreaterThan(0);expect(screen.getByText(/实际投入来自执行事实/)).toBeTruthy();expect(screen.getByText(/能力维度统计依据分类的当前映射/)).toBeTruthy();});
 it('17 native buttons expose keyboard/focus semantics and context recovery',async()=>{mountDrilldown();const toggle=await screen.findByRole('button',{name:'事业',expanded:false});toggle.focus();expect(document.activeElement).toBe(toggle);expect(toggle.tagName).toBe('BUTTON');expect(toggle.getAttribute('aria-controls')).toBe('growth-dimension-1');fireEvent.click(toggle);const row=screen.getByRole('button',{name:'查看分类：工作'});row.focus();fireEvent.click(row);await screen.findByRole('heading',{name:'贡献任务'});fireEvent.click(screen.getByRole('button',{name:'返回成长'}));expect(document.activeElement?.getAttribute('aria-label')).toBe('成长内容');});
 it('18 mobile structure uses shared controls and readable grouped content',async()=>{mountDrilldown('/growth?view=categories&category=category%3A7&task=task%3A11');await screen.findByRole('heading',{name:'执行记录'});expect(screen.getByRole('button',{name:'返回分类'}).className).toContain('ui-button');expect(document.querySelector('.growth-task-history .growth-session-history .growth-execution-record')).toBeTruthy();expect(document.querySelector('.growth-category-detail')).toBeTruthy();});
 it('19 old #mapping and #dimensions links retain configuration access',async()=>{const run=mountDrilldown('/growth#mapping');expect(await screen.findByLabelText('其他成长维度')).toBeTruthy();run.unmount();mountDrilldown('/growth#dimensions');expect(await screen.findByRole('button',{name:'新增维度'})).toBeTruthy();});
 it('20 empty detail and pagination remain bounded on demand',async()=>{const base=drilldownRequest();const api=vi.fn(async(path:string)=>path.startsWith('/api/growth/categories/')?{...detailBase,tasks:[],nextCursor:'next'}:base(path)) as Request;mountDrilldown('/growth?category=category%3A7',api);expect(await screen.findByText('本期暂无贡献记录。')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'下一页'}));await waitFor(()=>expect(api).toHaveBeenCalledWith(expect.stringContaining('cursor=next')));expect(screen.getByTestId('growth-url').textContent).toContain('cursor=next');});
});

describe('Growth G3 visual accessibility', () => {
  it('keeps configured axes including zero activity and exposes full custom names with exact values', async () => {
    const name = '自定义维度与非常长的知识工程名称'.repeat(3);
    const zero = { ...overview.dimensions[1], name, actualSeconds: 0, actualMinutes: 0, share: 0 };
    const data = { ...overview, dimensions: [overview.dimensions[0], zero] };
    const api = vi.fn(async (path: string) => path === '/api/growth/dimensions' ? config : data) as Request;
    render(wrapper(<GrowthPage request={api} userId={1} date="2026-09-24" onError={vi.fn()} />));
    const radar = await screen.findByRole('img', { name: '成长投入雷达' });
    const description = document.getElementById(radar.getAttribute('aria-describedby')!)!;
    expect(description.textContent).toContain(name + ': 0m · 0%');
    expect(radar.querySelectorAll('text').length).toBe(2);
    const legend = screen.getByRole('list', { name: '投入分布' });
    expect(legend.children.length).toBe(2);
    expect(legend.children[0].textContent).toContain('6h 0m67%');
    expect(legend.children[1].textContent).toContain(name + '0m0%');
    expect(screen.queryByRole('img', { name: '成长投入占比' })).toBeNull();
  });
  it('renders an invested single dimension as an accessible radar point rather than an empty chart', async () => {
    const data = { ...overview, dimensions: [{ ...overview.dimensions[0], share: 1 }] };
    const api = vi.fn(async (path: string) => path === '/api/growth/dimensions' ? config : data) as Request;
    render(wrapper(<GrowthPage request={api} userId={1} date="2026-09-24" onError={vi.fn()} />));
    const radar = await screen.findByRole('img', { name: '成长投入雷达' });
    expect(radar.querySelectorAll('circle').length).toBe(1);
    expect(document.getElementById(radar.getAttribute('aria-describedby')!)!.textContent).toContain('事业: 6h 0m · 100%');
  });
  it('labels completion events and distinct CLOSED Segments separately and keeps XP accessible', async () => {
    render(wrapper(<GrowthPage request={request()} userId={1} date="2026-09-24" onError={vi.fn()} />));
    await screen.findByRole('heading', { name: '本期摘要' });
    const metrics = document.querySelector('.growth-summary-stats')!;
    expect([...metrics.querySelectorAll('dt')].map(n => n.textContent)).toEqual(['实际投入', '完成事件', '执行段', 'Habit 完成']);
    expect([...metrics.querySelectorAll('dd')].map(n => n.textContent)).toEqual(['10h 0m', '5', '4', '3']);
    expect(screen.getByRole('progressbar', { name: '经验进度 33%' }).getAttribute('aria-valuenow')).toBe('33');
  });
  it('exposes shared labelled configuration controls without changing update ownership', async () => {
    const { api } = mountDrilldown('/growth?view=config');
    const down = await screen.findByRole('button', { name: '事业下移' });
    expect(down.className).toContain('ui-icon-button');
    expect(down.getAttribute('title')).toBe('事业下移');
    expect(screen.getByRole('button', { name: '重命名事业' }).className).toContain('ui-icon-button');
    fireEvent.click(down);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/growth/dimensions/1', { method: 'PUT', body: JSON.stringify({ expectedVersion: 1, sortOrder: 21 }) }));
    expect(screen.getByRole('button', { name: '成长维度', pressed: true })).toBeTruthy();
  });
  it('keeps zero-activity categories readable and selectable instead of hiding them', async () => {
    const zero = { ...overview.categoryBreakdown[0], actualSeconds: 0, actualMinutes: 0, completionEventCount: 0, closedSegmentCount: 0 };
    const api = vi.fn(async (path: string) => path === '/api/growth/dimensions' ? config : { ...overview, categoryBreakdown: [zero] }) as Request;
    mountDrilldown('/growth?view=categories', api);
    expect(await screen.findByText('本期暂无贡献记录。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看分类：工作' })).toBeTruthy();
    expect(screen.getByText('0h 0m 0s')).toBeTruthy();
  });
});

describe('G4 mapping composition', () => {
 it('refreshes Overview and canonical Category/Task drilldown after Categories-owned save', async () => {
  let mapped = 'career';
  const base = drilldownRequest();
  const api = vi.fn(async (path: string, init?: RequestInit) => {
   const selected = { ...config.categories[0], dimensionKey: mapped, targetMinutes: 12345 };
   if (path === '/api/task-categories/7') { mapped = JSON.parse(String(init?.body)).dimensionKey; return { id: 7 }; }
   if (path === '/api/task-categories?includeDisabled=true') return [selected];
   if (path === '/api/growth/dimensions') return { ...config, categories: [selected] };
   if (path.startsWith('/api/growth/overview')) return { ...overview, categoryBreakdown: overview.categoryBreakdown.map(c => c.categoryId === 7 ? { ...c, dimensionKey: mapped, resolvedDimensionKey: mapped } : c) };
   const result = await base(path) as CategoryDetail;
   return { ...result, category: { ...result.category, dimensionKey: mapped, resolvedDimensionKey: mapped }, dimension: config.dimensions.find(d => d.dimensionKey === mapped) };
  }) as Request;
  mountDrilldown('/growth?view=config&config=mapping', api);
  fireEvent.change(await screen.findByLabelText('工作成长维度'), { target: { value: 'learning' } });
  fireEvent.click(screen.getByRole('button', { name: '保存工作映射' })); await screen.findByText('分类映射已保存');
  fireEvent.click(screen.getByRole('button', { name: '总览' }));
  fireEvent.click(await screen.findByRole('button', { name: '学习', expanded: false }));
  fireEvent.click(screen.getByRole('button', { name: '查看分类：工作' }));
  expect(await screen.findByText('当前映射：学习')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '查看任务贡献：Agent Core' }));
  await screen.findByRole('heading', { name: '执行记录' });
  expect(screen.getByText('计时会话 #22 · 有会话备注')).toBeTruthy();
  expect(screen.getByText('执行段 #31')).toBeTruthy(); expect(screen.getByText('执行段 #32')).toBeTruthy();
  expect(screen.getAllByText('Only one Session note').length).toBe(1);
 });
});

describe('G4 Dimension lifecycle composition', () => {
 it('retains one Dimension disable command and refreshes affected Category consumers', async () => {
  const { client, api } = mountDrilldown('/growth?view=config');
  client.setQueryData(['task-categories',1], []); client.setQueryData(['task-categories',2], []);
  fireEvent.click((await screen.findAllByRole('button', { name: '停用' }))[0]);
  await waitFor(() => expect(client.getQueryState(['task-categories',1])?.isInvalidated).toBe(true));
  expect(api).toHaveBeenCalledWith('/api/growth/dimensions/1', { method: 'PUT', body: JSON.stringify({ expectedVersion: 1, enabled: false }) });
  expect((api as ReturnType<typeof vi.fn>).mock.calls.some(([path]) => path.startsWith('/api/task-categories'))).toBe(false);
  expect(client.getQueryState(['task-categories',2])?.isInvalidated).toBe(false);
 });
});
