import { useInfiniteQuery } from "@tanstack/react-query";
import { CalendarDays, CheckSquare2, FileText, NotebookPen, Search, SlidersHorizontal } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Request } from "../../app/api";
import { Button, FilterChip } from "../../shared/ui";

type SearchType = "task" | "quick_note" | "journal" | "morning_writing" | "schedule";
type SearchItem = { type: SearchType; id: number; title: string; snippet: string; date: string; deepLink: string };
type SearchPage = { items: SearchItem[]; nextCursor: string | null; archivedPolicy: string };
const types: Array<{ value: "" | SearchType; label: string }> = [{ value: "", label: "全部" }, { value: "task", label: "任务" }, { value: "quick_note", label: "随手记" }, { value: "journal", label: "日记" }, { value: "morning_writing", label: "晨写" }, { value: "schedule", label: "日历" }];

export function SearchFeature({ request, userId }: { request: Request; userId: number }) {
  const [params, setParams] = useSearchParams();
  const filters = { q: params.get("q") ?? "", type: params.get("type") ?? "", from: params.get("from") ?? "", to: params.get("to") ?? "" };
  const [draft, setDraft] = useState(filters);
  const [advanced, setAdvanced] = useState(Boolean(filters.from || filters.to));
  const query = useInfiniteQuery({
    queryKey: ["global-search", userId, filters],
    enabled: Boolean(filters.q.trim()),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => request<SearchPage>(searchPath(filters, pageParam)),
    getNextPageParam: (page) => page.nextCursor ?? undefined
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(draft)) if (value) next.set(key, value);
    setParams(next);
  }
  function chooseType(type: string) { setDraft((current) => ({ ...current, type })); const next = new URLSearchParams(params); type ? next.set("type", type) : next.delete("type"); setParams(next); }

  return <section className="search-route"><header className="route-panel-heading"><div><p className="route-eyebrow">已稳定领域</p><h1>搜索</h1><p>查找任务、个人文字和日历记录。</p></div><Search size={20} /></header><form className="global-search-form" onSubmit={submit}><div className="search-main-row"><label className="search-field"><Search size={16} /><input autoFocus aria-label="全局搜索" placeholder="搜索任务、文字或日历" value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} /></label><Button type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}><SlidersHorizontal size={15} />筛选</Button><Button variant="primary" type="submit">搜索</Button></div><div className="search-type-chips" aria-label="搜索类型">{types.map((item) => <FilterChip key={item.value || "all"} active={draft.type === item.value} onClick={() => chooseType(item.value)}>{item.label}</FilterChip>)}</div>{advanced ? <div className="search-advanced"><label>开始日期<input aria-label="搜索开始日期" className="field" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label><label>结束日期<input aria-label="搜索结束日期" className="field" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label></div> : null}</form>{!filters.q ? <div className="route-state">输入关键词开始查找。</div> : null}{query.isPending ? <div className="route-state">正在搜索...</div> : null}{query.isError ? <div className="notes-error" role="alert">{query.error instanceof Error ? query.error.message : "搜索失败"}</div> : null}{filters.q && !query.isPending && !query.isError && !items.length ? <div className="route-state">没有匹配记录。</div> : null}{items.length ? <div className="search-results">{items.map((item) => <Link key={`${item.type}:${item.id}`} className="search-result" to={item.deepLink}><span className="search-result-icon">{resultIcon(item.type)}</span><span><strong>{item.title}</strong><small>{item.snippet || "无摘要"}</small><em>{typeLabel(item.type)} · {item.date}</em></span></Link>)}</div> : null}{query.hasNextPage ? <div className="notes-load-more"><Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>加载更多</Button></div> : null}</section>;
}

function searchPath(filters: { q: string; type: string; from: string; to: string }, cursor: string | null) { const params = new URLSearchParams({ q: filters.q, limit: "20" }); for (const key of ["type", "from", "to"] as const) if (filters[key]) params.set(key, filters[key]); if (cursor) params.set("cursor", cursor); return `/api/search?${params}`; }
function typeLabel(type: SearchType) { return ({ task: "任务", quick_note: "随手记", journal: "日记", morning_writing: "晨写", schedule: "日历" } as const)[type]; }
function resultIcon(type: SearchType) { if (type === "task") return <CheckSquare2 size={17} />; if (type === "schedule") return <CalendarDays size={17} />; if (type === "quick_note") return <NotebookPen size={17} />; return <FileText size={17} />; }
