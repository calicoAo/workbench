import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import { GrowthDimensionSelect, useGrowthConfiguration } from "../growth";
import type { CategoryEditorCategory } from ".";
import { mutateCategory } from "./mutations";
import { cancelCategoryReads, commitCategory } from "./queries";

type Props = { request: Request; userId: number; onNotice: (message: string, title?: string) => void };

/** Narrow Categories-owned interaction, composed into Growth by the application. */
export function CategoryMappingEditor(props: Props) {
  return <MappingRows key={props.userId} {...props} />;
}
function MappingRows(props: Props) {
  const query = useGrowthConfiguration(props.request, props.userId);
  if (!query.data) return <p role={query.isError ? "alert" : "status"}>{query.isError ? tx("成长维度加载失败") : tx("正在整理成长轨迹...")}<Button onClick={() => void query.refetch()}>{tx("重试")}</Button></p>;
  return <div className="category-mapping-list">{query.data.categories.map((category) => <MappingRow key={category.id} {...props} category={category} />)}</div>;
}
function MappingRow({ request, userId, onNotice, category }: Props & { category: Pick<CategoryEditorCategory, "id" | "name" | "color" | "dimensionKey" | "enabled"> }) {
  const client = useQueryClient();
  const config = useGrowthConfiguration(request, userId);
  const [attempt, setAttempt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = useRef(false), confirmed = useRef(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const selected = attempt ?? category.dimensionKey ?? "";
  const currentDimension = config.data?.dimensions.find((d) => d.dimensionKey === category.dimensionKey);
  const allowed = !selected || config.data?.dimensions.some((d) => d.enabled && d.dimensionKey === selected);
  const dirty = selected !== (category.dimensionKey ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current || (!confirmed.current && (!dirty || !allowed))) return;
    busy.current = true; setPending(true); setError(""); setSaved(false);
    try {
      if (!confirmed.current) {
        await mutateCategory(request, category.id, { dimensionKey: selected || null });
        if (!active.current) return;
        confirmed.current = true;
      }
      // The write is acknowledged. A read retry must never repeat the PUT.
      const rows = await request<CategoryEditorCategory[]>("/api/task-categories?includeDisabled=true");
      if (!active.current) return;
      const canonical = rows.find((row) => row.id === category.id);
      if (!canonical) throw new Error(tx("分类已不可用"));
      await cancelCategoryReads(client, userId);
      if (!active.current) return;
      commitCategory(client, userId, canonical);
      confirmed.current = false; setRefreshRequired(false); setAttempt(null); setSaved(true);
      onNotice(tx("分类映射已保存"), tx("分类已更新"));
    } catch (failure) {
      if (!active.current) return;
      setRefreshRequired(confirmed.current);
      const detail = failure instanceof Error ? failure.message : tx("操作失败");
      const message = confirmed.current ? tx("映射已保存，分类读取失败。请刷新分类列表，无需再次保存。") : detail;
      setError(message); onNotice(message, confirmed.current ? tx("分类列表刷新失败") : tx("分类映射没有保存"));
    } finally {
      if (active.current) { busy.current = false; setPending(false); }
    }
  }
  return <form className="category-mapping-row" onSubmit={(event) => void save(event)}>
    <div className="category-mapping-identity"><i style={{ backgroundColor: category.color }} /><strong>{category.name}</strong><small>{category.enabled ? tx("已启用分类") : tx("已停用分类（历史仍可归属）")}{!category.dimensionKey ? " · " + tx("暂不映射") : !currentDimension ? " · " + tx("当前映射不可用") : !currentDimension.enabled ? " · " + tx("维度已停用") : ""}</small></div>
    <div className="category-mapping-action"><GrowthDimensionSelect request={request} userId={userId} label={tx("{value0}成长维度", { value0: category.name })} value={selected} disabled={pending || refreshRequired} onChange={(value) => { setAttempt(value); setSaved(false); }} /><Button type="submit" size="sm" loading={pending} disabled={!refreshRequired && (!dirty || !allowed)} aria-label={refreshRequired ? tx("刷新分类列表") : tx("保存{value0}映射", { value0: category.name })}>{refreshRequired ? tx("刷新分类列表") : tx("保存映射")}</Button></div>
    {error ? <p className="notes-error" role="alert">{error}</p> : null}{saved ? <p role="status">{tx("分类映射已保存")}</p> : null}
  </form>;
}
