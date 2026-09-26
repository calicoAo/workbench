import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Archive, CirclePause, CirclePlay, Clock3, Pencil, Play } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Badge, Button } from "../../shared/ui";
import { getActiveLocale, tx } from "../../app/i18n";

export type TaskSnapshot = {
  id: number;
  title: string;
  description: string | null;
  categoryId: number | null;
  projectId?: number | null;
  status: number;
  priority: number;
  difficulty: number;
  pinned: number;
  sortOrder: number;
  dueAt: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  progressPercent: number;
  version: number;
  createdAt: string;
  updatedAt?: string;
  completedAt: string | null;
  completionNote: string | null;
};

export function useTasks(request: Request, userId: number) {
  return useQuery({
    queryKey: queryKeys.tasks(userId),
    queryFn: () => request<TaskSnapshot[]>("/api/tasks")
  });
}

export function useTask(request: Request, userId: number, taskId: number) {
  return useQuery({
    queryKey: queryKeys.task(userId, taskId),
    enabled: Number.isInteger(taskId) && taskId > 0,
    queryFn: async () => {
      const payload = await request<TaskDetailPayload | TaskSnapshot[]>(`/api/tasks/${taskId}`);
      if (!Array.isArray(payload) && payload?.task) return payload;
      const rows = Array.isArray(payload) ? payload : await request<TaskSnapshot[]>("/api/tasks");
      const task = rows.find((item) => item.id === taskId);
      return task ? { task, assignments: [], plannedSchedules: [], actualEntries: [] } : null;
    }
  });
}

export type TaskDetailPayload = {
  task: TaskSnapshot;
  source?: { type: "QUICK_NOTE"; id: number } | null;
  assignments: Array<{ id: number; taskDate: string; assignmentStatus: number; focusRank: number | null }>;
  plannedSchedules: Array<{ id: number; scheduleDate: string; startTime: string; endTime: string; lifecycleState: number; title: string }>;
  actualEntries: Array<{ source: "TIMER_SEGMENT" | "MANUAL_ACTUAL" | "LEGACY_ACTUAL"; sourceId: number; startedAt: string | null; endedAt: string | null; businessDate: string; recordTimezone: string }>;
};

