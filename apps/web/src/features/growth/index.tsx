import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Coins, Map, Pencil, Plus, Settings2, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { Button } from "../../shared/ui";
import { PixelAsset, pixelDimensionSlot } from "./pixel-assets";

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

export function GrowthPage({ request, userId, date, onError }: { request: Request; userId: number; date: string; onError: (message: string, title?: string) => void }) {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const initialHash = typeof window === "undefined" ? "" : window.location.hash;
  const [view, setView] = useState<"overview" | "dimensions" | "mapping">(initialHash === "#dimensions" ? "dimensions" : initialHash === "#mapping" ? "mapping" : "overview");
  const overview = useQuery({ queryKey: ["growth-overview", userId, period, date], queryFn: () => request<GrowthOverview>(`/api/growth/overview?period=${period}&to=${date}`), placeholderData: (previous) => previous });
  const config = useQuery({ queryKey: ["growth-config", userId], queryFn: () => request<GrowthConfig>("/api/growth/dimensions"), placeholderData: (previous) => previous });
  if (overview.isPending || config.isPending) return <section className="growth-route"><p className="route-state">正在整理成长轨迹...</p></section>;
  if (!overview.data || !config.data || overview.isError || config.isError) return <section className="growth-route"><p className="notes-error">成长页加载失败。</p></section>;
  return <section className="growth-route">
    <header className="growth-page-head"><div><p className="route-eyebrow">Hero Growth</p><h1>我的成长</h1><p>投入来自实际用时，经验与等级来自奖励系统。</p></div><div className="growth-period" aria-label="成长周期">{([7, 30, 90] as const).map((days) => <button className={period === days ? "is-active" : ""} key={days} onClick={() => setPeriod(days)}>{days} 天</button>)}</div></header>
    <nav className="growth-subnav" aria-label="成长页导航"><button className={view === "overview" ? "is-active" : ""} onClick={() => { setView("overview"); history.replaceState(null, "", `${location.pathname}${location.search}`); }}>成长总览</button><button className={view === "dimensions" ? "is-active" : ""} onClick={() => { setView("dimensions"); history.replaceState(null, "", "#dimensions"); }}>成长维度</button><button className={view === "mapping" ? "is-active" : ""} onClick={() => { setView("mapping"); history.replaceState(null, "", "#mapping"); }}>分类映射</button></nav>
    {view === "overview" ? <GrowthOverviewView overview={overview.data} onManageMapping={() => setView("mapping")} onOpenDimensions={() => setView("dimensions")} /> : null}
    {view === "dimensions" ? <DimensionManager request={request} userId={userId} config={config.data} onError={onError} /> : null}
    {view === "mapping" ? <MappingManager request={request} userId={userId} config={config.data} onError={onError} /> : null}
  </section>;
}

function GrowthOverviewView({ overview, onManageMapping, onOpenDimensions }: { overview: GrowthOverview; onManageMapping: () => void; onOpenDimensions: () => void }) {
  const progress = Math.min(1, overview.hero.xpInLevel / Math.max(1, overview.hero.xpForNextLevel));
  const hasGrowth = overview.summary.actualMinutes > 0 || overview.summary.completedTaskCount > 0;
  return <div className="growth-overview">
    <section className="growth-hero-card pixel-surface"><div className="growth-hero-portrait"><PixelAsset slot="hero-half-body" label="英雄半身像占位" /></div><div className="growth-hero-copy"><span className="pixel-badge"><PixelAsset slot="level-badge" label="等级徽章" />Lv.{overview.hero.level}</span><h2>你的角色正在成长</h2><p>最近 {overview.period.days} 天，你投入了 <strong>{formatDuration(overview.summary.actualMinutes)}</strong>。</p><div className="growth-xp-copy"><span>经验 {overview.hero.xpInLevel}/{overview.hero.xpForNextLevel}</span><span><Coins size={14} />{overview.hero.coins} Coins</span></div><div className="pixel-xp-track" aria-label={`经验进度 ${Math.round(progress * 100)}%`}><i style={{ width: `${progress * 100}%` }} /></div><small>XP / Coins 是 Workbench 奖励资源，不是财务金额。</small></div></section>
    {!hasGrowth ? <section className="growth-empty pixel-surface"><PixelAsset slot="hero-avatar" label="成长空状态" /><h2>还没有成长记录</h2><p>完成悬赏或记录实际投入后，这里会慢慢长出来。</p></section> : <><div className="growth-main-grid"><InvestmentDistribution dimensions={overview.dimensions} mappedMinutes={overview.summary.mappedActualMinutes} /><section className="growth-summary-card"><div className="growth-section-title"><Sparkles size={16} /><h2>本期摘要</h2></div><div className="growth-summary-stats"><span><strong>{formatDuration(overview.summary.actualMinutes)}</strong>实际投入</span><span><strong>{overview.summary.completedTaskCount}</strong>完成任务</span><span><strong>{overview.summary.habitCompletedCount}</strong>Habit 完成</span></div><p>统计范围 {overview.period.from} 至 {overview.period.to} · {overview.period.timezone}</p></section></div><DimensionCards dimensions={overview.dimensions} onOpen={onOpenDimensions} />{overview.unmapped.actualMinutes || overview.unmapped.completedTaskCount ? <section className="growth-unmapped"><div><Map size={18} /><span><strong>未映射</strong><small>投入 {formatDuration(overview.unmapped.actualMinutes)} · 完成 {overview.unmapped.completedTaskCount}</small></span></div><button type="button" onClick={onManageMapping}>管理成长映射</button></section> : null}<RecentGrowth items={overview.recent} /></>}
    <p className="growth-mapping-note">按当前分类映射计算；修改映射会重新解释历史报表，不会修改历史任务或实际用时。</p>
  </div>;
}

