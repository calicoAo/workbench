import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, CheckSquare2, Lightbulb, NotebookPen, RotateCcw, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Badge, Button } from "../../shared/ui";
import { QuickNoteInspirationDialog } from "../inspirations";
import { formatCreatedAt, formatNoteDate, type QuickNote } from "./model";
import { formatNumber, tx } from "../../app/i18n";

type EditDraft = { baseVersion: number; noteDate: string; title: string; content: string; tag: string; projectId: string };
type CategoryOption = { id: number; name: string };
type ProjectOption = { id: number; name: string; archivedAt: string | null };
type JournalReferenceResult = { status: "inserted" | "duplicate" };

export function QuickNoteDetailPage({ request, userId, noteId, selectedDate, recordTimezone = "Asia/Shanghai", categories = [], projects = [], onQuoteToJournal = () => ({ status: "inserted" }) }: { request: Request; userId: number; noteId: number; selectedDate: string; recordTimezone?: string; categories?: CategoryOption[]; projects?: ProjectOption[]; onQuoteToJournal?: (input: { noteId: number; targetDate: string; text: string; force?: boolean }) => JournalReferenceResult }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.quickNote(userId, noteId), enabled: Number.isInteger(noteId) && noteId > 0, queryFn: () => request<QuickNote>(`/api/quick-notes/${noteId}`) });
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const [inspirationStatus, setInspirationStatus] = useState<number | null>(null);
  const restoreOperationId = useRef<string | null>(null);
  const storageKey = `personal-workbench:quick-note-edit:${userId}:${noteId}`;
  const note = query.data;

  useEffect(() => {
    if (!note || loadedId === note.id) return;
    setDraft(readEditDraft(storageKey, note));
    setLoadedId(note.id);
  }, [loadedId, note, storageKey]);

  const dirty = Boolean(note && draft && (draft.noteDate !== note.noteDate || draft.title !== (note.title ?? "") || draft.content !== note.content || draft.tag !== (note.tag ?? "") || draft.projectId !== String(note.projectId ?? "")));
  useEffect(() => {
    if (!draft) return;
    if (dirty) localStorage.setItem(storageKey, JSON.stringify(draft));
    else localStorage.removeItem(storageKey);
  }, [dirty, draft, storageKey]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.content.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const updated = await request<QuickNote>(`/api/quick-notes/${noteId}`, { method: "PUT", body: JSON.stringify({ expectedVersion: draft.baseVersion, noteDate: draft.noteDate, title: draft.title, content: draft.content, tag: draft.tag, projectId: draft.projectId ? Number(draft.projectId) : null }) });
      queryClient.setQueryData(queryKeys.quickNote(userId, noteId), updated);
      setDraft(toDraft(updated));
      localStorage.removeItem(storageKey);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["quick-notes", userId] }), queryClient.invalidateQueries({ queryKey: ["project-materials", userId] })]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tx("保存失败"));
    } finally {
      setPending(false);
    }
  }

  async function command(action: "archive" | "unarchive" | "delete" | "restore") {
    if (!note || pending || dirty) return;
    setPending(true);
    setError(null);
    try {
      const path = action === "delete" ? `/api/quick-notes/${note.id}` : `/api/quick-notes/${note.id}/${action}`;
      if (action === "restore" && !restoreOperationId.current) restoreOperationId.current = crypto.randomUUID();
      const updated = await request<QuickNote>(path, { method: action === "delete" ? "DELETE" : "POST", body: JSON.stringify({ expectedVersion: note.version, ...(action === "restore" ? { operationId: restoreOperationId.current } : {}) }) });
      if (action === "restore") restoreOperationId.current = null;
      queryClient.setQueryData(queryKeys.quickNote(userId, noteId), updated);
      setDraft(toDraft(updated));
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["quick-notes", userId] }), queryClient.invalidateQueries({ queryKey: ["trash", userId] }), queryClient.invalidateQueries({ queryKey: ["project-materials", userId] })]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tx("操作失败"));
    } finally {
      setPending(false);
    }
  }

  if (query.isPending) return <section className="quick-notes-route"><div className="notes-skeleton" aria-label={tx("随手记加载中")} /></section>;
  if (query.isError || !note || !draft) return <section className="quick-notes-route"><div className="notes-error"><h1>{tx("随手记没有加载成功")}</h1><p>{query.error instanceof Error ? query.error.message : tx("记录不存在")}</p><Button onClick={() => void query.refetch()}>{tx("重试")}</Button></div></section>;

  return <section className="quick-notes-route">
    <header className="quick-notes-head"><div><Link className="notes-back" to={`/notes?date=${selectedDate}`}><ArrowLeft size={15} />{tx("返回随手记")}</Link><h1>{tx("随手记详情")}</h1><p>{tx("记录日期")} {formatNoteDate(note.noteDate)} {tx("· 创建于")} {formatCreatedAt(note.createdAt)}</p></div><NoteState note={note} /></header>
    <form className="quick-note-detail" onSubmit={save}>
      <div className="quick-note-fields">
        <input aria-label={tx("随手记标题")} maxLength={120} placeholder={tx("标题（可选）")} disabled={Boolean(note.deletedAt)} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <input aria-label={tx("随手记标签")} maxLength={64} placeholder={tx("标签（可选）")} disabled={Boolean(note.deletedAt)} value={draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value })} />
        <input aria-label={tx("记录日期")} type="date" disabled={Boolean(note.deletedAt)} value={draft.noteDate} onChange={(event) => setDraft({ ...draft, noteDate: event.target.value })} />
      </div>
      <label className="note-project-field">{tx("关联项目")}<select aria-label={tx("关联项目")} className="field" disabled={Boolean(note.deletedAt)} value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}><option value="">{tx("无项目")}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}{note.linkedProject?.archivedAt && !projects.some((project) => project.id === note.linkedProject?.id) ? <option value={note.linkedProject.id}>{note.linkedProject.name}{tx("（已归档）")}</option> : null}</select><small>{tx("关联只建立素材入口，不会创建悬赏或复制正文。")}</small></label>
      <textarea aria-label={tx("随手记正文")} className="quick-note-body" maxLength={5000} disabled={Boolean(note.deletedAt)} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
      {note.linkedTask ? <aside className="note-source-link"><div><strong>{tx("已转为悬赏")}</strong><span>{note.linkedTask.title} · {linkedTaskState(note.linkedTask)}</span></div>{note.linkedTask.deletedAt ? null : <Link to={`/tasks/${note.linkedTask.id}?date=${selectedDate}`}>{tx("查看悬赏")}</Link>}</aside> : null}
      {error ? <p className="quick-note-error" role="alert">{error}{dirty ? tx("。当前草稿仍保留在本设备。") : ""}</p> : null}
      <div className="quick-note-detail-actions">
        <div>
          {!note.deletedAt && !note.linkedTask ? <Button type="button" disabled={dirty} onClick={() => setConvertOpen(true)}><CheckSquare2 size={14} />{tx("转为悬赏")}</Button> : null}
          {!note.deletedAt ? <Button type="button" disabled={dirty} onClick={() => setQuoteOpen(true)}><NotebookPen size={14} />{tx("引用到日记")}</Button> : null}
          {!note.deletedAt ? <Button type="button" disabled={dirty} onClick={() => { setInspirationStatus(null); setInspirationOpen(true); }}><Lightbulb size={14} />{tx("加入灵感库")}</Button> : null}
          {!note.deletedAt && !note.archivedAt ? <Button variant="secondary" type="button" disabled={dirty} onClick={() => void command("archive")}><Archive size={14} />{tx("归档")}</Button> : null}
          {!note.deletedAt && note.archivedAt ? <Button variant="secondary" type="button" disabled={dirty} onClick={() => void command("unarchive")}><ArchiveRestore size={14} />{tx("取消归档")}</Button> : null}
          {!note.deletedAt ? <Button variant="danger" type="button" disabled={dirty} onClick={() => void command("delete")}><Trash2 size={14} />{tx("移到回收")}</Button> : <Button variant="secondary" type="button" onClick={() => void command("restore")}><RotateCcw size={14} />{tx("恢复")}</Button>}
        </div>
        {!note.deletedAt ? <Button variant="primary" type="submit" loading={pending} disabled={!dirty || !draft.content.trim()}>{tx("保存修改")}</Button> : null}
      </div>
    </form>
    {convertOpen ? <ConvertNoteDialog note={note} selectedDate={selectedDate} recordTimezone={recordTimezone} categories={categories} request={request} onClose={() => setConvertOpen(false)} onConverted={async () => { setConvertOpen(false); await query.refetch(); await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.tasks(userId) }), queryClient.invalidateQueries({ queryKey: queryKeys.assignments(userId, selectedDate) })]); }} /> : null}
      {quoteOpen ? <QuoteNoteDialog note={note} selectedDate={selectedDate} onClose={() => setQuoteOpen(false)} onQuote={(input) => { const result = onQuoteToJournal(input); if (result.status === "inserted") { setQuoteOpen(false); navigate(`/journal?date=${input.targetDate}`); } return result; }} /> : null}
      {inspirationOpen ? <QuickNoteInspirationDialog request={request} userId={userId} noteId={note.id} onClose={() => setInspirationOpen(false)} onDone={(id) => { setInspirationOpen(false); setInspirationStatus(id); void queryClient.invalidateQueries({ queryKey: ["inspirations", userId] }); }} /> : null}
      {inspirationStatus ? <p className="quick-note-success" role="status">{tx("已加入灵感库。")}<Link to="/inspirations">{tx("查看灵感库")}</Link></p> : null}
  </section>;
}

