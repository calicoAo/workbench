import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CirclePause, CirclePlay, ExternalLink, Square, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { ApiError, type Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { Badge, Button, IconButton, buttonClass, iconButtonClass } from "../../shared/ui";

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
  finish: (session: CurrentSession, details?: { progressPercent?: number; note?: string; taskVersion?: number }) => Promise<boolean>;
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

export function useTimerCommands({ request, userId, selectedDate: selectedDateInput, executionDate: executionDateInput, date, timezone, onError }: { request: Request; userId: number; selectedDate?: string; executionDate?: string; date?: string; timezone: string; onError: (message: string, title?: string) => void }): TimerCommands {
  const selectedDate = selectedDateInput ?? date ?? localDate();
  const executionDate = executionDateInput ?? date ?? localDate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const refreshAffected = useCallback(async (taskId?: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.currentSession(userId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(userId) }),
      taskId ? queryClient.invalidateQueries({ queryKey: queryKeys.task(userId, taskId) }) : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments(userId, selectedDate) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(userId, selectedDate) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.today(userId, selectedDate) }),
      selectedDate !== executionDate ? queryClient.invalidateQueries({ queryKey: queryKeys.assignments(userId, executionDate) }) : Promise.resolve(),
      selectedDate !== executionDate ? queryClient.invalidateQueries({ queryKey: queryKeys.timeline(userId, executionDate) }) : Promise.resolve()
    ]);
  }, [executionDate, queryClient, selectedDate, userId]);
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
    start: (task, accepted) => command("start", task.id, () => retryableOperation(request, selectedDate === executionDate && accepted ? "/api/timer-sessions/start" : "/api/timer-sessions/accept-and-start", "POST", { taskId: task.id, expectedTaskVersion: task.version, taskDate: executionDate, recordTimezone: timezone })),
    pause: (session) => command("pause", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/pause`, "PUT", { expectedVersion: session.version })),
    resume: (session) => command("resume", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/resume`, "PUT", { expectedVersion: session.version })),
    finish: (session, details) => command("finish", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/finish`, "PUT", { expectedVersion: session.version, completeTask: false, progressPercent: details?.progressPercent, note: details?.note, expectedTaskVersion: details?.progressPercent !== undefined ? details.taskVersion : undefined })),
    completeAndFinish: (session, taskVersion, completionNote) => command("complete-and-finish", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/finish`, "PUT", { expectedVersion: session.version, completeTask: true, expectedTaskVersion: taskVersion, completionNote })),
    cancel: (session) => command("cancel", session.taskId, () => retryableOperation(request, `/api/timer-sessions/${session.id}/cancel`, "PUT", { expectedVersion: session.version }))
  }), [command, executionDate, pending, request, selectedDate, timezone]);
}

export function MiniTimer({ session, taskTitle, taskVersion, date, commands }: { session: CurrentSession; taskTitle: string; taskVersion: number; date: string; commands: TimerCommands }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (session.status !== TIMER_STATUS.RUNNING) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session.status]);
  const pending = commands.pending !== null;
  return <aside className="mini-timer" aria-label="当前计时">
    <Badge tone={session.status === TIMER_STATUS.PAUSED ? "warning" : "success"} className="mini-timer-state">{session.status === TIMER_STATUS.PAUSED ? "已暂停" : "计时中"}</Badge>
    <span className="mini-timer-copy"><strong>{taskTitle}</strong><time>{durationText(netSeconds(session))}</time></span>
    <span className="mini-timer-actions">
      {session.status === TIMER_STATUS.RUNNING ? <IconButton size="sm" label="暂停计时" disabled={pending} onClick={() => void commands.pause(session)}><CirclePause size={18} /></IconButton> : <IconButton size="sm" label="继续计时" disabled={pending} onClick={() => void commands.resume(session)}><CirclePlay size={18} /></IconButton>}
      <FinishSessionButton icon size="sm" session={session} taskVersion={taskVersion} commands={commands} ariaLabel="结束本次"><Square size={16} /></FinishSessionButton>
      <IconButton size="sm" label="取消计时" disabled={pending} onClick={() => void commands.cancel(session)}><X size={17} /></IconButton>
      <Link className={iconButtonClass({ size: "sm" })} aria-label="打开计时任务" title="打开计时任务" to={`/tasks/${session.taskId}?date=${date}`}><span className="ui-icon-button-visual" aria-hidden="true"><ExternalLink size={17} /></span></Link>
    </span>
  </aside>;
}

