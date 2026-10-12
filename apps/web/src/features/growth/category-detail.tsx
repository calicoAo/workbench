import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { Button } from "../../shared/ui";
import type { GrowthCategoryContribution, GrowthContributionMetrics, GrowthDimension } from "./contracts";
import { GrowthTrend } from "./overview";
import { categoryName, ContributionMetrics, duration } from "./category-insights";
import { growthDimensionName } from "./dimension-selection";

export type TaskContribution = GrowthContributionMetrics & { taskRef: string; taskId: number | null; title: string | null; available: boolean; completionNote?: string | null };
export type CategoryDetail = {
  period: { days: number; from: string; to: string; timezone: string }; category: GrowthCategoryContribution; dimension: GrowthDimension | null;
  tasks: TaskContribution[]; task: TaskContribution | null; nextCursor: string | null;
  executions: { source: string; sourceId: number; timerSessionId: number | null; startedAt: string | null; endedAt: string | null; fullDurationSeconds: number | null; attributedSeconds: number; recordTimezone: string; slices: { businessDate: string; startedAt: string; endedAt: string; durationSeconds: number }[] }[];
  sessions: { id: number; note: string | null; startedAt: string | null; endedAt: string | null }[];
  completions: { id: number; occurredAt: string; businessDate: string; lifecycleVersion: number }[];
};
const time = (value: string | null, timezone: string) => value ? new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, dateStyle: "short", timeStyle: "medium" }).format(new Date(value)) : "—";
export function CategoryDetailView({ request, userId, date, period, categoryRef, taskRef, cursor, onTask, onPage, onBack }: { request: Request; userId: number; date: string; period: number; categoryRef: string; taskRef: string | null; cursor: string | null; onTask: (ref: string) => void; onPage: (cursor: string | null) => void; onBack: () => void }) {
  const params = new URLSearchParams({ period: String(period), to: date });
  if (taskRef) params.set("taskRef", taskRef);
  if (cursor) params.set("cursor", cursor);
  const query = useQuery({ queryKey: ["growth-overview", userId, "category", categoryRef, period, date, taskRef, cursor], queryFn: () => request<CategoryDetail>(`/api/growth/categories/${encodeURIComponent(categoryRef)}?${params}`) });
  return <section className="growth-category-detail">
    <Button variant="ghost" size="sm" className="growth-detail-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />{taskRef ? tx("返回分类") : tx("返回成长")}</Button>
    {query.isPending ? <p role="status">{tx("正在加载贡献详情…")}</p> : query.isError || !query.data ? <div role="alert"><p>{tx("贡献详情不可用，请重试或返回成长。")}</p><Button onClick={() => void query.refetch()}>{tx("重试")}</Button></div> : <DetailContent detail={query.data} onTask={onTask} date={date} />}
    {query.data && !query.isError ? <nav aria-label={tx("贡献分页")}><Button disabled={!cursor} onClick={() => onPage(null)}>{tx("首页")}</Button><Button disabled={!query.data.nextCursor} onClick={() => onPage(query.data!.nextCursor)}>{tx("下一页")}</Button></nav> : null}
  </section>;
}
function DetailContent({ detail, onTask, date }: { detail: CategoryDetail; onTask: (ref: string) => void; date: string }) {
  return <>
    <header className="growth-detail-heading" style={{ borderInlineStartColor: detail.category.color ?? undefined }}><h2 tabIndex={-1}>{categoryName(detail.category)}</h2><p>{tx("当前映射")}：{detail.category.resolvedDimensionKey && detail.dimension ? growthDimensionName(detail.dimension) : tx("未映射能力维度")}</p>
    <p>{detail.period.from} – {detail.period.to} · {detail.period.timezone}</p></header><ContributionMetrics metrics={detail.category} /><GrowthTrend items={detail.category.trend} />
    {!detail.task ? <section className="growth-task-list"><h3>{tx("贡献任务")}</h3>{detail.tasks.length ? detail.tasks.map((task) => <article className="growth-task-contribution" key={task.taskRef}><Button variant="ghost" size="sm" onClick={() => onTask(task.taskRef)} aria-label={tx("查看任务贡献：{value0}", { value0: task.title ?? tx("未关联任务") })}>{task.title ?? tx("未关联任务")}</Button>{!task.available && task.taskId ? <small>{tx("任务已不可用，历史贡献保留。")}</small> : null}<ContributionMetrics metrics={task} /></article>) : <p role="status">{tx("本期暂无贡献记录。")}</p>}</section> : <TaskHistory detail={detail} date={date} />}
  </>;
}
function TaskHistory({ detail, date }: { detail: CategoryDetail; date: string }) {
  const task = detail.task!;
  return <section className="growth-task-history"><h3>{task.title ?? tx("未关联任务")}</h3><ContributionMetrics metrics={task} />{task.available && task.taskId ? <Link className="ui-button ui-button-secondary ui-button-sm" to={`/tasks/${task.taskId}?date=${date}`}><span className="ui-button-visual">{tx("打开任务详情")}</span></Link> : null}
    {task.completionNote?.trim() ? <aside><h4>{tx("任务完成反思（当前）")}</h4><p>{task.completionNote}</p></aside> : null}
    <h4>{tx("执行记录")}</h4>
    {detail.sessions.map((session) => <section className="growth-session-history" key={session.id}><h5>{tx("计时会话 #{value0}", { value0: session.id })}{session.note?.trim() ? " · " + tx("有会话备注") : ""}</h5><p>{time(session.startedAt, detail.period.timezone)} – {time(session.endedAt, detail.period.timezone)}</p>{session.note?.trim() ? <aside><strong>{tx("本次执行备注")}</strong><p>{session.note}</p></aside> : null}{detail.executions.filter((e) => e.timerSessionId === session.id).map((entry) => <Execution key={entry.sourceId} entry={entry} timezone={detail.period.timezone} />)}</section>)}
    {detail.executions.filter((e) => e.timerSessionId === null).map((entry) => <Execution key={`${entry.source}:${entry.sourceId}`} entry={entry} timezone={detail.period.timezone} />)}
    {!detail.executions.length ? <p>{tx("本页无执行记录。")}</p> : null}
    <h4>{tx("完成事件")}</h4>{detail.completions.map((event) => <p key={event.id}># {event.id} · {event.businessDate} · {time(event.occurredAt, detail.period.timezone)} · {tx("完成序次")} {event.lifecycleVersion}</p>)}
    <p className="growth-metric-note">{tx("完成事件不等于当前已完成任务数；执行段按 CLOSED Segment 去重，暂停间隔不计入投入。")}</p>
  </section>;
}
function Execution({ entry, timezone }: { entry: CategoryDetail["executions"][number]; timezone: string }) {
  return <article className="growth-execution-record"><strong>{entry.source === "TIMER_SEGMENT" ? tx("执行段") : entry.source === "MANUAL_ACTUAL" ? tx("补录实际") : tx("历史实际")} #{entry.sourceId}</strong><p>{time(entry.startedAt, timezone)} – {time(entry.endedAt, timezone)}</p><p>{tx("完整区间时长")}：{entry.fullDurationSeconds === null ? "—" : duration(entry.fullDurationSeconds)} · {tx("本期归属投入")}：{duration(entry.attributedSeconds)}</p><details><summary>{tx("业务日期切片")}</summary>{entry.slices.map((slice, i) => <p key={i}>{slice.businessDate} · {duration(slice.durationSeconds)} · {time(slice.startedAt, timezone)} – {time(slice.endedAt, timezone)}</p>)}</details></article>;
}