function ConvertNoteDialog({ note, selectedDate, recordTimezone, categories, request, onClose, onConverted }: { note: QuickNote; selectedDate: string; recordTimezone: string; categories: CategoryOption[]; request: Request; onClose: () => void; onConverted: () => void | Promise<void> }) {
  const tooLong = note.content.length > 2000;
  const [operationId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(note.title?.trim() || note.content.trim().split(/\r?\n/, 1)[0].slice(0, 200));
  const [description, setDescription] = useState(tooLong ? "" : note.content);
  const [categoryId, setCategoryId] = useState("");
  const [difficulty, setDifficulty] = useState("2");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, setPending] = useState<"publish" | "accept" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(accept: boolean) {
    if (!title.trim() || !description.trim() || description.length > 2000 || pending) return;
    setPending(accept ? "accept" : "publish"); setError(null);
    try {
      await request(`/api/quick-notes/${note.id}/convert-to-task`, { method: "POST", body: JSON.stringify({ operationId, title: title.trim(), description: description.trim(), categoryId: categoryId ? Number(categoryId) : undefined, priority: 2, difficulty: Number(difficulty), estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined, dueAt: dueAt || undefined, acceptDate: accept ? selectedDate : undefined, recordTimezone }) });
      await onConverted();
    } catch (caught) { setError(caught instanceof Error ? caught.message : tx("转换失败")); setPending(null); }
  }

  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}><section className="quick-note-editor note-convert-dialog" role="dialog" aria-modal="true" aria-labelledby="convert-note-title"><header className="quick-note-editor-head"><div><p className="route-eyebrow">{tx("确认行动快照")}</p><h2 id="convert-note-title">{tx("转为悬赏")}</h2></div><Button iconOnly aria-label={tx("关闭")} onClick={onClose}><X size={16} /></Button></header><p className="note-length-hint">{tx("原文")} {formatNumber(note.content.length)} {tx("字 · 任务描述上限 2,000 字。原随手记不会被改写。")}</p><label>{tx("标题")}<input className="field" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{tx("行动摘要")}<textarea aria-label={tx("任务行动摘要")} className="quick-note-body note-action-summary" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{tooLong && !description.trim() ? <p className="quick-note-error">{tx("原文超过任务上限，请先写下明确的行动摘要。")}</p> : null}<div className="note-convert-fields"><label>{tx("分类")}<select className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">{tx("Inbox / 未分类")}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>{tx("难度")}<select className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="1">{tx("轻松")}</option><option value="2">{tx("普通")}</option><option value="3">{tx("困难")}</option><option value="4">{tx("硬仗")}</option></select></label><label>{tx("预计分钟")}<input className="field" min="1" type="number" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} /></label><label>{tx("截止时间")}<input className="field" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label></div>{error ? <p className="quick-note-error" role="alert">{error}</p> : null}<footer className="note-dialog-actions"><Button onClick={onClose}>{tx("取消")}</Button><Button loading={pending === "publish"} disabled={!title.trim() || !description.trim() || description.length > 2000} onClick={() => void submit(false)}>{tx("发布悬赏")}</Button><Button variant="primary" loading={pending === "accept"} disabled={!title.trim() || !description.trim() || description.length > 2000} onClick={() => void submit(true)}>{tx("发布并接取")}</Button></footer></section></div></div>, document.body);
}

