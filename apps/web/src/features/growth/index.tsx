import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Coins, Map, Pencil, Plus, Settings2, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { Button } from "../../shared/ui";
import { PixelAsset, pixelDimensionSlot } from "./pixel-assets";
import { tx } from "../../app/i18n";

export type GrowthDimension = { id: number; dimensionKey: string; name: string; iconKey: string | null; color: string; sortOrder: number; enabled: number; version: number };
type GrowthCategory = { id: number; name: string; color: string; icon: string | null; dimensionKey: string | null; enabled: number };
export type GrowthOverview = {
  period: { days: 7 | 30 | 90; from: string; to: string; timezone: string };
  hero: { level: number; xpTotal: number; coins: number; xpInLevel: number; xpForNextLevel: number };
  summary: { actualMinutes: number; mappedActualMinutes: number; completedTaskCount: number; habitCompletedCount: number };
  dimensions: Array<Omit<GrowthDimension, "enabled" | "version"> & { actualMinutes: number; share: number; completedTaskCount: number; lastActivityDate: string | null }>;
  unmapped: { actualMinutes: number; completedTaskCount: number; lastActivityDate: string | null };
  recent: Array<{ id: number; kind: "TASK_COMPLETION"; businessDate: string; title: string; dimensionName: string | null; xpDelta: number }>;
};
type GrowthConfig = { dimensions: GrowthDimension[]; categories: GrowthCategory[] };
const defaultDimensionNames: Record<string, string> = { career: "事业力", creative: "创造力", learning: "学习力", life: "生活力", body: "身体力", social: "社交力", leisure: "兴趣成长", foundation: "基础状态" };
function growthDimensionName(dimension: Pick<GrowthDimension, "dimensionKey" | "name">) {
  const defaultName = defaultDimensionNames[dimension.dimensionKey];
  return defaultName === dimension.name ? tx(defaultName) : dimension.name;
}

export function GrowthPage({ request, userId, date, onError }: { request: Request; userId: number; date: string; onError: (message: string, title?: string) => void }) {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const initialHash = typeof window === "undefined" ? "" : window.location.hash;
  const [view, setView] = useState<"overview" | "dimensions" | "mapping">(initialHash === "#dimensions" ? "dimensions" : initialHash === "#mapping" ? "mapping" : "overview");
  const overview = useQuery({ queryKey: ["growth-overview", userId, period, date], queryFn: () => request<GrowthOverview>(`/api/growth/overview?period=${period}&to=${date}`), placeholderData: (previous) => previous });
  const config = useQuery({ queryKey: ["growth-config", userId], queryFn: () => request<GrowthConfig>("/api/growth/dimensions"), placeholderData: (previous) => previous });
  if (overview.isPending || config.isPending) return <section className="growth-route"><p className="route-state">{tx("正在整理成长轨迹...")}</p></section>;
  if (!overview.data || !config.data || overview.isError || config.isError) return <section className="growth-route"><p className="notes-error">{tx("成长页加载失败。")}</p></section>;
  return <section className="growth-route">
    <header className="growth-page-head"><div><p className="route-eyebrow">Hero Growth</p><h1>{tx("我的成长")}</h1><p>{tx("投入来自实际用时，经验与等级来自奖励系统。")}</p></div><div className="growth-period" aria-label={tx("成长周期")}>{([7, 30, 90] as const).map((days) => <button className={period === days ? "is-active" : ""} key={days} onClick={() => setPeriod(days)}>{days} {tx("天")}</button>)}</div></header>
    <nav className="growth-subnav" aria-label={tx("成长页导航")}><button className={view === "overview" ? "is-active" : ""} onClick={() => { setView("overview"); history.replaceState(null, "", `${location.pathname}${location.search}`); }}>{tx("成长总览")}</button><button className={view === "dimensions" ? "is-active" : ""} onClick={() => { setView("dimensions"); history.replaceState(null, "", "#dimensions"); }}>{tx("成长维度")}</button><button className={view === "mapping" ? "is-active" : ""} onClick={() => { setView("mapping"); history.replaceState(null, "", "#mapping"); }}>{tx("分类映射")}</button></nav>
    {view === "overview" ? <GrowthOverviewView overview={overview.data} onManageMapping={() => setView("mapping")} onOpenDimensions={() => setView("dimensions")} /> : null}
    {view === "dimensions" ? <DimensionManager request={request} userId={userId} config={config.data} onError={onError} /> : null}
    {view === "mapping" ? <MappingManager request={request} userId={userId} config={config.data} onError={onError} /> : null}
  </section>;
}

