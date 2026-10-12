import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { GrowthOverviewView } from "./overview";
import { DimensionManager, MappingManager } from "./configuration";
import { CategoryList, DimensionBreakdown } from "./category-insights";
import { CategoryDetailView } from "./category-detail";
import type { GrowthOverview, GrowthConfig } from "./contracts";
export type { GrowthOverview, GrowthConfig, GrowthDimension, GrowthCategoryContribution, GrowthContributionMetrics, GrowthContributionTrend } from "./contracts";
export { GrowthDimensionSelect, useGrowthConfiguration, growthDimensionName } from "./dimension-selection";

export function GrowthPage({ request, userId, date, onError, categoryMapping }: { categoryMapping: ReactNode; request: Request; userId: number; date: string; onError: (message: string, title?: string) => void }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const legacyConfig = location.hash === "#dimensions" || location.hash === "#mapping";
  const view = params.get("view") === "categories" ? "categories" : params.get("view") === "config" || (!params.has("view") && legacyConfig) ? "config" : "overview";
  const period = params.get("period") === "7" ? 7 : params.get("period") === "90" ? 90 : 30;
  const dimension = params.get("dimension"), category = params.get("category"), task = params.get("task"), cursor = params.get("cursor");
  const configView = params.get("config") === "mapping" || (!params.has("config") && location.hash === "#mapping") ? "mapping" : "dimensions";
  const content = useRef<HTMLDivElement>(null);
  const previous = useRef({ category, task });
  useEffect(() => {
    if (previous.current.category !== category || previous.current.task !== task) content.current?.focus();
    previous.current = { category, task };
  }, [category, task]);
  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    next.delete("cursor");
    for (const [key, value] of Object.entries(changes)) { if (value === null) next.delete(key); else next.set(key, value); }
    setParams(next);
  }
  const overview = useQuery({ queryKey: ["growth-overview", userId, period, date], queryFn: () => request<GrowthOverview>(`/api/growth/overview?period=${period}&to=${date}`) });
  const config = useQuery({ queryKey: ["growth-config", userId], queryFn: () => request<GrowthConfig>("/api/growth/dimensions") });
  return <section className="growth-route">
    <header className="growth-page-head"><div><p className="route-eyebrow">Hero Growth</p><h1>{tx("我的成长")}</h1><p>{tx("投入来自实际用时，经验与等级来自奖励系统。")}</p></div><div className="growth-period" aria-label={tx("成长周期")}>{([7, 30, 90] as const).map((days) => <Button aria-pressed={period === days} className={period === days ? "is-active" : ""} key={days} onClick={() => navigate({ period: String(days) })}>{days} {tx("天")}</Button>)}</div></header>
    <nav className="growth-subnav" aria-label={tx("成长页导航")}>{(["overview", "categories", "config"] as const).map((section) => <Button aria-pressed={view === section} className={view === section ? "is-active" : ""} key={section} onClick={() => navigate({ view: section, category: null, task: null })}>{section === "overview" ? tx("总览") : section === "categories" ? tx("全部分类") : tx("配置")}</Button>)}</nav>
    <div ref={content} tabIndex={-1} className="growth-detail-focus" aria-label={tx("成长内容")}>
      {overview.isPending || config.isPending ? <p className="route-state" role="status">{tx("正在整理成长轨迹...")}</p> : overview.isError || config.isError || !overview.data || !config.data ? <div role="alert"><p>{tx("成长页加载失败。")}</p><Button onClick={() => { void overview.refetch(); void config.refetch(); }}>{tx("重试")}</Button></div> : <>
        {category && view !== "config" ? <CategoryDetailView request={request} userId={userId} date={date} period={period} categoryRef={category} taskRef={task} cursor={cursor} onTask={(ref) => navigate({ task: ref })} onPage={(next) => navigate({ cursor: next })} onBack={() => navigate(task ? { task: null } : { category: null, task: null })} /> : view === "overview" ? <><GrowthOverviewView overview={overview.data} onManageMapping={() => navigate({ view: "config", config: "mapping" })} /><DimensionBreakdown overview={overview.data} config={config.data} selected={dimension} onToggle={(key) => navigate({ dimension: key })} onCategory={(ref) => navigate({ category: ref })} /></> : view === "categories" ? <section className="growth-all-categories"><h2>{tx("全部分类")}</h2><CategoryList categories={overview.data.categoryBreakdown} config={config.data} onOpen={(ref) => navigate({ category: ref })} /></section> : <section className="growth-configuration"><nav className="growth-subnav" aria-label={tx("成长配置")}><Button aria-pressed={configView === "dimensions"} onClick={() => navigate({ config: "dimensions" })}>{tx("成长维度")}</Button><Button aria-pressed={configView === "mapping"} onClick={() => navigate({ config: "mapping" })}>{tx("分类映射")}</Button></nav>{configView === "dimensions" ? <DimensionManager request={request} userId={userId} config={config.data} onError={onError} /> : <MappingManager>{categoryMapping}</MappingManager>}</section>}
        <p className="growth-metric-note">{tx("实际投入来自执行事实；完成事件按发生记录计数；执行段按不同 CLOSED Segment 计数。")}</p>
        <p className="growth-mapping-note">{tx("能力维度统计依据分类的当前映射计算。修改映射可能影响历史统计的归类。")}</p>
      </>}
    </div>
  </section>;
}

export { TodayGrowthEntry } from "./today-entry";
