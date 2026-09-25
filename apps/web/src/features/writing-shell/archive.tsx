import { Archive, Lightbulb, NotebookPen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Request } from "../../app/api";

type ArchivedNote = { id: number; noteDate: string; title: string | null; content: string; tag: string | null };
type ArchivedInspiration = { id: number; quickNoteId: number; note: { noteDate: string; title: string | null; content: string } };

export function WritingArchivePage({ request, userId, selectedDate }: { request: Request; userId: number; selectedDate: string }) {
  const notes = useQuery({ queryKey: ["writing-archive-notes", userId], queryFn: () => request<{ items: ArchivedNote[] }>("/api/quick-notes?state=archived&limit=50") });
  const inspirations = useQuery({ queryKey: ["writing-archive-inspirations", userId], queryFn: () => request<{ items: ArchivedInspiration[] }>("/api/writing/inspirations?state=archived&limit=50") });
  const items = [
    ...(notes.data?.items ?? []).map((item) => ({ kind: "note" as const, date: item.noteDate, id: item.id, title: item.title?.trim() || "随手记", excerpt: item.content, tag: item.tag, href: `/notes/${item.id}?date=${item.noteDate}` })),
    ...(inspirations.data?.items ?? []).map((item) => ({ kind: "inspiration" as const, date: item.note.noteDate, id: item.id, title: item.note.title?.trim() || "灵感", excerpt: item.note.content, tag: null, href: `/notes/${item.quickNoteId}?date=${item.note.noteDate}` }))
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const loading = notes.isPending || inspirations.isPending;
  return <section className="writing-archive-route"><header className="writing-archive-head"><div><p className="route-eyebrow">文字 / Writing</p><h1>归档</h1><p>已从活跃 Writing 内容中移出的记录，可从原业务入口继续恢复。</p></div><Archive size={20} aria-hidden="true" /></header>{loading ? <p className="route-state">正在加载归档...</p> : items.length ? <div className="writing-archive-list">{items.map((item) => <article className="writing-archive-item" key={`${item.kind}-${item.id}`}><div className="writing-archive-icon">{item.kind === "note" ? <NotebookPen size={16} /> : <Lightbulb size={16} />}</div><div className="writing-archive-content"><div><span className="writing-archive-kind">{item.kind === "note" ? "随手记" : "灵感库"}</span><time dateTime={item.date}>{item.date}</time></div><h2>{item.title}</h2><p>{item.excerpt}</p>{item.tag ? <small>#{item.tag}</small> : null}</div><Link className="inline-command" to={`${item.href}${item.href.includes("?") ? "&" : "?"}from=archive`}>查看原文</Link></article>)}</div> : <div className="writing-archive-empty"><Archive size={24} /><h2>还没有归档内容</h2><p>在随手记或灵感库中归档的内容会出现在这里。</p><Link className="inline-command" to={`/writing?date=${selectedDate}`}>返回文字</Link></div>}</section>;
}
