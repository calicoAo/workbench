import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { DIMENSIONS, type Category, visibleDimensions } from "../categories";
import { DIFFICULTIES } from "./model";

export function CategoryOptions({ categories }: { categories: Category[] }) {
  return <>{visibleDimensions(categories).map((dimension) => {
    const items = categories.filter((category) => category.dimensionKey === dimension.key);
    return items.length ? <optgroup key={dimension.key} label={dimension.label}>{items.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup> : null;
  })}</>;
}

export function CategoryTag({ category }: { category: Category }) {
  const dimension = DIMENSIONS.find((item) => item.key === category.dimensionKey);
  return <span className="category-tag" title={`${dimension?.label ?? "生活力"} · ${category.name}`} style={{ backgroundColor: `${category.color}24`, borderColor: `${category.color}88`, color: category.color }}><i style={{ backgroundColor: category.color }} /><span>{category.name}</span></span>;
}

export function DifficultyOptions() {
  return <>{DIFFICULTIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</>;
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
  return <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={onClose}><X size={15} /></button>;
}

export function ModalActions({ onClose, submitLabel }: { onClose: () => void; submitLabel: string }) {
  return <div className="mt-4 flex justify-end gap-2"><button className="icon-button w-auto px-4" type="button" onClick={onClose}>取消</button><button className="primary-button px-5" type="submit">{submitLabel}</button></div>;
}

export function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{text}</p>;
}
