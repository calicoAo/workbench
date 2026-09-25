import { useInfiniteQuery } from "@tanstack/react-query";
import { Archive, Lightbulb, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Badge, Button, FilterChip } from "../../shared/ui";
import { QuickNoteCaptureButton } from "./capture";
import { formatCreatedAt, formatNoteDate, noteTitle, type QuickNotePage, type QuickNoteState } from "./model";

export { QuickNoteCaptureButton } from "./capture";
export { QuickNoteDetailPage } from "./detail";
export type { QuickNote } from "./model";

export function QuickNotesPage({ request, userId, selectedDate, onCreated }: { request: Request; userId: number; selectedDate: string; onCreated?: () => void | Promise<void> }) {
  const [params, setParams] = useSearchParams();
  const state = validState(params.get("state")) ? params.get("state") as QuickNoteState : "active";
  const filters = { keyword: params.get("keyword") ?? "", tag: params.get("tag") ?? "", from: params.get("from") ?? "", to: params.get("to") ?? "" };
  const [form, setForm] = useState(filters);
  const [advanced, setAdvanced] = useState(Boolean(filters.tag || filters.from || filters.to));
  const filterKey = JSON.stringify({ state, ...filters });
  const query = useInfiniteQuery({
    queryKey: queryKeys.quickNotes(userId, filterKey),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => request<QuickNotePage>(buildListPath({ state, ...filters }, pageParam)),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });
  const notes = query.data?.pages.flatMap((page) => page.items) ?? [];

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(form)) value ? next.set(key, value) : next.delete(key);
      return next;
    });
  }

  function setState(nextState: QuickNoteState) {
    setParams((current) => { const next = new URLSearchParams(current); next.set("state", nextState); return next; });
  }

  return <section className="quick-notes-route">
    <header className="quick-notes-head"><div><p className="route-eyebrow">日记与复盘 / 灵感库</p><h1>随手记</h1><p>先捕捉，再决定它是否需要被整理。</p></div><QuickNoteCaptureButton request={request} userId={userId} selectedDate={selectedDate} onCreated={async () => { await onCreated?.(); }} /></header>
    <div className="notes-state-tabs" aria-label="随手记状态"><FilterChip active={state === "active"} onClick={() => setState("active")}>活跃</FilterChip><FilterChip active={state === "archived"} onClick={() => setState("archived")}><Archive size={13} />归档</FilterChip><FilterChip active={state === "deleted"} onClick={() => setState("deleted")}><Trash2 size={13} />回收</FilterChip></div>
    <form className="notes-filter" onSubmit={applyFilters}>
      <div className="notes-filter-main"><label><Search size={14} /><input aria-label="搜索随手记" placeholder="搜索正文或标题" value={form.keyword} onChange={(event) => setForm({ ...form, keyword: event.target.value })} /></label><Button size="sm" type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}><SlidersHorizontal size={14} />筛选</Button><Button size="sm" variant="primary" type="submit">搜索</Button></div>
      {advanced ? <div className="notes-filter-advanced"><label>标签<input aria-label="筛选标签" placeholder="#tag" value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} /></label><label>开始日期<input aria-label="起始记录日期" type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></label><label>结束日期<input aria-label="结束记录日期" type="date" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /></label></div> : null}
    </form>
    {query.isPending ? <div className="notes-list" aria-label="随手记加载中">{[1, 2, 3].map((item) => <div className="notes-skeleton" key={item} />)}</div> : null}
    {query.isError ? <div className="notes-error"><h2>随手记没有加载成功</h2><p>{query.error instanceof Error ? query.error.message : "请稍后重试"}</p><Button onClick={() => void query.refetch()}>重试</Button></div> : null}
    {!query.isPending && !query.isError && !notes.length ? <div className="notes-empty"><Lightbulb size={24} /><h2>{state === "active" ? "还没有随手记" : state === "archived" ? "还没有归档记录" : "回收区是空的"}</h2><p>{state === "active" ? "先把刚想到的东西记下来" : "这里会保留对应状态的记录"}</p>{state === "active" ? <QuickNoteCaptureButton request={request} userId={userId} selectedDate={selectedDate} /> : null}</div> : null}
    {notes.length ? <div className="notes-list">{notes.map((note) => <Link className="quick-note-card" key={note.id} to={`/notes/${note.id}?date=${selectedDate}`}><div className="quick-note-card-head"><div><h2>{noteTitle(note)}</h2><p>{note.content}</p></div>{note.deletedAt ? <Badge tone="danger">回收中</Badge> : note.archivedAt ? <Badge tone="warning">已归档</Badge> : null}</div><footer><span>记录日期 {formatNoteDate(note.noteDate)}</span><span>创建时间 {formatCreatedAt(note.createdAt)}</span>{note.tag ? <Badge>#{note.tag}</Badge> : null}</footer></Link>)}</div> : null}
    {query.hasNextPage ? <div className="notes-load-more"><Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>加载更多</Button></div> : null}
  </section>;
}

function validState(value: string | null): value is QuickNoteState {
  return value === "active" || value === "archived" || value === "deleted";
}

function buildListPath(filters: { state: QuickNoteState; keyword: string; tag: string; from: string; to: string }, cursor: string | null) {
  const params = new URLSearchParams({ state: filters.state, limit: "24" });
  for (const key of ["keyword", "tag", "from", "to"] as const) if (filters[key]) params.set(key, filters[key]);
  if (cursor) params.set("cursor", cursor);
  return `/api/quick-notes?${params}`;
}