function InvestmentDistribution({ dimensions, mappedMinutes }: { dimensions: GrowthOverview["dimensions"]; mappedMinutes: number }) {
  return <section className="growth-distribution"><div className="growth-section-title"><Sparkles size={16} /><h2>投入分布</h2></div>{mappedMinutes ? <div className="growth-bars">{dimensions.map((dimension) => <div key={dimension.id}><span><PixelAsset slot={pixelDimensionSlot(dimension.dimensionKey)} label={`${dimension.name}像素图标`} /><strong>{dimension.name}</strong></span><div><i style={{ width: `${dimension.share * 100}%`, backgroundColor: dimension.color }} /></div><b>{Math.round(dimension.share * 100)}%</b></div>)}</div> : <p className="growth-panel-empty">已经有投入，但还没有分配成长方向。</p>}</section>;
}

function DimensionCards({ dimensions, onOpen }: { dimensions: GrowthOverview["dimensions"]; onOpen: () => void }) {
  return <section><div className="growth-section-title"><h2>成长维度</h2></div><div className="growth-dimension-grid">{dimensions.map((dimension) => <button type="button" className="growth-dimension-card" onClick={onOpen} key={dimension.id} style={{ borderColor: `${dimension.color}66` }}><header><PixelAsset slot={pixelDimensionSlot(dimension.dimensionKey)} label={`${dimension.name}图标`} /><span><strong>{dimension.name}</strong><small>{formatDuration(dimension.actualMinutes)}</small></span><b>{Math.round(dimension.share * 100)}%</b></header><dl><div><dt>完成任务</dt><dd>{dimension.completedTaskCount}</dd></div><div><dt>最近投入</dt><dd>{dimension.lastActivityDate ?? "暂无"}</dd></div></dl></button>)}</div></section>;
}

function RecentGrowth({ items }: { items: GrowthOverview["recent"] }) { return <section className="growth-recent"><div className="growth-section-title"><h2>最近成长</h2></div>{items.length ? items.map((item) => <article key={item.id}><PixelAsset slot="level-badge" label="成长记录" size={28} /><span><strong>完成了《{item.title}》</strong><small>{item.businessDate}{item.dimensionName ? ` · ${item.dimensionName}` : " · 未映射"}</small></span>{item.xpDelta ? <b>+{item.xpDelta} XP</b> : null}</article>) : <p className="growth-panel-empty">本期还没有任务完成记录。</p>}</section>; }