function GrowthOverviewView({ overview, onManageMapping, onOpenDimensions }: { overview: GrowthOverview; onManageMapping: () => void; onOpenDimensions: () => void }) {
  const progress = Math.min(1, overview.hero.xpInLevel / Math.max(1, overview.hero.xpForNextLevel));
  const hasGrowth = overview.summary.actualMinutes > 0 || overview.summary.completedTaskCount > 0;
  return <div className="growth-overview">
    <section className="growth-hero-card pixel-surface"><div className="growth-hero-portrait"><PixelAsset slot="hero-half-body" label={tx("英雄半身像占位")} /></div><div className="growth-hero-copy"><span className="pixel-badge"><PixelAsset slot="level-badge" label={tx("等级徽章")} />Lv.{overview.hero.level}</span><h2>{tx("你的角色正在成长")}</h2><p>{tx("最近")} {overview.period.days} {tx("天，你投入了")} <strong>{formatDuration(overview.summary.actualMinutes)}</strong>。</p><div className="growth-xp-copy"><span>{tx("经验")} {overview.hero.xpInLevel}/{overview.hero.xpForNextLevel}</span><span><Coins size={14} />{overview.hero.coins} Coins</span></div><div className="pixel-xp-track" aria-label={tx("经验进度 {value0}%", { value0: Math.round(progress * 100) })}><i style={{ width: `${progress * 100}%` }} /></div><small>{tx("XP / Coins 是 Workbench 奖励资源，不是财务金额。")}</small></div></section>
    {!hasGrowth ? <section className="growth-empty pixel-surface"><PixelAsset slot="hero-avatar" label={tx("成长空状态")} /><h2>{tx("还没有成长记录")}</h2><p>{tx("完成悬赏或记录实际投入后，这里会慢慢长出来。")}</p></section> : <><div className="growth-main-grid"><InvestmentDistribution dimensions={overview.dimensions} mappedMinutes={overview.summary.mappedActualMinutes} /><section className="growth-summary-card"><div className="growth-section-title"><Sparkles size={16} /><h2>{tx("本期摘要")}</h2></div><div className="growth-summary-stats"><span><strong>{formatDuration(overview.summary.actualMinutes)}</strong>{tx("实际投入")}</span><span><strong>{overview.summary.completedTaskCount}</strong>{tx("完成任务")}</span><span><strong>{overview.summary.habitCompletedCount}</strong>{tx("Habit 完成")}</span></div><p>{tx("统计范围")} {overview.period.from} {tx("至")} {overview.period.to} · {overview.period.timezone}</p></section></div><InvestmentCharts dimensions={overview.dimensions} /><DimensionCards dimensions={overview.dimensions} onOpen={onOpenDimensions} />{overview.unmapped.actualMinutes || overview.unmapped.completedTaskCount ? <section className="growth-unmapped"><div><Map size={18} /><span><strong>{tx("未映射")}</strong><small>{tx("投入")} {formatDuration(overview.unmapped.actualMinutes)} {tx("· 完成")} {overview.unmapped.completedTaskCount}</small></span></div><button type="button" onClick={onManageMapping}>{tx("管理成长映射")}</button></section> : null}<RecentGrowth items={overview.recent} /></>}
    <p className="growth-mapping-note">{tx("按当前分类映射计算；修改映射会重新解释历史报表，不会修改历史任务或实际用时。")}</p>
  </div>;
}

function InvestmentDistribution({ dimensions, mappedMinutes }: { dimensions: GrowthOverview["dimensions"]; mappedMinutes: number }) {
  return <section className="growth-distribution"><div className="growth-section-title"><Sparkles size={16} /><h2>{tx("投入分布")}</h2></div>{mappedMinutes ? <div className="growth-bars">{dimensions.map((dimension) => <div key={dimension.id}><span><PixelAsset slot={pixelDimensionSlot(dimension.dimensionKey)} label={tx("{value0}像素图标", { value0: growthDimensionName(dimension) })} /><strong>{growthDimensionName(dimension)}</strong></span><div><i style={{ width: `${dimension.share * 100}%`, backgroundColor: dimension.color }} /></div><b>{Math.round(dimension.share * 100)}%</b></div>)}</div> : <p className="growth-panel-empty">{tx("已经有投入，但还没有分配成长方向。")}</p>}</section>;
}

