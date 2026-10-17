import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { DIMENSIONS, type Category, visibleDimensions } from "../categories";
import { Badge, Button, IconButton } from "../../shared/ui";
import { DIFFICULTIES } from "./model";
import { useFeedbackPresentation } from "../../app/feedback";
import { tx } from "../../app/i18n";

export function CategoryOptions({ categories }: { categories: Category[] }) {
  const unknown = categories.filter((category) => category.dimensionKey !== null && !DIMENSIONS.some((dimension) => dimension.key === category.dimensionKey));
  const unmapped = categories.filter((category) => category.dimensionKey === null);
  return <>{visibleDimensions(categories).map((dimension) => {
    const items = categories.filter((category) => category.dimensionKey === dimension.key);
    return items.length ? <optgroup key={dimension.key} label={tx(dimension.label)}>{items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup> : null;
  })}{unknown.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}{unmapped.length ? <optgroup label={tx("暂不映射")}>{unmapped.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup> : null}</>;
}

export function CategoryField({ categories, value, onChange, onManage }: { categories: Category[]; value: string; onChange: (value: string) => void; onManage: () => void }) {
  return <div className="category-field"><select aria-label={tx("事件类型")} className="field" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{tx("未分类 / Inbox")}</option><CategoryOptions categories={categories} /></select><Button type="button" size="sm" onClick={onManage}>{tx("新建 / 管理分类")}</Button></div>;
}

export function CategoryTag({ category }: { category: Category }) {
  const dimension = DIMENSIONS.find((item) => item.key === category.dimensionKey);
  return <Badge className="category-tag" title={tx("{value0} · {value1}", { value0: dimension?.label ? tx(dimension.label) : category.dimensionKey ?? tx("暂不映射"), value1: category.name })} style={{ backgroundColor: `${category.color}24`, borderColor: `${category.color}88`, color: category.color }}><i style={{ backgroundColor: category.color }} /><span>{category.name}</span></Badge>;
}

export function DifficultyOptions() {
  return <>{DIFFICULTIES.map((item) => <option key={item.value} value={item.value}>{tx(item.label)}</option>)}</>;
}

export function ModalPortal({ children, onClose, panelKey, label }: { children: ReactNode; onClose: () => void; panelKey?: string; label?: string }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const popupIsOpen = useFeedbackPresentation();
  const paused = useRef(popupIsOpen);
  paused.current = popupIsOpen;
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { if (trigger?.isConnected) trigger.focus(); };
  }, []);
  useEffect(() => {
    if (popupIsOpen) return;
    const shell = shellRef.current;
    const panel = shell?.querySelector<HTMLElement>("[data-active-task-panel]") ?? shell;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector = "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])";
    if (!panel?.contains(document.activeElement)) (panel?.querySelector<HTMLElement>("[data-dialog-initial-focus]") ?? panel?.querySelector<HTMLElement>(selector))?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (paused.current) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(selector)].filter((item) => !item.closest("[inert], [hidden], fieldset:disabled")).sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); if (!paused.current && trigger?.isConnected && !trigger.closest("[inert], [hidden]")) trigger.focus(); };
  }, [panelKey, popupIsOpen]);
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!popupIsOpen) onCloseRef.current(); }}><div {...(popupIsOpen ? { inert: "" } : {})} aria-modal={popupIsOpen ? undefined : true} aria-label={label} className="modal-shell" ref={shellRef} role={popupIsOpen ? undefined : "dialog"} onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>, document.body);
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return <IconButton size="sm" type="button" label={tx("关闭")} onClick={onClose}><X size={15} /></IconButton>;
}

export function ModalActions({ onClose, submitLabel, disabled = false }: { onClose: () => void; submitLabel: string; disabled?: boolean }) {
  return <footer><Button variant="secondary" type="button" onClick={onClose}>{tx("取消")}</Button><Button variant="primary" type="submit" disabled={disabled}>{submitLabel}</Button></footer>;
}

export function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{tx(text)}</p>;
}