function DimensionManager({ request, userId, config, onError }: { request: Request; userId: number; config: GrowthConfig; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient(); const [adding, setAdding] = useState(false); const [name, setName] = useState(""); const [color, setColor] = useState("#5B8DEF"); const [iconKey, setIconKey] = useState("");
  async function refresh() { await Promise.all([queryClient.invalidateQueries({ queryKey: ["growth-config", userId] }), queryClient.invalidateQueries({ queryKey: ["growth-overview", userId] })]); }
  async function create(event: FormEvent) { event.preventDefault(); try { await request("/api/growth/dimensions", { method: "POST", body: JSON.stringify({ name: name.trim(), color, iconKey: iconKey.trim() || null, sortOrder: config.dimensions.length * 10 + 10 }) }); setAdding(false); setName(""); await refresh(); } catch (error) { onError(message(error), "成长维度没有创建"); } }
  async function update(dimension: GrowthDimension, values: Record<string, unknown>) { try { await request(`/api/growth/dimensions/${dimension.id}`, { method: "PUT", body: JSON.stringify({ expectedVersion: dimension.version, ...values }) }); await refresh(); } catch (error) { onError(message(error), "成长维度没有更新"); } }
  const ordered = useMemo(() => [...config.dimensions].sort((a, b) => a.sortOrder - b.sortOrder), [config.dimensions]);
  return <section className="growth-manager"><header><div><h2>成长维度</h2><p>停用维度会把相关分类原子移入“暂不映射”，历史事实不变。</p></div><Button variant="primary" size="sm" onClick={() => setAdding((value) => !value)}><Plus size={14} />新增维度</Button></header>{adding ? <form className="growth-dimension-form" onSubmit={create}><label>名称<input aria-label="成长维度名称" className="field" required maxLength={64} value={name} onChange={(event) => setName(event.target.value)} /></label><label>颜色<input aria-label="成长维度颜色" type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /></label><label>图标资源键<input aria-label="成长维度图标资源键" className="field" maxLength={64} value={iconKey} onChange={(event) => setIconKey(event.target.value)} /></label><Button variant="primary" type="submit">保存维度</Button></form> : null}<div className="growth-dimension-settings">{ordered.map((dimension, index) => <article className={!dimension.enabled ? "is-disabled" : ""} key={dimension.id}><PixelAsset slot={pixelDimensionSlot(dimension.dimensionKey)} label={`${dimension.name}图标`} /><span><strong>{dimension.name}</strong><small>{dimension.dimensionKey} · {dimension.iconKey ?? "fallback icon"}</small></span><div><button aria-label={`${dimension.name}上移`} disabled={index === 0} onClick={() => void update(dimension, { sortOrder: ordered[index - 1].sortOrder - 1 })}><ArrowUp size={15} /></button><button aria-label={`${dimension.name}下移`} disabled={index === ordered.length - 1} onClick={() => void update(dimension, { sortOrder: ordered[index + 1].sortOrder + 1 })}><ArrowDown size={15} /></button><button aria-label={`重命名${dimension.name}`} onClick={() => { const next = window.prompt("新的维度名称", dimension.name); if (next?.trim()) void update(dimension, { name: next.trim() }); }}><Pencil size={15} /></button><Button size="sm" onClick={() => void update(dimension, { enabled: !dimension.enabled })}>{dimension.enabled ? "停用" : "启用"}</Button></div></article>)}</div></section>;
}

function MappingManager({ request, userId, config, onError }: { request: Request; userId: number; config: GrowthConfig; onError: (message: string, title?: string) => void }) {
  const queryClient = useQueryClient(); const enabled = config.dimensions.filter((dimension) => dimension.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  async function map(categoryId: number, dimensionKey: string | null) { try { await request(`/api/growth/category-mappings/${categoryId}`, { method: "PUT", body: JSON.stringify({ dimensionKey }) }); await Promise.all([queryClient.invalidateQueries({ queryKey: ["growth-config", userId] }), queryClient.invalidateQueries({ queryKey: ["growth-overview", userId] }), queryClient.invalidateQueries({ queryKey: ["today", userId] })]); } catch (error) { onError(message(error), "分类映射没有保存"); } }
  return <section className="growth-manager growth-mapping" id="mapping"><header><div><h2>分类映射</h2><p>当前映射会重新分类 Growth 历史报表；Task 与 ActualTime 记录保持不变。</p></div><Settings2 size={18} /></header><div>{config.categories.map((category) => <label key={category.id}><span><i style={{ backgroundColor: category.color }} /><strong>{category.name}</strong><small>{category.enabled ? "已启用分类" : "已停用分类（历史仍可归属）"}</small></span><select aria-label={`${category.name}成长维度`} value={category.dimensionKey ?? ""} onChange={(event) => void map(category.id, event.target.value || null)}><option value="">暂不映射</option>{enabled.map((dimension) => <option key={dimension.id} value={dimension.dimensionKey}>{dimension.name}</option>)}</select></label>)}</div></section>;
}

export function TodayGrowthEntry({ request, userId, date }: { request: Request; userId: number; date: string }) {
  const query = useQuery({ queryKey: ["growth-overview", userId, 7, date], queryFn: () => request<GrowthOverview>(`/api/growth/overview?period=7&to=${date}`) });
  if (!query.data) return null;
  return <section className="today-growth-entry pixel-surface"><PixelAsset slot="hero-avatar" label="英雄头像" size={48} /><span><small>成长</small><strong>Lv.{query.data.hero.level}</strong><p>本周投入 {formatDuration(query.data.summary.actualMinutes)}</p></span><Link to={`/growth?date=${date}`}>查看成长</Link></section>;
}

function formatDuration(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? rest ? `${hours}h ${rest}m` : `${hours}h` : `${minutes}m`; }
function message(error: unknown) { return error instanceof Error ? error.message : "操作失败"; }
