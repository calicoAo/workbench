import { ChevronRight, Pencil, Plus, Search, TimerReset, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { type FormEvent, useState } from "react";
import { tx } from "../../app/i18n";
import { Button, IconButton } from "../../shared/ui";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Confirm = (title: string, message: string, onConfirm: () => void | Promise<void>, confirmText?: string) => void;

export type DimensionKey = "career" | "creative" | "learning" | "life" | "body" | "social" | "leisure" | "foundation";
export type Category = { id: number; name: string; dimensionKey: DimensionKey | null; color: string; targetMinutes: number; totalMinutes: number; enabled?: number | boolean };
export type CategoryEditorCategory = { id: number; name: string; dimensionKey: string | null; color: string; targetMinutes: number; enabled?: number | boolean };

export const CORE_DIMENSIONS = [
  { key: "career", label: "事业力", hint: "主业、产品、编程", color: "#5B8DEF" },
  { key: "creative", label: "创造力", hint: "画画、写作、缝纫", color: "#FF8FA3" },
  { key: "learning", label: "学习力", hint: "读书、语言、投资交易", color: "#B28DFF" },
  { key: "life", label: "生活力", hint: "做饭、家务、日常经营", color: "#35C99A" },
  { key: "body", label: "身体力", hint: "运动、恢复、体能", color: "#9BD67D" },
  { key: "social", label: "社交力", hint: "关系、表达、协作", color: "#F7C96B" }
] as const;

export const EXTRA_DIMENSIONS = [
  { key: "leisure", label: "兴趣成长", hint: "游戏、影视以外的熟练度", color: "#7EC8E3" },
  { key: "foundation", label: "基础状态", hint: "睡眠等基础记录，不计入六维", color: "#9EB7CC" }
] as const;

export const DIMENSIONS = [...CORE_DIMENSIONS, ...EXTRA_DIMENSIONS] as const;

const CATEGORY_COLORS = ["#5B8DEF", "#FF8FA3", "#35C99A", "#F6A7C6", "#DDD3FF", "#7EC8E3", "#F7C96B", "#9BD67D"];

export function CategoriesFeature({ request, categories, onError, onConfirm, onChanged }: {
  request: Request;
  categories: Category[];
  onError: (message: string, title?: string) => void;
  onConfirm: Confirm;
  onChanged: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [dimensionKey, setDimensionKey] = useState<DimensionKey>("career");
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editDimensionKey, setEditDimensionKey] = useState<DimensionKey>("life");
  const [editTargetHours, setEditTargetHours] = useState("100");

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await request("/api/task-categories", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          dimensionKey,
          color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
          targetMinutes: 6000
        })
      });
      setName("");
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), tx("操作没有成功"));
    }
  }

  function openEditor(category: Category) {
    setEditing(category);
    setEditName(category.name);
    setEditDimensionKey(category.dimensionKey ?? "life");
    setEditTargetHours(String(Math.max(1, Math.round(category.targetMinutes / 60))));
  }

  async function update(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editName.trim()) return;
    try {
      await request(`/api/task-categories/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editName.trim(),
          dimensionKey: editDimensionKey,
          color: editing.color,
          targetMinutes: Number(editTargetHours) * 60
        })
      });
      setEditing(null);
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), tx("操作没有成功"));
    }
  }

  function requestDelete(category: Category) {
    onConfirm("删除事件类型", `删除「${category.name}」吗？已有任务和时间记录会变为未分类。`, async () => {
      try {
        await request(`/api/task-categories/${category.id}`, { method: "DELETE" });
        await onChanged();
      } catch (error) {
        onError(errorMessage(error), tx("操作没有成功"));
      }
    }, "删除");
  }

  return (
    <>
      <section className="glass-panel p-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-mint-700"><TimerReset size={17} /></span>
          <h2 className="section-title">{tx("六维能力")}</h2>
        </div>
        <form className="mb-3 grid gap-2" onSubmit={create}>
          <input aria-label={tx("技能或主题名称")} className="field min-w-0" placeholder={tx("新增技能/主题，比如 缝纫")} value={name} onChange={(event) => setName(event.target.value)} />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select aria-label={tx("新增能力维度")} className="field" value={dimensionKey} onChange={(event) => setDimensionKey(event.target.value as DimensionKey)}>
              <DimensionOptions />
            </select>
            <button className="primary-button px-3" aria-label={tx("新增技能或主题")} type="submit"><Plus size={15} /></button>
          </div>
        </form>
        <AbilityOverview categories={categories} onEdit={openEditor} onDelete={requestDelete} />
      </section>

      {editing && (
        <CategoryEditDialog
          category={editing}
          name={editName}
          dimensionKey={editDimensionKey}
          targetHours={editTargetHours}
          onNameChange={setEditName}
          onDimensionKeyChange={setEditDimensionKey}
          onTargetHoursChange={setEditTargetHours}
          onClose={() => setEditing(null)}
          onSubmit={update}
        />
      )}
    </>
  );
}

function CategoryEditDialog(props: {
  category: Category;
  name: string;
  dimensionKey: DimensionKey;
  targetHours: string;
  onNameChange: (value: string) => void;
  onDimensionKeyChange: (value: DimensionKey) => void;
  onTargetHoursChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>
        <form className="time-modal" onSubmit={props.onSubmit}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{tx("编辑类型")}</h3>
            <button className="icon-button h-8 w-8" type="button" aria-label={tx("关闭")} onClick={props.onClose}><X size={15} /></button>
          </div>
          <label className="text-[11px] text-soft">{tx("名称")}<input aria-label={tx("类型名称")} className="field mt-1" value={props.name} onChange={(event) => props.onNameChange(event.target.value)} /></label>
          <label className="mt-2 block text-[11px] text-soft">{tx("能力维度")}<select aria-label={tx("能力维度")} className="field mt-1" value={props.dimensionKey} onChange={(event) => props.onDimensionKeyChange(event.target.value as DimensionKey)}><DimensionOptions /></select></label>
          <div className="mt-2 grid grid-cols-[auto_1fr] items-end gap-2">
            <div><p className="mb-1 text-[11px] text-soft">{tx("标签预览")}</p><CategoryTag category={{ ...props.category, name: props.name || tx("类型预览"), dimensionKey: props.dimensionKey }} /></div>
            <label className="text-[11px] text-soft">{tx("目标小时")}<input aria-label={tx("目标小时")} className="field mt-1" min="1" type="number" value={props.targetHours} onChange={(event) => props.onTargetHoursChange(event.target.value)} /></label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="icon-button w-auto px-4" type="button" aria-label={tx("取消")} onClick={props.onClose}>{tx("取消")}</button>
            <button className="primary-button px-5" type="submit">{tx("保存")}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function AbilityOverview({ categories, onEdit, onDelete }: { categories: Category[]; onEdit: (category: Category) => void; onDelete: (category: Category) => void }) {
  if (!categories.length) return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{tx("还没有技能/主题。")}</p>;
  const totalCoreMinutes = CORE_DIMENSIONS.reduce((sum, dimension) => sum + dimensionTotalMinutes(categories, dimension.key), 0);
  return <div className="ability-list">{visibleDimensions(categories).map((dimension) => {
    const items = categoriesInDimension(categories, dimension.key);
    if (!items.length) return null;
    const minutes = dimensionTotalMinutes(categories, dimension.key);
    const percent = totalCoreMinutes && dimension.key !== "foundation" && dimension.key !== "leisure" ? Math.max(4, Math.round((minutes / totalCoreMinutes) * 100)) : 0;
    return (
      <section className="ability-card" key={dimension.key}>
        <div className="ability-head"><span className="ability-title"><i style={{ backgroundColor: dimension.color }} />{tx(dimension.label)}</span><span className="text-[11px] text-soft">{formatDuration(minutes)}</span></div>
        <p className="mb-2 truncate text-[10px] text-soft">{tx(dimension.hint)}</p>
        {percent > 0 && <div className="mb-2 h-1.5 rounded-full bg-white/80"><div className="progress-fill !h-1.5" style={{ width: `${percent}%`, backgroundColor: dimension.color }} /></div>}
        <div className="space-y-1.5">{items.map((item) => {
          const skillPercent = Math.min(100, Math.round((item.totalMinutes / item.targetMinutes) * 100));
          return (
            <div className="category-row" key={item.id}>
              <CategoryTag category={item} />
              <div className="min-w-0 flex-1"><div className="h-1.5 rounded-full bg-white/80"><div className="progress-fill !h-1.5" style={{ width: `${skillPercent}%`, backgroundColor: item.color }} /></div></div>
              <span className="w-10 shrink-0 text-right text-[11px] text-soft">{(item.totalMinutes / 60).toFixed(1)}h</span>
              <button className="icon-button h-7 w-7 shrink-0" aria-label={tx("编辑{value0}", { value0: item.name })} onClick={() => onEdit(item)}><Pencil size={13} /></button>
              <button className="icon-button h-7 w-7 shrink-0" aria-label={tx("删除{value0}", { value0: item.name })} onClick={() => onDelete(item)}><Trash2 size={13} /></button>
            </div>
          );
        })}</div>
      </section>
    );
  })}</div>;
}

function CategoryTag({ category }: { category: Category }) {
  return <span className="category-tag" title={`${tx(dimensionMeta(category.dimensionKey).label)} · ${category.name}`} style={{ backgroundColor: `${category.color}24`, borderColor: `${category.color}88`, color: category.color }}><i style={{ backgroundColor: category.color }} /><span>{category.name}</span></span>;
}

const SETTINGS_PALETTE = ["#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#EF4444", "#F59E0B", "#64748B"];
type CategoryDraft = {
  id: number | null;
  name: string;
  color: string;
  dimensionKey: string;
  enabled: boolean;
};

/** Settings composes this Categories-owned surface so draft and save semantics have one owner. */
export function CategorySettings({ categories, request, onError, onChanged }: { categories: CategoryEditorCategory[]; request: Request; onError: (message: string, title?: string) => void; onChanged: () => void | Promise<void> }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "disabled" | "unmapped">("all");
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [pending, setPending] = useState(false);
  const visible = categories.filter((category) => category.name.toLowerCase().includes(search.trim().toLowerCase()) && (filter === "all" || (filter === "active" && Boolean(category.enabled)) || (filter === "disabled" && !category.enabled) || (filter === "unmapped" && category.dimensionKey === null)));

  function edit(category?: CategoryEditorCategory) {
    setDraft(category ? { id: category.id, name: category.name, color: category.color, dimensionKey: category.dimensionKey ?? "", enabled: Boolean(category.enabled) } : { id: null, name: "", color: SETTINGS_PALETTE[0], dimensionKey: "", enabled: true });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !draft.name.trim() || !/^#[0-9a-fA-F]{6}$/.test(draft.color)) return;
    setPending(true);
    try {
      const payload = { name: draft.name.trim(), color: draft.color.toUpperCase(), dimensionKey: draft.dimensionKey || null, targetMinutes: 6000, ...(draft.id ? { enabled: draft.enabled } : {}) };
      await request(draft.id ? `/api/task-categories/${draft.id}` : "/api/task-categories", { method: draft.id ? "PUT" : "POST", body: JSON.stringify(payload) });
      setDraft(null);
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), draft.id ? tx("分类没有更新") : tx("分类没有创建"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="settings-section settings-categories">
      <div className="settings-section-head">
        <div>
          <h2>{tx("任务分类")}</h2>
          <p className="settings-note">{tx("颜色只用于展示；成长维度可暂不映射。")}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => edit()}><Plus size={14} />{tx("新增分类")}</Button>
      </div>
      <div className="settings-category-tools">
        <label>
          <Search size={15} />
          <input aria-label={tx("搜索分类")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx("搜索分类")} />
        </label>
        <select aria-label={tx("分类状态筛选")} className="field" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="all">{tx("全部")}</option><option value="active">{tx("启用中")}</option><option value="disabled">{tx("已停用")}</option><option value="unmapped">{tx("未映射")}</option>
        </select>
      </div>
      <div className="settings-category-list">
        {visible.map((category) => (
          <button type="button" aria-label={tx("编辑分类 {value0}", { value0: category.name })} className={!category.enabled ? "is-disabled" : ""} key={category.id} onClick={() => edit(category)}>
            <i style={{ backgroundColor: category.color }} /><span><strong>{category.name}</strong><small>{category.enabled ? category.dimensionKey ? dimensionLabel(category.dimensionKey) : tx("未映射") : tx("{value0} · 已停用", { value0: category.dimensionKey ? dimensionLabel(category.dimensionKey) : tx("未映射") })}</small></span><ChevronRight size={16} />
          </button>
        ))}
      </div>
      {draft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDraft(null)}>
          <div className="modal-shell settings-category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <form onSubmit={save}>
              <header><h3 id="category-editor-title">{draft.id ? tx("编辑分类") : tx("新增分类")}</h3><IconButton type="button" label={tx("关闭")} size="sm" onClick={() => setDraft(null)}><X size={16} /></IconButton></header>
              <label>{tx("名称")}<input aria-label={draft.id ? tx("分类名称") : tx("新分类名称")} className="field" required maxLength={64} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>{tx("成长维度")}<select aria-label={draft.id ? tx("分类成长维度") : tx("新分类成长维度")} className="field" value={draft.dimensionKey} onChange={(event) => setDraft({ ...draft, dimensionKey: event.target.value })}><option value="">{tx("暂不映射")}</option><DimensionOptions /></select></label>
              <CategoryColorControl color={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
              {draft.id ? <CategoryEnabledToggle enabled={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} /> : null}
              <div className="category-form-actions"><Button type="button" onClick={() => setDraft(null)}>{tx("取消")}</Button><Button variant="primary" loading={pending} type="submit">{tx("保存分类")}</Button></div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CategoryEnabledToggle({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
  const label = enabled ? tx("分类已启用") : tx("分类已停用");
  return <label className="settings-toggle"><span>{label}</span><input type="checkbox" aria-label={label} checked={enabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function CategoryColorControl({ color, onChange }: { color: string; onChange: (value: string) => void }) {
  const [hex, setHex] = useState(color);
  const applyHex = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex.toUpperCase()); };
  return <fieldset className="category-color-control"><legend>{tx("颜色")}</legend><div className="category-current-color"><i style={{ background: color }} /><strong>{color.toUpperCase()}</strong></div><div className="color-presets">{SETTINGS_PALETTE.map((value) => <button aria-label={tx("使用颜色 {value0}", { value0: value })} className={value === color ? "is-active" : ""} key={value} style={{ background: value }} type="button" onClick={() => { setHex(value); onChange(value); }} />)}<label className="color-custom-trigger" title={tx("自定义颜色")}><Plus size={14} /><input aria-label={tx("自定义分类颜色")} type="color" value={color} onChange={(event) => { const value = event.target.value.toUpperCase(); setHex(value); onChange(value); }} /></label></div><label>{tx("HEX")}<input aria-label={tx("分类 Hex 颜色")} className="field" value={hex} onChange={(event) => setHex(event.target.value)} onBlur={applyHex} /></label></fieldset>;
}

function dimensionLabel(value: string | null) {
  return value ? tx(({ career: "事业力", creative: "创造力", learning: "学习力", life: "生活力", body: "身体力", social: "社交力", leisure: "兴趣成长", foundation: "基础状态" } as Record<string, string>)[value] ?? value) : tx("暂不映射");
}

function DimensionOptions() {
  return <>{DIMENSIONS.map((dimension) => <option key={dimension.key} value={dimension.key}>{tx(dimension.label)}</option>)}</>;
}

export function dimensionMeta(key?: string | null) {
  return DIMENSIONS.find((item) => item.key === key) ?? CORE_DIMENSIONS[3];
}

export function isCoreDimensionKey(value: DimensionKey | null) {
  return CORE_DIMENSIONS.some((item) => item.key === value);
}

export function categoriesInDimension(categories: Category[], key: DimensionKey) {
  return categories.filter((category) => category.dimensionKey === key);
}

export function dimensionTotalMinutes(categories: Category[], key: DimensionKey) {
  return categoriesInDimension(categories, key).reduce((sum, category) => sum + category.totalMinutes, 0);
}

export function visibleDimensions(categories: Category[]) {
  return DIMENSIONS.filter((dimension) => CORE_DIMENSIONS.some((core) => core.key === dimension.key) || categories.some((category) => category.dimensionKey === dimension.key));
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
