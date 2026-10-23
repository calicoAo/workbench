import { useQuery } from "@tanstack/react-query";
import { Badge, Button } from "../../shared/ui";
import { getActiveLocale, tx } from "../../app/i18n";
import type { Category } from "../categories";
import type { Request } from "./model";

type Completion = { id: number; taskId: number; title: string; businessDate: string; occurredAt: string; categoryIdAtOccurrence: number | null };

// Completion events outlive assignments and subsequent Task reopen/archive transitions.
export function CompletedDay({ request, userId, date, timezone, categoryFilter, categories }: {
  request: Request; userId: number; date: string; timezone: string; categoryFilter: string; categories: Category[];
}) {
  const query = useQuery({ queryKey: ["task-completions", userId, date], queryFn: () => request<Completion[]>(`/api/tasks/completions?date=${date}`) });
  const rows = (Array.isArray(query.data) ? query.data : []).filter((event) => categoryFilter === "all" || (categoryFilter === "none" ? !event.categoryIdAtOccurrence : categories.find((item) => item.id === event.categoryIdAtOccurrence)?.dimensionKey === categoryFilter));
  if (query.isError) return <div role="alert">{tx("完成记录加载失败")} <Button size="sm" onClick={() => void query.refetch()}>{tx("重试")}</Button></div>;
  if (!rows.length) return null;
  return <section className="task-section" aria-label={tx("当日完成记录")}><div className="task-section-head"><span>{tx("当日已完成")}</span><Badge>{rows.length}</Badge></div><div className="space-y-2">{rows.map((event) => <a className="completed-task-row" key={event.id} href={`/tasks/${event.taskId}?date=${date}`}><strong>{event.title}</strong><small>{tx("已完成")} · {new Intl.DateTimeFormat(getActiveLocale(), { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.occurredAt))}</small></a>)}</div></section>;
}
