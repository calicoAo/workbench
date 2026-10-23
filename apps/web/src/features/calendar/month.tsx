import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useState } from "react";
import { Button } from "../../shared/ui";
import { getActiveLocale, tx } from "../../app/i18n";
import type { Request } from "../../app/api";

type Activity = { id: string; kind: "ACTUAL" | "COMPLETION" | "PLANNED"; businessDate: string; title: string; taskId: number | null; startedAt: string | null; endedAt: string | null; startTime?: string; endTime?: string; durationSeconds: number; completed: boolean; color: string };
function shift(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

export function MonthActivityCalendar({ request, userId, date, timezone }: { request: Request; userId: number; date: string; timezone: string }) {
  const first = `${date.slice(0, 7)}-01`;
  const from = shift(first, -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7));
  const to = shift(from, 41);
  const [selection, setSelection] = useState(date);
  const selected = selection;
  const query = useQuery({ queryKey: ["calendar-month-activities", userId, from, to, timezone], queryFn: () => request<{ activities: Activity[] }>(`/api/schedules/month-activities?from=${from}&to=${to}&timezone=${encodeURIComponent(timezone)}`) });
  const activities = query.data?.activities ?? [];
  const monthLink = (offset: number) => { const value = new Date(`${first}T00:00:00Z`); value.setUTCMonth(value.getUTCMonth() + offset); return `/calendar?view=month&date=${value.toISOString().slice(0, 10)}`; };
  const time = (item: Activity) => item.startTime?.slice(0, 5) ?? (item.startedAt ? new Intl.DateTimeFormat(getActiveLocale(), { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(item.startedAt)) : "");
  const label = (item: Activity) => `${item.kind === "PLANNED" ? tx("计划") : item.kind === "COMPLETION" ? tx("已完成") : tx("实际")} · ${time(item)}${item.durationSeconds ? ` · ${Math.floor(item.durationSeconds / 60)}m` : ""}`;
  if (query.isError) return <div role="alert">{tx("月历加载失败")} <Button onClick={() => void query.refetch()}>{tx("重试")}</Button></div>;
  return <section className="activity-month" aria-label={tx("事项月历")}>
    <header className="activity-month-heading"><Link aria-label={tx("上个月")} to={monthLink(-1)}>‹</Link><h2>{date.slice(0, 7)}</h2><Link aria-label={tx("下个月")} to={monthLink(1)}>›</Link></header>
    <p className="text-soft text-xs">{tx("实际事项与完成记录；虚线表示计划。点击日期查看全部事项。")}</p>
    {query.isPending ? <p role="status">{tx("加载中…")}</p> : null}
    <div className="activity-month-grid" role="grid" aria-label={tx("月视图")}>
      {[tx("周一"), tx("周二"), tx("周三"), tx("周四"), tx("周五"), tx("周六"), tx("周日")].map((day) => <div role="columnheader" className="activity-weekday" key={day}>{day}</div>)}
      {Array.from({ length: 42 }, (_, index) => shift(from, index)).map((day) => {
        const rows = activities.filter((item) => item.businessDate === day);
        return <div role="gridcell" key={day} className={`activity-day ${day.slice(0, 7) !== date.slice(0, 7) ? "is-outside" : ""} ${day === selected ? "is-selected" : ""}`}><button type="button" aria-label={day} aria-pressed={day === selected} onClick={() => setSelection(day)}>{Number(day.slice(-2))}<small>{rows.length || ""}</small></button><div className="activity-day-entries">{rows.slice(0, 4).map((item) => <Link key={item.id} className={`activity-chip is-${item.kind.toLowerCase()}`} style={{ borderLeftColor: item.color }} title={`${item.title} · ${label(item)}`} to={item.taskId ? `/tasks/${item.taskId}?date=${day}` : `/calendar?date=${day}`}><span>{item.completed ? "✓ " : ""}{item.title}</span><small>{label(item)}</small></Link>)}{rows.length > 4 ? <button type="button" onClick={() => setSelection(day)}>{tx("还有 {value0} 项", { value0: rows.length - 4 })}</button> : null}</div></div>;
      })}
    </div>
    <section className="activity-day-detail" aria-label={tx("所选日期事项")}><h3>{selected}</h3>{!query.isPending && !activities.some((item) => item.businessDate === selected) ? <p>{tx("这一天还没有事项记录。")}</p> : null}{activities.filter((item) => item.businessDate === selected).map((item) => <Link key={item.id} className={`activity-chip is-${item.kind.toLowerCase()}`} style={{ borderLeftColor: item.color }} to={item.taskId ? `/tasks/${item.taskId}?date=${selected}` : `/calendar?date=${selected}`}><strong>{item.title}</strong><small>{label(item)}</small></Link>)}<Link className="inline-command" to={`/calendar?date=${selected}`}>{tx("打开当日时间轴")}</Link></section>
  </section>;
}
