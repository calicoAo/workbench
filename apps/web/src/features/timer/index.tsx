import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CirclePause, CirclePlay, ExternalLink, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ApiError, type Request } from "../../app/api";
import { queryKeys } from "../../app/query";

export const TIMER_STATUS = { RUNNING: 0, PAUSED: 1, FINISHED: 2, CANCELLED: 3 } as const;

export type TimerSegment = { id: number; timerSessionId: number; taskId: number; status: number; startedAt: string; endedAt: string | null; businessDate: string };
export type CurrentSession = {
  id: number; taskId: number; startTime: string; durationMinutes: number; status: number; version: number;
  recordTimezone: string; segments: TimerSegment[];
};
export type TimerCommandResult = { id: number; status: number; version: number; durationSeconds?: number; rewards?: Array<{ xp: number; coins: number; reason: string }> };
export type TimerCommands = {
  pending: string | null;
  start: (task: { id: number; version: number }, accepted: boolean) => Promise<boolean>;
  pause: (session: CurrentSession) => Promise<boolean>;
  resume: (session: CurrentSession) => Promise<boolean>;
  finish: (session: CurrentSession) => Promise<boolean>;
  completeAndFinish: (session: CurrentSession, taskVersion: number, completionNote?: string) => Promise<boolean>;
  cancel: (session: CurrentSession) => Promise<boolean>;
};

export function useCurrentSession(request: Request, userId: number) {
  return useQuery({ queryKey: queryKeys.currentSession(userId), queryFn: () => request<CurrentSession | null>("/api/timer-sessions/current"), refetchInterval: 30_000 });
}

export async function retryableOperation<T>(request: Request, path: string, method: "POST" | "PUT", body: Record<string, unknown>, options: { operationId?: string; retries?: number } = {}) {
  const operationId = options.operationId ?? crypto.randomUUID();
  const payload = { ...body, operationId };
  const retries = options.retries ?? 1;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request<T>(path, { method, body: JSON.stringify(payload) });
    } catch (error) {
      if (attempt >= retries || !(error instanceof ApiError) || !error.retryable) throw error;
    }
  }
}

export function useTimerCommands({ request, userId, date, timezone, onError }: { request: Request; userId: number; date: string; timezone: string; onError: (message: string, title?: string) => void }): TimerCommands {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const refreshAffected = useCallback(async (taskId?: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.currentSession(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(userId) }),
      taskId ? queryClient.invalidateQueries({ queryKey: queryKeys.task(userId, taskId) }) : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments(userId, date) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(userId, date) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.today(userId, date) })
    ]);
  }, [date, queryClient, userId]);
  const command = useCallback(async (name: string, taskId: number | undefined, action: () => Promise<unknown>) => {
    setPending(name);
    try {
      await action();
      await refreshAffected(taskId);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.conflict) {
        onError(`${error.message}。状态已重新同步，请确认后重试。`, "状态冲突");
        await refreshAffected(taskId);
      } else onError(error instanceof Error ? error.message : "操作失败", "操作没有成功");
      return false;
    } finally {
      setPending(null);
    }
  }, [onError, refreshAffected]);
  return useMemo(() => ({
    pending,
    start: (task, accepted) => command("start", task.id, () => retryableOperation(request, accepted ? "/api/timer-sessions/start" : "/api/timer-sessions/accept-and-start", "POST", { taskId: task.id, expectedTaskVersion: task.version, taskDate: date, recordTimezone: timezone })),
    pause: (session) => command("pause", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/pause`, "PUT", { expectedVersion: session.version })),
    resume: (session) => command("resume", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/resume`, "PUT", { expectedVersion: session.version })),
    finish: (session) => command("finish", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/finish`, "PUT", { expectedVersion: session.version, completeTask: false })),
    completeAndFinish: (session, taskVersion, completionNote) => command("complete-and-finish", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/finish`, "PUT", { expectedVersion: session.version, completeTask: true, expectedTaskVersion: taskVersion, completionNote })),
    cancel: (session) => command("cancel", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/cancel`, "PUT", { expectedVersion: session.version }))
  }), [command, date, pending, request, timezone]);
}

export function MiniTimer({ session, taskTitle, date, commands }: { session: CurrentSession; taskTitle: string; date: string; commands: TimerCommands }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (session.status !== TIMER_STATUS.RUNNING) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session.status]);
  const pending = commands.pending !== null;
  return <aside className="mini-timer" aria-label="当前计时">
    <span className={`mini-timer-state ${session.status === TIMER_STATUS.PAUSED ? "is-paused" : ""}`}>{session.status === TIMER_STATUS.PAUSED ? "已暂停" : "计时中"}</span>
    <span className="mini-timer-copy"><strong>{taskTitle}</strong><time>{durationText(netSeconds(session))}</time></span>
    <span className="mini-timer-actions">
      {session.status === TIMER_STATUS.RUNNING ? <button type="button" aria-label="暂停计时" disabled={pending} onClick={() => void commands.pause(session)}><CirclePause size={18} /></button> : <button type="button" aria-label="继续计时" disabled={pending} onClick={() => void commands.resume(session)}><CirclePlay size={18} /></button>}
      <button type="button" aria-label="结束计时" disabled={pending} onClick={() => void commands.finish(session)}><Square size={16} /></button>
      <button type="button" aria-label="取消计时" disabled={pending} onClick={() => void commands.cancel(session)}><X size={17} /></button>
      <Link aria-label="打开计时任务" to={`/tasks/${session.taskId}?date=${date}`}><ExternalLink size={17} /></Link>
    </span>
  </aside>;
}

export function netSeconds(session: CurrentSession, now = Date.now()) {
  return session.segments.reduce((sum, segment) => {
    const start = utcMillis(segment.startedAt);
    const end = segment.endedAt ? utcMillis(segment.endedAt) : session.status === TIMER_STATUS.RUNNING ? now : start;
    return sum + Math.max(0, Math.floor((end - start) / 1000));
  }, 0);
}

function utcMillis(value: string) {
  if (value.includes("T")) return new Date(value).getTime();
  return new Date(`${value.replace(" ", "T")}Z`).getTime();
}

function durationText(seconds: number) {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), rest = seconds % 60;
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
