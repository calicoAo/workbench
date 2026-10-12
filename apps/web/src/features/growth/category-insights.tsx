import { ChevronDown, ChevronRight } from "lucide-react";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { growthDimensionName } from "./dimension-selection";
import type { GrowthCategoryContribution, GrowthConfig, GrowthContributionMetrics, GrowthOverview } from "./contracts";

export const duration = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
export function categoryName(category: GrowthCategoryContribution) {
  return category.name ?? (category.categoryRef === "unassigned" ? tx("未分类") : category.categoryRef === "unknown" ? tx("分类归属未知") : tx("历史分类 #{value0}", { value0: category.categoryId ?? "?" }));
}
export function ContributionMetrics({ metrics }: { metrics: GrowthContributionMetrics }) {
  return <dl className="growth-contribution-metrics"><div><dt>{tx("实际投入")}</dt><dd>{duration(metrics.actualSeconds)}</dd></div><div><dt>{tx("完成事件")}</dt><dd>{metrics.completionEventCount}</dd></div><div><dt>{tx("执行段")}</dt><dd>{metrics.closedSegmentCount}</dd></div></dl>;
}
export function CategoryList({ categories, config, totalSeconds, onOpen }: { categories: GrowthCategoryContribution[]; config: GrowthConfig; totalSeconds?: number; onOpen: (ref: string) => void }) {
  return <div className="growth-category-list">{categories.map((category) => {
    const dimension = config.dimensions.find((d) => d.dimensionKey === category.dimensionKey);
    return <article className="growth-category-row" key={category.categoryRef} style={{ borderInlineStartColor: category.color ?? undefined }}>
      <div><Button variant="ghost" size="sm" className="growth-category-link" onClick={() => onOpen(category.categoryRef)} aria-label={tx("查看分类：{value0}", { value0: categoryName(category) })}>{categoryName(category)}</Button><p>{category.resolvedDimensionKey && dimension ? growthDimensionName(dimension) : tx("未映射能力维度")}{category.enabled === 0 ? " · " + tx("已停用") : ""}{category.availability === "UNAVAILABLE" ? " · " + tx("分类已不可用") : ""}</p></div>
      <ContributionMetrics metrics={category} />{category.actualSeconds === 0 && category.completionEventCount === 0 && category.closedSegmentCount === 0 ? <small>{tx("本期暂无贡献记录。")}</small> : null}{totalSeconds !== undefined ? <small>{tx("维度投入占比")} {totalSeconds ? Math.round(category.actualSeconds / totalSeconds * 100) : 0}%</small> : null}
    </article>;
  })}</div>;
}
export function DimensionBreakdown({ overview, config, selected, onToggle, onCategory }: { overview: GrowthOverview; config: GrowthConfig; selected: string | null; onToggle: (key: string | null) => void; onCategory: (ref: string) => void }) {
  const invalid = selected && !overview.dimensions.some((d) => d.dimensionKey === selected);
  return <section className="growth-dimension-breakdown"><h2>{tx("分类贡献")}</h2>{invalid ? <p role="status">{tx("该维度不可用，请选择其他维度。")}</p> : null}{overview.dimensions.map((dimension) => <article key={dimension.dimensionKey}>
    <Button variant="ghost" className="growth-dimension-toggle" aria-expanded={selected === dimension.dimensionKey} aria-controls={`growth-dimension-${dimension.id}`} onClick={() => onToggle(selected === dimension.dimensionKey ? null : dimension.dimensionKey)}>{selected === dimension.dimensionKey ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}<span>{growthDimensionName(dimension)}</span></Button>
    <ContributionMetrics metrics={dimension} />
    {selected === dimension.dimensionKey ? <div id={`growth-dimension-${dimension.id}`}><CategoryList categories={overview.categoryBreakdown.filter((c) => c.resolvedDimensionKey === dimension.dimensionKey)} config={config} totalSeconds={dimension.actualSeconds} onOpen={onCategory} /></div> : null}
  </article>)}</section>;
}
