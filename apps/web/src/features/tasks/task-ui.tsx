import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { DIMENSIONS, type Category, visibleDimensions } from "../categories";
import { Badge, Button, IconButton } from "../../shared/ui";
import { DIFFICULTIES } from "./model";
import type { Request } from "./model";
import { tx } from "../../app/i18n";

export function CategoryOptions({ categories }: { categories: Category[] }) {
  const unmapped = categories.filter((category) => category.dimensionKey === null);
  return <>{visibleDimensions(categories).map((dimension) => {
    const items = categories.filter((category) => category.dimensionKey === dimension.key);
    return items.length ? <optgroup key={dimension.key} label={tx(dimension.label)}>{items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup> : null;
  })}{unmapped.length ? <optgroup label={tx("暂不映射")}>{unmapped.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup> : null}</>;
}

export function CategoryField({ request, categories, value, onChange, onChanged }: { request: Request; categories: Category[]; value: string; onChange: (value: string) => void; onChanged: () => void | Promise<void> }) {
  const [adding, setAdding] = useState(false), [name, setName] = useState(""), [color, setColor] = useState("#3B82F6");
  async function create() { if (!name.trim()) return; const category = await request<Category>("/api/task-categories", { method: "POST", body: JSON.stringify({ name: name.trim(), color, dimensionKey: null, targetMinutes: 6000 }) }); await onChanged(); onChange(String(category.id)); setName(""); setAdding(false); }
  return <div className="category-field"><select aria-label={tx("事件类型")} className="field" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{tx("未分类 / Inbox")}</option><CategoryOptions categories={categories} /></select><button className="category-inline-add" type="button" onClick={() => setAdding((current) => !current)}>{tx("+ 新增分类")}</button>{adding ? <div className="category-inline-form"><input aria-label={tx("内联新分类名称")} className="field" placeholder={tx("分类名称")} value={name} onChange={(event) => setName(event.target.value)} /><input aria-label={tx("内联新分类颜色")} type="color" value={color} onChange={(event) => setColor(event.target.value.toUpperCase())} /><Button variant="primary" size="sm" type="button" onClick={() => void create()}>{tx("创建")}</Button></div> : null}</div>;
}

export function CategoryTag({ category }: { category: Category }) {
  const dimension = DIMENSIONS.find((item) => item.key === category.dimensionKey);
  return <Badge className="category-tag" title={tx("{value0} · {value1}", { value0: dimension?.label ? tx(dimension.label) : tx("暂不映射"), value1: category.name })} style={{ backgroundColor: `${category.color}24`, borderColor: `${category.color}88`, color: category.color }}><i style={{ backgroundColor: category.color }} /><span>{category.name}</span></Badge>;
}

export function DifficultyOptions() {
  return <>{DIFFICULTIES.map((item) => <option key={item.value} value={item.value}>{tx(item.label)}</option>)}</>;
}

export function ModalPortal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const shell = shellRef.current;
    shell?.querySelector<HTMLElement>("button, input, textarea, select, [tabindex]:not([tabindex='-1'])")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !shell) return;
      const focusable = [...shell.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); trigger?.focus(); };
  }, []);
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div aria-modal="true" className="modal-shell" ref={shellRef} role="dialog" onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>, document.body);
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return <IconButton size="sm" type="button" label={tx("关闭")} onClick={onClose}><X size={15} /></IconButton>;
}

export function ModalActions({ onClose, submitLabel }: { onClose: () => void; submitLabel: string }) {
  return <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>{tx("取消")}</Button><Button variant="primary" type="submit">{submitLabel}</Button></div>;
}

export function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{tx(text)}</p>;
}
