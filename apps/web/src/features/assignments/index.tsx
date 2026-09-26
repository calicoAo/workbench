import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CornerDownRight, XCircle } from "lucide-react";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";
import { tx } from "../../app/i18n";

export type Assignment = { id: number; taskId: number; version: number; sortOrder: number; focusRank: number | null; assignmentStatus: number; recordTimezone: string };
export type AssignmentSnapshot = { taskDate: string; taskIds: number[]; assignments: Assignment[] };
export type ContinuationCandidate = { assignment: { id: number; taskId: number; taskDate: string; version: number; continuationState: number }; task: { id: number; title: string; version: number } };

export function useAssignments(request: Request, userId: number, date: string) {
  return useQuery({ queryKey: queryKeys.assignments(userId, date), queryFn: () => request<AssignmentSnapshot>(`/api/task-days?date=${encodeURIComponent(date)}`) });
}

export function useContinuationCandidates(request: Request, userId: number, date: string) {
  return useQuery({ queryKey: queryKeys.continuations(userId, date), queryFn: () => request<ContinuationCandidate[]>(`/api/task-days/continuations?date=${encodeURIComponent(date)}`) });
}

export function ContinuationPanel({ candidates, targetDate, timezone, request, pending, onPending, onError, onChanged }: { candidates: ContinuationCandidate[]; targetDate: string; timezone: string; request: Request; pending: boolean; onPending: (value: boolean) => void; onError: (message: string, title?: string) => void; onChanged: () => void | Promise<void> }) {
  const groups = Array.from(candidates.reduce((map, item) => {
    const group = map.get(item.task.id) ?? { task: item.task, assignments: [] as ContinuationCandidate["assignment"][] };
    group.assignments.push(item.assignment);
    map.set(item.task.id, group);
    return map;
  }, new Map<number, { task: ContinuationCandidate["task"]; assignments: ContinuationCandidate["assignment"][] }>()).values());
  if (!groups.length) return null;
  async function resolve(group: (typeof groups)[number], resolution: 2 | 3 | 4 | 5) {
    onPending(true);
    try {
      const deferredDate = addDays(targetDate, 1);
      await request("/api/task-days/continuations/resolve", { method: "POST", body: JSON.stringify({ operationId: crypto.randomUUID(), sources: group.assignments.map((item) => ({ id: item.id, expectedVersion: item.version })), resolution, targetDate: resolution === 3 ? deferredDate : resolution === 2 || resolution === 5 ? targetDate : undefined, targetTimezone: resolution === 3 || resolution === 2 || resolution === 5 ? timezone : undefined, startTime: resolution === 5 ? "09:00" : undefined, endTime: resolution === 5 ? "10:00" : undefined }) });
      await onChanged();
    } catch (error) {
      onError(tx("{value0}。若状态已变化，请重新加载后重试。", { value0: error instanceof Error ? error.message : tx("操作失败") }), tx("待续接处理冲突"));
    } finally { onPending(false); }
  }
  return <section className="continuation-panel"><header><div><p className="route-eyebrow">{tx("历史来源按 Task 合并")}</p><h2>{tx("待续接")}</h2></div><span>{groups.length} {tx("项")}</span></header>{groups.map((group) => <article key={group.task.id}><div><strong>{group.task.title}</strong><p>{group.assignments.map((item) => `${item.taskDate} · #${item.id} v${item.version}`).join(" / ")}</p></div><div><button disabled={pending} onClick={() => void resolve(group, 2)}><CornerDownRight size={14} />{tx("接取到今天")}</button><button disabled={pending} onClick={() => void resolve(group, 3)}><CalendarClock size={14} />{tx("延后到明天")}</button><button disabled={pending} onClick={() => void resolve(group, 5)}>{tx("重新安排")}</button><button disabled={pending} onClick={() => void resolve(group, 4)}><XCircle size={14} />{tx("本条不再提醒")}</button></div></article>)}</section>;
}

function addDays(date: string, amount: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
