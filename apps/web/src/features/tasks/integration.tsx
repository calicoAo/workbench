import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Play } from "lucide-react";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";

export type TaskSnapshot = {
  id: number;
  title: string;
  description: string | null;
  categoryId: number | null;
  status: number;
  priority: number;
  difficulty: number;
  pinned: number;
  sortOrder: number;
  dueAt: string | null;
  progressPercent: number;
  version: number;
  createdAt: string;
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
    queryFn: async () => (await request<TaskSnapshot[]>("/api/tasks")).find((task) => task.id === taskId) ?? null
  });
}

export function TasksIntegrationPage({ tasks, date, loading }: { tasks: TaskSnapshot[]; date: string; loading: boolean }) {
  return (
    <section className="route-panel" aria-labelledby="tasks-heading">
      <div className="route-panel-heading"><div><p className="route-eyebrow">任务事实</p><h1 id="tasks-heading">任务</h1></div><span className="badge-gray">{tasks.length} 项</span></div>
      {loading ? <p role="status" className="route-state">正在加载任务...</p> : null}
      {!loading && !tasks.length ? <p className="route-state">还没有任务。</p> : null}
      <div className="route-list">
        {tasks.map((task) => (
          <Link className="route-list-row" key={task.id} to={`/tasks/${task.id}?date=${date}`}>
            <span><strong>{task.title}</strong><small>{task.description || `进度 ${task.progressPercent}%`}</small></span>
            <span className="badge-gray">{task.status === 2 ? "已完成" : task.status === 1 ? "进行中" : "待处理"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function TaskDetailPage({ task, assigned, active, date, pending, onStart, onCompleteAndFinish }: {
  task: TaskSnapshot | null | undefined;
  assigned: boolean;
  active: boolean;
  date: string;
  pending: boolean;
  onStart: (task: TaskSnapshot, assigned: boolean) => void;
  onCompleteAndFinish?: (task: TaskSnapshot) => void;
}) {
  if (task === undefined) return <p role="status" className="route-state">正在加载任务...</p>;
  if (task === null) return <section className="route-panel"><h1>任务不存在</h1><Link to={`/tasks?date=${date}`}>返回任务列表</Link></section>;
  return (
    <article className="route-panel task-detail" aria-labelledby="task-detail-heading">
      <Link className="inline-command" to={`/tasks?date=${date}`}><ArrowLeft size={15} />返回任务</Link>
      <p className="route-eyebrow">Task #{task.id} · v{task.version}</p>
      <h1 id="task-detail-heading">{task.title}</h1>
      <p>{task.description || "暂无详情"}</p>
      <dl className="task-facts"><div><dt>当日接取</dt><dd>{assigned ? "已接取" : "未接取"}</dd></div><div><dt>状态</dt><dd>{task.status === 2 ? "已完成" : task.status === 1 ? "进行中" : "待处理"}</dd></div><div><dt>进度</dt><dd>{task.progressPercent}%</dd></div></dl>
      {!active && task.status < 2 ? <button className="primary-button w-fit gap-2 px-4" disabled={pending} onClick={() => onStart(task, assigned)}><Play size={16} />{pending ? "正在开始..." : assigned ? "开始计时" : "接取并开始"}</button> : null}
      {active ? <div className="route-state route-state-active"><p>此任务当前正在计时，基础控制项位于全局 mini timer。</p>{onCompleteAndFinish ? <button className="primary-button mt-2 px-4" disabled={pending} type="button" onClick={() => onCompleteAndFinish(task)}>完成任务并结束计时</button> : null}</div> : null}
    </article>
  );
}
