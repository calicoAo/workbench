import { useQuery } from "@tanstack/react-query";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import type { GrowthConfig, GrowthDimension } from "./contracts";

const defaultNames: Record<string, string> = { career: "事业力", creative: "创造力", learning: "学习力", life: "生活力", body: "身体力", social: "社交力", leisure: "兴趣成长", foundation: "基础状态" };
export function growthDimensionName(dimension: Pick<GrowthDimension, "dimensionKey" | "name">) {
  const name = defaultNames[dimension.dimensionKey];
  return name === dimension.name ? tx(name) : dimension.name;
}

export function useGrowthConfiguration(request: Request, userId: number) {
  return useQuery({ queryKey: queryKeys.growthConfig(userId), queryFn: () => request<GrowthConfig>("/api/growth/dimensions") });
}

/** Current user-configured definitions, including custom keys and renamed defaults. */
export function GrowthDimensionSelect({ request, userId, value, onChange, label, disabled }: {
  request: Request; userId: number; value: string; onChange: (key: string) => void; label: string; disabled?: boolean;
}) {
  const query = useGrowthConfiguration(request, userId);
  const enabled = (query.data?.dimensions ?? []).filter((dimension) => dimension.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  const current = query.data?.dimensions.find((dimension) => dimension.dimensionKey === value);
  return <label>{tx("成长维度")}<select className="field" aria-label={label} value={value} disabled={disabled || query.isPending || query.isError} onChange={(event) => onChange(event.target.value)}>
    <option value="">{tx("暂不映射")}</option>
    {value && !enabled.some((dimension) => dimension.dimensionKey === value) ? <option value={value} disabled>{current ? growthDimensionName(current) : value} · {tx("当前映射不可用")}</option> : null}
    {enabled.map((dimension) => <option key={dimension.id} value={dimension.dimensionKey}>{growthDimensionName(dimension)}</option>)}
  </select>{query.isError ? <span role="alert">{tx("成长维度加载失败")} <Button type="button" size="sm" onClick={() => void query.refetch()}>{tx("重试")}</Button></span> : null}</label>;
}
