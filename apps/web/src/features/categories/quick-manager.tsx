import { useState } from "react";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import type { CategoryEditorCategory } from ".";
import { CategoryEditor } from "./editor";
import { useCategoryOptions } from "./queries";

export { useCategoryOptions } from "./queries";

export function CategoryRefreshStatus({ request, userId }: { request: Request; userId: number }) {
  const query = useCategoryOptions(request, userId);
  return query.isError ? <p className="notes-error category-refresh" role="alert">{tx("分类已保留，列表刷新失败。")}<Button type="button" size="sm" onClick={() => void query.refetch()}>{tx("刷新分类列表")}</Button></p> : null;
}

/** Embedded surface: Tasks supplies one active panel; this feature owns the editor intent. */
export function CategoryQuickManager({ request, userId, onSaved, onSelect, onClose, onError, onPending }: {
  request: Request; userId: number; onSaved: (category: CategoryEditorCategory, created: boolean) => void;
  onSelect: (category: CategoryEditorCategory) => void; onClose: () => void;
  onError: (message: string, title?: string) => void; onPending: (pending: boolean) => void;
}) {
  const query = useCategoryOptions(request, userId);
  const [editing, setEditing] = useState<CategoryEditorCategory | null>(null);
  const [pending, setPending] = useState(false);
  const categories = query.data ?? [];
  return <section className="category-quick-manager">
    <CategoryEditor key={`${userId}:${editing?.id ?? "new"}`} request={request} userId={userId} category={editing} onClose={onClose} onSaved={onSaved} onError={onError} onPending={(value) => { setPending(value); onPending(value); }} />
    <CategoryRefreshStatus request={request} userId={userId} />
    <div className="category-quick-list"><h4>{tx("已有分类")}</h4>{editing ? <Button type="button" size="sm" disabled={pending} onClick={() => setEditing(null)}>{tx("新增分类")}</Button> : null}
      {categories.map((category) => <div className="category-quick-row" key={category.id}><i style={{ background: category.color }} /><span>{category.name}</span><Button type="button" size="sm" disabled={pending} onClick={() => onSelect(category)}>{tx("使用")}</Button><Button type="button" size="sm" disabled={pending} aria-label={tx("编辑分类 {value0}", { value0: category.name })} onClick={() => setEditing(category)}>{tx("编辑")}</Button></div>)}
    </div>
  </section>;
}
