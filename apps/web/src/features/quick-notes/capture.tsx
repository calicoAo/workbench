import { useQueryClient } from "@tanstack/react-query";
import { Lightbulb, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Button, IconButton } from "../../shared/ui";
import type { QuickNote } from "./model";

type CaptureDraft = {
  operationId: string;
  noteDate: string;
  title: string;
  content: string;
  tag: string;
};

export function QuickNoteCaptureButton({ request, userId, selectedDate, label = "记一条", compact = false, onOpen, onCreated }: {
  request: Request;
  userId: number;
  selectedDate: string;
  label?: string;
  compact?: boolean;
  onOpen?: () => void;
  onCreated?: (note: QuickNote) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return <><Button variant={compact ? "secondary" : "primary"} size={compact ? "sm" : "md"} onClick={() => { onOpen?.(); setOpen(true); }}><Lightbulb size={14} /><span>{label}</span></Button>{open ? <QuickNoteCaptureDialog request={request} userId={userId} selectedDate={selectedDate} onClose={() => setOpen(false)} onCreated={onCreated} /> : null}</>;
}

function QuickNoteCaptureDialog({ request, userId, selectedDate, onClose, onCreated }: {
  request: Request;
  userId: number;
  selectedDate: string;
  onClose: () => void;
  onCreated?: (note: QuickNote) => void | Promise<void>;
}) {
  const storageKey = `personal-workbench:quick-note-draft:${userId}`;
  const [draft, setDraft] = useState<CaptureDraft>(() => readDraft(storageKey, selectedDate));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const dirty = Boolean(draft.content.trim() || draft.title.trim() || draft.tag.trim() || draft.noteDate !== selectedDate);

  useEffect(() => {
    if (dirty) localStorage.setItem(storageKey, JSON.stringify(draft));
    else localStorage.removeItem(storageKey);
  }, [dirty, draft, storageKey]);

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    shellRef.current?.querySelector<HTMLElement>("textarea")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("keydown", closeOnEscape); trigger?.focus(); };
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.content.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const note = await request<QuickNote>("/api/quick-notes", {
        method: "POST",
        body: JSON.stringify({
          operationId: draft.operationId,
          noteDate: draft.noteDate || undefined,
          title: draft.title.trim() || undefined,
          content: draft.content,
          tag: draft.tag.trim() || undefined
        })
      });
      localStorage.removeItem(storageKey);
      setDraft(emptyDraft(selectedDate));
      await queryClient.invalidateQueries({ queryKey: ["quick-notes", userId] });
      await onCreated?.(note);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请重试");
    } finally {
      setPending(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div aria-modal="true" className="modal-shell" ref={shellRef} role="dialog" aria-labelledby="quick-note-capture-title" onMouseDown={(event) => event.stopPropagation()}>
        <form className="quick-note-editor" onSubmit={submit}>
          <header className="quick-note-editor-head"><div><p className="route-eyebrow">捕捉此刻</p><h2 id="quick-note-capture-title">随手记</h2></div><IconButton label="关闭" onClick={onClose}><X size={16} /></IconButton></header>
          <textarea aria-label="随手记正文" className="quick-note-body" maxLength={5000} placeholder="先把刚想到的东西记下来..." value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
          <div className="quick-note-fields">
            <input aria-label="随手记标题" maxLength={120} placeholder="标题（可选）" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            <input aria-label="随手记标签" maxLength={64} placeholder="标签（可选）" value={draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value })} />
            <input aria-label="记录日期" type="date" value={draft.noteDate} onChange={(event) => setDraft({ ...draft, noteDate: event.target.value })} />
          </div>
          {error ? <p className="quick-note-error" role="alert">{error}。草稿已保留，可直接重试。</p> : null}
          <footer className="quick-note-editor-actions"><span>{draft.content.length}/5000</span><div><Button variant="ghost" type="button" onClick={onClose}>稍后继续</Button><Button variant="primary" type="submit" loading={pending} disabled={!draft.content.trim()}>保存</Button></div></footer>
        </form>
      </div>
    </div>,
    document.body
  );
}

function emptyDraft(selectedDate: string): CaptureDraft {
  return { operationId: crypto.randomUUID(), noteDate: selectedDate, title: "", content: "", tag: "" };
}

function readDraft(key: string, selectedDate: string): CaptureDraft {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<CaptureDraft> | null;
    if (value?.operationId && typeof value.content === "string") return { operationId: value.operationId, noteDate: value.noteDate || selectedDate, title: value.title ?? "", content: value.content, tag: value.tag ?? "" };
  } catch {
    localStorage.removeItem(key);
  }
  return emptyDraft(selectedDate);
}