function QuoteNoteDialog({ note, selectedDate, onClose, onQuote }: { note: QuickNote; selectedDate: string; onClose: () => void; onQuote: (input: { noteId: number; targetDate: string; text: string; force?: boolean }) => JournalReferenceResult }) {
  const [text, setText] = useState(note.content);
  const [targetDate, setTargetDate] = useState(selectedDate);
  const [duplicate, setDuplicate] = useState(false);
  function quote(force = false) { const result = onQuote({ noteId: note.id, targetDate, text: text.trim(), force }); setDuplicate(result.status === "duplicate"); }
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}><section className="quick-note-editor note-quote-dialog" role="dialog" aria-modal="true" aria-labelledby="quote-note-title"><header className="quick-note-editor-head"><div><p className="route-eyebrow">{tx("本设备草稿")}</p><h2 id="quote-note-title">{tx("引用到日记")}</h2></div><Button iconOnly aria-label={tx("关闭")} onClick={onClose}><X size={16} /></Button></header><label>{tx("日记日期")}<input aria-label={tx("日记日期")} className="field" type="date" value={targetDate} onChange={(event) => { setTargetDate(event.target.value); setDuplicate(false); }} /></label><label>{tx("引用文字")}<textarea aria-label={tx("引用文字")} className="quick-note-body note-action-summary" value={text} onChange={(event) => setText(event.target.value)} /></label>{duplicate ? <p className="quick-note-error">{tx("这条随手记已经引用到该日期的草稿或日记。")}</p> : null}<footer className="note-dialog-actions"><Button onClick={onClose}>{tx("取消")}</Button>{duplicate ? <Button variant="danger" disabled={!text.trim()} onClick={() => quote(true)}>{tx("再次引用")}</Button> : <Button variant="primary" disabled={!text.trim()} onClick={() => quote(false)}>{tx("加入草稿并打开日记")}</Button>}</footer></section></div></div>, document.body);
}

function linkedTaskState(task: NonNullable<QuickNote["linkedTask"]>) { return task.deletedAt ? "已删除" : task.status === 3 ? "已归档" : task.status === 2 ? "已完成" : task.status === 1 ? "进行中" : "待处理"; }

function NoteState({ note }: { note: QuickNote }) {
  if (note.deletedAt) return <Badge tone="danger">{tx("回收中")}</Badge>;
  if (note.archivedAt) return <Badge tone="warning">{tx("已归档")}</Badge>;
  return <Badge tone="success">{tx("活跃")}</Badge>;
}

function toDraft(note: QuickNote): EditDraft {
  return { baseVersion: note.version, noteDate: note.noteDate, title: note.title ?? "", content: note.content, tag: note.tag ?? "", projectId: String(note.projectId ?? "") };
}

function readEditDraft(key: string, note: QuickNote): EditDraft {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as EditDraft | null;
    if (stored && typeof stored.content === "string" && Number.isInteger(stored.baseVersion)) return stored;
  } catch {
    localStorage.removeItem(key);
  }
  return toDraft(note);
}
