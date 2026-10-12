import { Coins, Map, Sparkles } from "lucide-react";
import { useId } from "react";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { PixelAsset } from "./pixel-assets";
import { growthDimensionName } from "./dimension-selection";
import type { GrowthOverview, GrowthContributionTrend } from "./contracts";
const formatDuration = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
export function GrowthOverviewView({ overview, onManageMapping }: { overview: GrowthOverview; onManageMapping: () => void }) {
  const progress = Math.min(1, overview.hero.xpInLevel / Math.max(1, overview.hero.xpForNextLevel));
  const hasGrowth = overview.summary.actualMinutes > 0 || overview.summary.completedTaskCount > 0;
  return <div className="growth-overview">
    <section className="growth-hero-card"><div className="growth-hero-portrait"><PixelAsset slot="hero-half-body" label={tx("英雄半身像占位")} size={80} /></div><div className="growth-hero-copy"><span className="growth-level">Lv.{overview.hero.level}</span><h2>{tx("你的角色正在成长")}</h2><p>{tx("最近")} {overview.period.days} {tx("天，你投入了")} <strong>{formatDuration(overview.summary.actualMinutes)}</strong>。</p><div className="growth-xp-copy"><span>{tx("经验")} {overview.hero.xpInLevel}/{overview.hero.xpForNextLevel}</span><span><Coins size={14} aria-hidden="true" />{overview.hero.coins} Coins</span></div><div className="growth-xp-track" role="progressbar" aria-label={tx("经验进度 {value0}%", { value0: Math.round(progress * 100) })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><i style={{ width: `${progress * 100}%` }} /></div><small>{tx("XP / Coins 是 Workbench 奖励资源，不是财务金额。")}</small></div></section>
    {!hasGrowth ? <section className="growth-empty"><PixelAsset slot="hero-avatar" label={tx("成长空状态")} /><h2>{tx("还没有成长记录")}</h2><p>{tx("完成悬赏或记录实际投入后，这里会慢慢长出来。")}</p></section> : <>
      <section className="growth-summary-card"><div className="growth-section-title"><Sparkles size={16} aria-hidden="true" /><h2>{tx("本期摘要")}</h2></div><dl className="growth-summary-stats"><div><dt>{tx("实际投入")}</dt><dd>{formatDuration(overview.summary.actualMinutes)}</dd></div><div><dt>{tx("完成事件")}</dt><dd>{overview.summary.completionEventCount}</dd></div><div><dt>{tx("执行段")}</dt><dd>{overview.summary.closedSegmentCount}</dd></div><div><dt>{tx("Habit 完成")}</dt><dd>{overview.summary.habitCompletedCount}</dd></div></dl><p>{tx("统计范围")} {overview.period.from} {tx("至")} {overview.period.to} · {overview.period.timezone}</p></section>
      <InvestmentDistribution dimensions={overview.dimensions} mappedMinutes={overview.summary.mappedActualMinutes} /><GrowthTrend items={overview.trend ?? []} />
      {overview.unmapped.actualMinutes || overview.unmapped.completedTaskCount ? <section className="growth-unmapped"><div><Map size={18} aria-hidden="true" /><span><strong>{tx("未映射")}</strong><small>{tx("投入")} {formatDuration(overview.unmapped.actualMinutes)} {tx("· 完成")} {overview.unmapped.completedTaskCount}</small></span></div><Button variant="ghost" size="sm" onClick={onManageMapping}>{tx("管理成长映射")}</Button></section> : null}<RecentGrowth items={overview.recent} /></>}
    <p className="growth-mapping-note">{tx("按当前分类映射计算；修改映射会重新解释历史报表，不会修改历史任务或实际用时。")}</p>
  </div>;
}

function InvestmentDistribution({ dimensions, mappedMinutes }: { dimensions: GrowthOverview["dimensions"]; mappedMinutes: number }) {
  return <section className="growth-distribution"><div className="growth-section-title"><Sparkles size={16} aria-hidden="true" /><h2>{tx("投入分布")}</h2></div>{mappedMinutes ? <div className="growth-distribution-content"><InvestmentRadar dimensions={dimensions} /><ol className="growth-distribution-legend" aria-label={tx("投入分布")}>{dimensions.map((dimension, index) => <li key={dimension.id}><span className="growth-axis-number" style={{ borderColor: dimension.color }}>{index + 1}</span><strong>{growthDimensionName(dimension)}</strong><span>{formatDuration(dimension.actualMinutes)}</span><b>{Math.round(dimension.share * 100)}%</b></li>)}</ol></div> : <p className="growth-panel-empty">{tx("已经有投入，但还没有分配成长方向。")}</p>}<p className="growth-chart-note">{tx("只展示期间投入分布。")}</p></section>;
}

function InvestmentRadar({ dimensions }: { dimensions: GrowthOverview["dimensions"] }) {
  const descriptionId = useId();
  // Keep configured axes stable, including zero-investment dimensions. Numbered axes
  // link to the full text legend without colliding when user-owned names are long.
  const point = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + index / dimensions.length * Math.PI * 2;
    return { x: 100 + Math.cos(angle) * radius, y: 100 + Math.sin(angle) * radius };
  };
  const points = (scale: number) => dimensions.map((_, index) => { const p = point(index, 72 * scale); return `${p.x},${p.y}`; }).join(" ");
  const values = dimensions.map((dimension, index) => point(index, Math.min(1, dimension.share) * 72));
  return <svg className="growth-radar" role="img" aria-label={tx("成长投入雷达")} aria-describedby={descriptionId} viewBox="0 0 200 200"><desc id={descriptionId}>{dimensions.map((dimension, index) => `${index + 1}. ${growthDimensionName(dimension)}: ${formatDuration(dimension.actualMinutes)} · ${Math.round(dimension.share * 100)}%`).join("; ")}</desc>
    {dimensions.length > 2 ? [.25, .5, .75, 1].map((scale) => <polygon key={scale} className="growth-radar-grid" points={points(scale)} />) : null}
    {dimensions.map((dimension, index) => { const p = point(index, 72), label = point(index, 88); return <g key={dimension.id}><line className="growth-radar-grid" x1="100" y1="100" x2={p.x} y2={p.y} /><text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central">{index + 1}</text></g>; })}
    {values.length > 2 ? <polygon className="growth-radar-value" points={values.map((p) => `${p.x},${p.y}`).join(" ")} /> : <polyline className="growth-radar-value" points={[{ x: 100, y: 100 }, ...values].map((p) => `${p.x},${p.y}`).join(" ")} />}
    {values.map((p, index) => <circle className="growth-radar-dot" key={dimensions[index].id} cx={p.x} cy={p.y} r="3" />)}
  </svg>;
}

export function GrowthTrend({ items }: { items: GrowthContributionTrend[] }) {
  if (!items.length) return null;
  const max = Math.max(1, ...items.map((item) => item.actualMinutes));
  const points = items.map((item, index) => `${items.length === 1 ? 50 : 6 + index * (88 / (items.length - 1))},${58 - item.actualMinutes / max * 46}`).join(" ");
  return <section className="growth-trend-panel"><div className="growth-section-title"><h2>{tx("投入趋势")}</h2><span>{tx("ActualTime 分钟")}</span></div><svg role="img" aria-label={tx("周期投入趋势")} viewBox="0 0 100 64" preserveAspectRatio="none"><path d="M6 58H94" /><polyline points={points} /></svg><div className="growth-trend-labels">{items.map((item) => <span key={item.from}><strong>{formatDuration(item.actualMinutes)}</strong><small>{item.from === item.to ? item.from.slice(5) : `${item.from.slice(5)}–${item.to.slice(5)}`}</small></span>)}</div><p>{tx("趋势只表达真实投入时长，不是能力评分。")}</p></section>;
}

function RecentGrowth({ items }: { items: GrowthOverview["recent"] }) { return <section className="growth-recent"><div className="growth-section-title"><h2>{tx("最近成长")}</h2></div>{items.length ? items.map((item) => <article key={item.id}><PixelAsset slot="level-badge" label={tx("成长记录")} size={28} /><span><strong>{tx("完成了《")}{item.title}》</strong><small>{item.businessDate}{item.dimensionName ? ` · ${item.dimensionName}` : tx(" · 未映射")}</small></span>{item.xpDelta ? <b>+{item.xpDelta} XP</b> : null}</article>) : <p className="growth-panel-empty">{tx("本期还没有任务完成记录。")}</p>}</section>; }