function InvestmentCharts({ dimensions }: { dimensions: GrowthOverview["dimensions"] }) {
  const items = dimensions.filter((item) => item.actualMinutes > 0);
  if (!items.length) return null;
  const circumference = 2 * Math.PI * 42;
  let offset = 0;
  const radarPoints = items.map((item, index) => {
    const angle = -Math.PI / 2 + (index / items.length) * Math.PI * 2;
    const radius = 20 + Math.min(1, item.share) * 60;
    return `${100 + Math.cos(angle) * radius},${100 + Math.sin(angle) * radius}`;
  }).join(" ");
  return <section className="growth-charts"><div className="growth-chart-panel"><div className="growth-section-title"><h2>{tx("成长投入占比")}</h2></div><svg className="growth-donut" role="img" aria-label={tx("成长投入占比")} viewBox="0 0 110 110">{items.map((item) => { const length = item.share * circumference; const segment = <circle key={item.id} cx="55" cy="55" r="42" fill="none" stroke={item.color} strokeWidth="14" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 55 55)" />; offset += length; return segment; })}<text x="55" y="53" textAnchor="middle" className="fill-ink text-[10px] font-bold">{tx("投入")}</text><text x="55" y="66" textAnchor="middle" className="fill-soft text-[8px]">{tx("占比")}</text></svg><div className="growth-chart-legend">{items.map((item) => <span key={item.id}><i style={{ backgroundColor: item.color }} />{item.name} {Math.round(item.share * 100)}%</span>)}</div></div><div className="growth-chart-panel"><div className="growth-section-title"><h2>{tx("成长投入")}</h2></div><svg className="growth-radar" role="img" aria-label={tx("成长投入雷达")} viewBox="0 0 200 200"><polygon points="100,20 180,100 100,180 20,100" fill="none" stroke="rgba(38,50,56,.14)" />{items.length > 1 ? <polygon points={radarPoints} fill="rgba(53,201,154,.2)" stroke="#35C99A" strokeWidth="2" /> : null}</svg><p className="growth-chart-note">{tx("只展示期间投入分布。")}</p></div></section>;
}

function DimensionCards({ dimensions, onOpen }: { dimensions: GrowthOverview["dimensions"]; onOpen: () => void }) {
  return <section><div className="growth-section-title"><h2>{tx("成长维度")}</h2></div><div className="growth-dimension-grid">{dimensions.map((dimension) => <button type="button" className="growth-dimension-card" onClick={onOpen} key={dimension.id} style={{ borderColor: `${dimension.color}66` }}><header><PixelAsset slot={pixelDimensionSlot(dimension.dimensionKey)} label={tx("{value0}图标", { value0: growthDimensionName(dimension) })} /><span><strong>{growthDimensionName(dimension)}</strong><small>{formatDuration(dimension.actualMinutes)}</small></span><b>{Math.round(dimension.share * 100)}%</b></header><dl><div><dt>{tx("完成任务")}</dt><dd>{dimension.completedTaskCount}</dd></div><div><dt>{tx("最近投入")}</dt><dd>{dimension.lastActivityDate ?? tx("暂无")}</dd></div></dl></button>)}</div></section>;
}

function RecentGrowth({ items }: { items: GrowthOverview["recent"] }) { return <section className="growth-recent"><div className="growth-section-title"><h2>{tx("最近成长")}</h2></div>{items.length ? items.map((item) => <article key={item.id}><PixelAsset slot="level-badge" label={tx("成长记录")} size={28} /><span><strong>{tx("完成了《")}{item.title}》</strong><small>{item.businessDate}{item.dimensionName ? ` · ${item.dimensionName}` : tx(" · 未映射")}</small></span>{item.xpDelta ? <b>+{item.xpDelta} XP</b> : null}</article>) : <p className="growth-panel-empty">{tx("本期还没有任务完成记录。")}</p>}</section>; }

function DimensionManager({ request, userId, config, onError }: { request: Request; userId: number; config: GrowthConfig; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient(); const [adding, setAdding] = useState(false); const [name, setName] = useState(""); const [color, setColor] = useState("#5B8DEF"); const [iconKey, setIconKey] = useState("");
  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ["growth-config", userId] }), queryClient.invalidateQueries({ queryKey: ["growth-overview", userId] })]); }
  async function create(event: FormEvent) { event.preventDefault(); try { await request("/api/growth/dimensions", { method: "POST", body: JSON.stringify({ name: name.trim(), color, iconKey: iconKey.trim() || null, sortOrder: config.dimensions.length * 10 + 10 }) }); setAdding(false); setName(""); await refresh(); } catch (error) { onError(message(error), tx("成长维度没有创建")); } }
  async function update(dimension: GrowthDimension, values: Record<string, unknown>) { try { await request(`/api/growth/dimensions/${dimension.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: dimension.version, ...values }) }); await refresh(); } catch (error) { onError(message(error), tx("成长维度没有更新")); } }
  const ordered = useMemo(() => [...config.dimensions].sort((a, b) => a.sortOrder - b.sortOrder), [config.dimensions]);
  return <section className="growth-manager"><header><div><h2>{tx("成长维度")}</h2><p>{tx("停用维度会把相关分类原子移入“暂不映射”，历史事实不变。")}</p></div><Button variant="primary" size="sm" onClick={() => setAdding((value) => !value)}><Plus size={14} />{tx("新增维度")}</Button></header>{adding ? <form className="growth-dimension-form" onSubmit={create}><label>{tx("名称")}<input aria-label={tx("成长维度名称")} className="field" required maxLength={64} value={name} onChange={(event) => setName(event.target.value)} /></label><label>{tx("颜色")}<input aria-label={tx("成长维度颜色")} type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /></label><label>{tx("图标资源键")}<input aria-label={tx("成长维度图标资源键")} className="field" maxLength={64} value={iconKey} onChange={(event) => setIconKey(event.target.value)} /></label><Button variant="primary" type="submit">{tx("保存维度")}</Button></form> : null}<div className="growth-dimension-settings">{ordered.map((dimension, index) => <article className={!dimension.enabled ? "is-disabled" : ""} key={dimension.id}><PixelAsset slot={pixelDimensionSlot(dimension.dimensionKey)} label={tx("{value0}图标", { value0: growthDimensionName(dimension) })} /><span><strong>{growthDimensionName(dimension)}</strong><small>{dimension.dimensionKey} · {dimension.iconKey ?? "fallback icon"}</small></span><div><button aria-label={tx("{value0}上移", { value0: growthDimensionName(dimension) })} disabled={index === 0} onClick={() => void update(dimension, { sortOrder: ordered[index - 1].sortOrder - 1 })}><ArrowUp size={15} /></button><button aria-label={tx("{value0}下移", { value0: growthDimensionName(dimension) })} disabled={index === ordered.length - 1} onClick={() => void update(dimension, { sortOrder: ordered[index + 1].sortOrder + 1 })}><ArrowDown size={15} /></button><button aria-label={tx("重命名{value0}", { value0: growthDimensionName(dimension) })} onClick={() => { const next = window.prompt(tx("新的维度名称"), dimension.name); if (next?.trim()) void update(dimension, { name: next.trim() }); }}><Pencil size={15} /></button><Button size="sm" onClick={() => void update(dimension, { enabled: !dimension.enabled })}>{dimension.enabled ? tx("停用") : tx("启用")}</Button></div></article>)}</div></section>;
}

function MappingManager({ request, userId, config, onError }: { request: Request; userId: number; config: GrowthConfig; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient(); const enabled = config.dimensions.filter((dimension) => dimension.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  async function map(categoryId: number, dimensionKey: string | null) { try { await request(`/api/growth/category-mappings/${categoryId}`, { method: "PUT", body: JSON.stringify({ dimensionKey }) }); await Promise.all([queryClient.invalidateQueries({ queryKey: ["growth-config", userId] }), queryClient.invalidateQueries({ queryKey: ["growth-overview", userId] }), queryClient.invalidateQueries({ queryKey: ["today", userId] })]); } catch (error) { onError(message(error), tx("分类映射没有保存")); } }
  return <section className="growth-manager growth-mapping" id="mapping"><header><div><h2>{tx("分类映射")}</h2><p>{tx("当前映射会重新分类 Growth 历史报表；Task 与 ActualTime 记录保持不变。")}</p></div><Settings2 size={18} /></header><div>{config.categories.map((category) => <label key={category.id}><span><i style={{ backgroundColor: category.color }} /><strong>{category.name}</strong><small>{category.enabled ? tx("已启用分类") : tx("已停用分类（历史仍可归属）")}</small></span><select aria-label={tx("{value0}成长维度", { value0: category.name })} value={category.dimensionKey ?? ""} onChange={(event) => void map(category.id, event.target.value || null)}><option value="">{tx("暂不映射")}</option>{enabled.map((dimension) => <option key={dimension.id} value={dimension.dimensionKey}>{growthDimensionName(dimension)}</option>)}</select></label>)}</div></section>;
}

export function TodayGrowthEntry({ request, userId, date }: { request: Request; userId: number; date: string }) {
  const query = useQuery({ queryKey: ["growth-overview", userId, 7, date], queryFn: () => request<GrowthOverview>(`/api/growth/overview?period=7&to=${date}`) });
  if (!query.data) return null;
  return <section className="today-growth-entry pixel-surface"><PixelAsset slot="hero-avatar" label={tx("英雄头像")} size={48} /><span><small>{tx("成长")}</small><strong>Lv.{query.data.hero.level}</strong><p>{tx("本周投入")} {formatDuration(query.data.summary.actualMinutes)}</p></span><Link to={`/growth?date=${date}`}>{tx("查看成长")}</Link></section>;
}

function formatDuration(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? rest ? `${hours}h ${rest}m` : `${hours}h` : `${minutes}m`; }
function message(error: unknown) { return error instanceof Error ? error.message : tx("操作失败"); }