export function TasksIntegrationPage({ tasks, date, loading }: { tasks: TaskSnapshot[]; date: string; loading: boolean }) {
  return (
    <section className="route-panel" aria-labelledby="tasks-heading">
      <div className="route-panel-heading"><div><p className="route-eyebrow">{tx("任务事实")}</p><h1 id="tasks-heading">{tx("任务")}</h1></div><Badge>{tasks.length} {tx("项")}</Badge></div>
      {loading ? <p role="status" className="route-state">{tx("正在加载任务...")}</p> : null}
      {!loading && !tasks.length ? <p className="route-state">{tx("还没有任务。")}</p> : null}
      <div className="route-list">
        {tasks.map((task) => (
          <Link className="route-list-row" key={task.id} to={`/tasks/${task.id}?date=${date}`}>
            <span><strong>{task.title}</strong><small>{task.description || tx("进度 {value0}%", { value0: task.progressPercent })}</small></span>
            <Badge tone={task.status === 2 ? "success" : "neutral"}>{task.status === 2 ? tx("已完成") : task.status === 1 ? tx("进行中") : tx("待处理")}</Badge>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function TaskDetailPage({ detail, assigned, active, paused, date, pending, categoryName, onAccept, onStart, onPauseResume, finishAction, onComplete, onCompleteAndFinish, onEdit, onArchive }: {
  detail: TaskDetailPayload | null | undefined;
  assigned: boolean;
  active: boolean;
  paused: boolean;
  date: string;
  pending: boolean;
  categoryName?: string;
  onAccept: () => void;
  onStart: (task: TaskSnapshot, assigned: boolean) => void;
  onPauseResume?: () => void;
  finishAction?: ReactNode;
  onComplete: (task: TaskSnapshot) => void;
  onCompleteAndFinish?: (task: TaskSnapshot) => void;
  onEdit: (task: TaskSnapshot) => void;
  onArchive: (task: TaskSnapshot) => void;
}) {
  if (detail === undefined) return <p role="status" className="route-state">{tx("正在加载任务...")}</p>;
  if (detail === null) return <section className="route-panel"><h1>{tx("任务不存在")}</h1><Link to={`/tasks?date=${date}`}>{tx("返回悬赏板")}</Link></section>;
  const task = detail.task;
  return (
    <article className="route-panel task-detail" aria-labelledby="task-detail-heading">
      <Link className="inline-command" to={`/tasks?date=${date}`}><ArrowLeft size={15} />{tx("返回悬赏板")}</Link>
      <p className="route-eyebrow">Task #{task.id} · v{task.version}</p>
      <h1 id="task-detail-heading">{task.title}</h1>
      <p>{task.description || tx("暂无详情")}</p>
      {detail.source?.type === "QUICK_NOTE" ? <p className="task-source-note">{tx("来源：")}<Link to={`/notes/${detail.source.id}?date=${date}`}>{tx("随手记 #")}{detail.source.id}</Link>{tx("。这里只显示用户确认后的任务快照。")}</p> : null}
      <dl className="task-facts"><div><dt>{tx("当日接取")}</dt><dd>{assigned ? tx("已接取") : tx("未接取")}</dd></div><div><dt>{tx("状态")}</dt><dd>{task.status === 3 ? tx("已归档") : task.status === 2 ? tx("已完成") : task.status === 1 ? tx("进行中") : tx("待处理")}</dd></div><div><dt>{tx("分类")}</dt><dd>{categoryName || tx("Inbox / 未分类")}</dd></div><div><dt>{tx("优先级 / 难度")}</dt><dd>{["", tx("低"), tx("中"), tx("高")][task.priority]} / {task.difficulty}</dd></div><div><dt>{tx("截止 / 预计")}</dt><dd>{task.dueAt ? formatDate(task.dueAt) : tx("无截止")} · {task.estimatedMinutes ? tx("{value0} 分钟", { value0: task.estimatedMinutes }) : tx("未估时")}</dd></div><div><dt>{tx("进度")}</dt><dd>{task.progressPercent}%</dd></div><div><dt>{tx("创建")}</dt><dd>{formatDate(task.createdAt)}</dd></div><div><dt>{tx("更新")}</dt><dd>{task.updatedAt ? formatDate(task.updatedAt) : tx("未知")}</dd></div><div><dt>{tx("完成")}</dt><dd>{task.completedAt ? formatDate(task.completedAt) : tx("未完成")}</dd></div></dl>
      <div className="task-detail-actions">{task.status < 2 && !assigned ? <Button onClick={onAccept}>{tx("接取到今天")}</Button> : null}{!active && task.status < 2 ? <Button variant="primary" disabled={pending} onClick={() => onStart(task, assigned)}><Play size={16} />{pending ? tx("正在开始...") : assigned ? tx("开始") : tx("接取并开始")}</Button> : null}{active && onPauseResume ? <Button disabled={pending} onClick={onPauseResume}>{paused ? <CirclePlay size={16} /> : <CirclePause size={16} />}{paused ? tx("继续") : tx("暂停")}</Button> : null}{active ? finishAction : null}{task.status < 2 && !active ? <Button disabled={pending} onClick={() => onComplete(task)}>{tx("直接完成")}</Button> : null}{active && onCompleteAndFinish ? <Button variant="primary" disabled={pending} onClick={() => onCompleteAndFinish(task)}>{tx("完成悬赏并结束")}</Button> : null}<Button onClick={() => onEdit(task)}><Pencil size={15} />{tx("编辑")}</Button>{task.status !== 3 ? <Button variant="danger" onClick={() => onArchive(task)}><Archive size={15} />{tx("归档")}</Button> : null}</div>
      {task.completionNote ? <section className="detail-section"><h2>{tx("完成结果")}</h2><p>{task.completionNote}</p></section> : null}
      <section className="detail-section"><h2>{tx("计划块")}</h2>{detail.plannedSchedules.length ? <div className="detail-history">{detail.plannedSchedules.map((item) => <div key={item.id}><span>{tx("计划")}</span><strong>{item.scheduleDate} · {item.startTime.slice(0, 5)}-{item.endTime.slice(0, 5)}</strong><small>{["PENDING", "EXECUTED", "CANCELLED", "RESCHEDULED"][item.lifecycleState]}</small></div>)}</div> : <p className="muted">{tx("暂无计划。")}</p>}</section>
      <section className="detail-section"><h2>{tx("ActualTime 历史")}</h2>{detail.actualEntries.length ? <div className="detail-history">{detail.actualEntries.map((item) => <div key={`${item.source}:${item.sourceId}`}><Clock3 size={15} /><strong>{item.businessDate} · {sourceLabel(item.source)}</strong><small>{item.startedAt ? formatDate(item.startedAt) : tx("未知开始")} - {item.endedAt ? formatDate(item.endedAt) : tx("未知结束")} · {item.recordTimezone}</small></div>)}</div> : <p className="muted">{tx("尚无真实投入，不会显示虚构时长。")}</p>}</section>
    </article>
  );
}

function formatDate(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(getActiveLocale(), { dateStyle: "medium", timeStyle: "short" }).format(parsed); }
function sourceLabel(source: TaskDetailPayload["actualEntries"][number]["source"]) { return source === "TIMER_SEGMENT" ? "计时" : source === "MANUAL_ACTUAL" ? "补录" : "历史实际"; }