export function CurrentFocusCard({ session, taskTitle, taskVersion, commands }: { session: CurrentSession | null; taskTitle?: string; taskVersion?: number; commands: TimerCommands }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (session?.status !== TIMER_STATUS.RUNNING) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session?.status]);
  if (!session) return <section className="current-focus"><div className="current-focus-copy"><p className="route-eyebrow">当前专注</p><h2>暂无进行中的 Session</h2><span>从今日悬赏开始一段真实投入</span></div></section>;
  const pending = commands.pending !== null;
  return <section className="current-focus" aria-label="当前专注控制">
    <div className="current-focus-copy"><p className="route-eyebrow">当前专注</p><h2>{taskTitle ?? "当前任务"}</h2><span>{session.status === TIMER_STATUS.RUNNING ? "RUNNING" : "PAUSED"} · 净投入由 Segment 汇总</span></div>
    <time className="current-focus-time">{durationText(netSeconds(session))}</time>
    <div className="current-focus-actions">
      <Button variant="secondary" disabled={pending} onClick={() => void (session.status === TIMER_STATUS.RUNNING ? commands.pause(session) : commands.resume(session))}>{session.status === TIMER_STATUS.RUNNING ? <CirclePause size={16} /> : <CirclePlay size={16} />}{session.status === TIMER_STATUS.RUNNING ? "暂停" : "继续"}</Button>
      <FinishSessionButton session={session} taskVersion={taskVersion ?? 1} commands={commands} />
      <Button variant="primary" disabled={pending} onClick={() => void commands.completeAndFinish(session, taskVersion ?? 1)}>完成悬赏并结束</Button>
    </div>
  </section>;
}

export function FinishSessionButton({ session, taskVersion, commands, variant = "secondary", size = "md", icon = false, className, ariaLabel, children = "结束本次" }: { session: CurrentSession; taskVersion: number; commands: TimerCommands; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; icon?: boolean; className?: string; ariaLabel?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); window.setTimeout(() => triggerRef.current?.focus(), 0); }, []);
  const triggerClass = icon ? iconButtonClass({ size, className }) : buttonClass({ variant, size, className });
  return <><button ref={triggerRef} type="button" className={triggerClass} aria-label={ariaLabel} title={icon ? ariaLabel : undefined} disabled={commands.pending !== null} onClick={() => setOpen(true)}>{icon ? <span className="ui-icon-button-visual" aria-hidden="true">{children}</span> : <span className="ui-button-visual">{children}</span>}</button>{open ? <FinishDialog session={session} taskVersion={taskVersion} pending={commands.pending !== null} onClose={close} onFinish={async (details) => { if (await commands.finish(session, details)) close(); }} /> : null}</>;
}

function FinishDialog({ session, taskVersion, pending, onClose, onFinish }: { session: CurrentSession; taskVersion: number; pending: boolean; onClose: () => void; onFinish: (details: { progressPercent?: number; note?: string; taskVersion: number }) => Promise<void> }) {
  const [progress, setProgress] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])') ?? []);
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialogRef} className="finish-dialog" role="dialog" aria-modal="true" aria-labelledby="finish-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="route-eyebrow">Session #{session.id}</p><h2 id="finish-title">结束本次投入</h2></div><IconButton label="关闭结束面板" onClick={onClose}><X size={17} /></IconButton></header><div className="finish-metrics"><div><span>净投入</span><strong>{durationText(netSeconds(session))}</strong></div><div><span>Segment</span><strong>{session.segments.filter((item) => item.status !== 2).length} 段</strong></div></div><label>更新进度（可选）<input className="field" type="number" min="0" max="99" value={progress} onChange={(event) => setProgress(event.target.value)} /></label><label>本次备注（可选）<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} /></label><p className="finish-hint">结束本次不会完成悬赏。完成动作需要单独确认。</p><footer><Button variant="secondary" onClick={onClose}>取消</Button><Button variant="primary" loading={pending} onClick={() => void onFinish({ progressPercent: progress === "" ? undefined : Number(progress), note: note.trim() || undefined, taskVersion })}>{pending ? "正在结束..." : "结束本次"}</Button></footer></section></div>, document.body);
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

function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
