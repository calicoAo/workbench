import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Badge, Button, FilterChip } from "../../shared/ui";

type TrashType = "all" | "quick_note";
type TrashItem = { type: "quick_note"; id: number; title: string; excerpt: string; noteDate: string; tag: string | null; projectId: number | null; version: number; deletedAt: string; restoreDeepLink: string };
type TrashPage = { items: TrashItem[]; nextCursor: string | null; supportedTypes: Array<"quick_note"> };

export function TrashPage({ request, userId }: { request: Request; userId: number }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<TrashType>("all");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [restoreIds, setRestoreIds] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const query = useInfiniteQuery({
    queryKey: queryKeys.trash(userId, type),
    initialPageParam: "",
    queryFn: ({ pageParam }) => request<TrashPage>(`/api/trash?type=${type}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (page) => page.nextCursor || undefined
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  async function restore(item: TrashItem) {
    if (pendingId !== null) return;
    const operationId = restoreIds[item.id] ?? crypto.randomUUID();
    setRestoreIds((current) => ({ ...current, [item.id]: operationId }));
    setPendingId(item.id);
    setErrors((current) => ({ ...current, [item.id]: "" }));
    try {
      await request(`/api/trash/${item.type}/${item.id}/restore`, { method: "POST", body: JSON.stringify({ operationId, expectedVersion: item.version }) });
      setRestoreIds((current) => { const next = { ...current }; delete next[item.id]; return next; });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["trash", userId] }), queryClient.invalidateQueries({ queryKey: ["quick-notes", userId] }), queryClient.invalidateQueries({ queryKey: queryKeys.quickNote(userId, item.id) }), queryClient.invalidateQueries({ queryKey: ["project-materials", userId] })]);
    } catch (error) {
      setErrors((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : "恢复失败" }));
    } finally {
      setPendingId(null);
    }
  }

  return <section className="trash-route">
    <header className="trash-head"><div><p className="route-eyebrow">Settings · Data</p><h1>回收站</h1><p>这里只显示可安全恢复的已删除记录。归档记录仍留在各自业务视图。</p></div><Link className="inline-command" to="/settings">返回设置</Link></header>
    <nav className="trash-filters" aria-label="回收站类型"><FilterChip active={type === "all"} onClick={() => setType("all")}>全部</FilterChip><FilterChip active={type === "quick_note"} onClick={() => setType("quick_note")}>随手记</FilterChip></nav>
    {query.isPending ? <p className="route-state">正在读取回收站...</p> : null}
    {query.isError ? <div className="notes-error" role="alert"><p>{query.error instanceof Error ? query.error.message : "回收站读取失败"}</p><Button onClick={() => void query.refetch()}>重试</Button></div> : null}
    {!query.isPending && !query.isError && !items.length ? <div className="trash-empty"><Trash2 size={28} /><h2>回收站是空的</h2><p>删除的随手记会暂存在这里，归档项目不会出现在回收站。</p></div> : null}
    <div className="trash-list">{items.map((item) => <article className="trash-item" key={`${item.type}:${item.id}`}><span className="trash-icon"><StickyNote size={18} /></span><div><div className="trash-item-title"><Link to={item.restoreDeepLink}>{item.title}</Link><Badge>随手记</Badge></div><p>{item.excerpt}</p><small>{item.noteDate}{item.tag ? ` · #${item.tag}` : ""} · 删除于 {formatTime(item.deletedAt)}</small>{errors[item.id] ? <span className="trash-error" role="alert">{errors[item.id]}</span> : null}</div><Button variant="secondary" loading={pendingId === item.id} onClick={() => void restore(item)}><RotateCcw size={15} />恢复</Button></article>)}</div>
    {query.hasNextPage ? <div className="trash-more"><Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>加载更多</Button></div> : null}
  </section>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
