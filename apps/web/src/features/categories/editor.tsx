import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ApiError, type Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button, IconButton } from "../../shared/ui";
import { GrowthDimensionSelect } from "../growth";
import type { CategoryEditorCategory } from ".";
import { CATEGORY_PALETTE, CategoryColorControl, validCategoryColor } from "./color-control";
import { mutateCategory } from "./mutations";
import { commitCategory } from "./queries";

/** Shared Settings/Quick Manager owner for draft, validation, mutation and confirmed result. */
export function CategoryEditor({ request, userId, category, allowEnabled = false, onSaved, onClose, onError, onPending }: {
  request: Request; userId: number; category: CategoryEditorCategory | null; allowEnabled?: boolean;
  onSaved: (category: CategoryEditorCategory, created: boolean) => void; onClose: () => void;
  onError: (message: string, title?: string) => void; onPending?: (pending: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => ({ name: category?.name ?? "", color: category?.color ?? CATEGORY_PALETTE[0], dimensionKey: category?.dimensionKey ?? "", enabled: category ? Boolean(category.enabled) : true }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const saving = useRef(false);
  const lifetime = useRef({ active: true, userId });
  lifetime.current.userId = userId;
  useEffect(() => { lifetime.current.active = true; return () => { lifetime.current.active = false; }; }, []);
  const client = useQueryClient();
  async function save(event: FormEvent) {
    event.preventDefault(); event.stopPropagation();
    if (saving.current || !draft.name.trim() || !validCategoryColor(draft.color)) return;
    const savingUser = userId;
    const stillCurrent = () => lifetime.current.active && lifetime.current.userId === savingUser;
    saving.current = true; setPending(true); onPending?.(true); setError(""); setOutcomeUnknown(false);
    try {
      const values = { name: draft.name.trim(), color: draft.color.toUpperCase(), dimensionKey: draft.dimensionKey || null, ...(category && allowEnabled ? { enabled: draft.enabled } : {}) };
      const response = await mutateCategory(request, category?.id ?? null, values);
      if (!stillCurrent()) return;
      const saved = response.kind === "created" ? response.category : { ...category!, ...values };
      commitCategory(client, savingUser, saved);
      onSaved(saved, !category);
    } catch (failure) {
      if (!stillCurrent()) return;
      setOutcomeUnknown(failure instanceof ApiError && (failure.status === 0 || failure.status >= 500));
      const message = failure instanceof ApiError && (failure.status === 0 || failure.status >= 500)
        ? tx("保存结果尚未确认，请先刷新分类列表核实，再决定是否重试。")
        : failure instanceof Error ? failure.message : tx("操作失败");
      setError(message);
      onError(message, category ? tx("分类没有更新") : tx("分类没有创建"));
    } finally {
      if (stillCurrent()) { saving.current = false; setPending(false); onPending?.(false); }
    }
  }
  return <form className="category-editor-form" onSubmit={(event) => void save(event)}>
    <header><h3 id="category-editor-title">{category ? tx("编辑分类") : tx("新增分类")}</h3><IconButton type="button" label={tx("关闭")} size="sm" disabled={pending} onClick={onClose}><X size={16} /></IconButton></header>
    <label>{tx("名称")}<input autoFocus data-dialog-initial-focus aria-label={category ? tx("分类名称") : tx("新分类名称")} className="field" required maxLength={64} disabled={pending} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
    <GrowthDimensionSelect request={request} userId={userId} label={category ? tx("分类成长维度") : tx("新分类成长维度")} value={draft.dimensionKey} disabled={pending} onChange={(dimensionKey) => setDraft({ ...draft, dimensionKey })} />
    <fieldset disabled={pending} className="category-color-fields"><CategoryColorControl color={draft.color} onChange={(color) => setDraft({ ...draft, color })} /></fieldset>
    {category && allowEnabled ? <label className="settings-toggle"><span>{draft.enabled ? tx("分类已启用") : tx("分类已停用")}</span><input type="checkbox" aria-label={draft.enabled ? tx("分类已启用") : tx("分类已停用")} disabled={pending} checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /></label> : null}
    {error ? <p className="notes-error" role="alert">{error}{outcomeUnknown ? <Button type="button" size="sm" onClick={() => void client.refetchQueries({ queryKey: ["task-categories", userId] })}>{tx("刷新分类列表")}</Button> : null}</p> : null}
    <div className="category-form-actions"><Button type="button" disabled={pending} onClick={onClose}>{tx("取消")}</Button><Button variant="primary" loading={pending} disabled={!draft.name.trim() || !validCategoryColor(draft.color)} type="submit">{tx("保存分类")}</Button></div>
  </form>;
}
