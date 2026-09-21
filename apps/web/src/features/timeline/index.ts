import { useQuery } from "@tanstack/react-query";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";

export type ActualTimeEntry = {
  source: "TIMER_SEGMENT" | "MANUAL_ACTUAL" | "LEGACY_ACTUAL";
  sourceId: number;
  taskId: number | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  businessDate: string;
  recordTimezone: string;
};

export type TimelineViewItem = {
  id: string;
  kind: "PLANNED" | "TIMER_ACTUAL" | "MANUAL_ACTUAL" | "LEGACY_ACTUAL";
  taskId: number | null;
  title: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

type PlannedSchedule = { id: number; taskId: number | null; kind: number; title: string; scheduleDate?: string; startTime: string; endTime: string };
export type ExecutionSummary = { completedAssignments: number; totalAssignments: number; focusedSeconds: number; actualSeconds: number; plannedSeconds: number };
type ActualTimePayload = { date: string; timezone: string; entries: ActualTimeEntry[]; summary: ExecutionSummary };

export function mapTimeline(plannedSchedules: PlannedSchedule[], actual: ActualTimeEntry[], date: string): TimelineViewItem[] {
  const planned = plannedSchedules.filter((item) => item.kind === 0).map((item) => ({
    id: `planned:${item.id}`,
    kind: "PLANNED" as const,
    taskId: item.taskId,
    title: item.title,
    startedAt: `${item.scheduleDate ?? date}T${item.startTime}`,
    endedAt: `${item.scheduleDate ?? date}T${item.endTime}`,
    durationSeconds: Math.max(0, timeSeconds(item.endTime) - timeSeconds(item.startTime))
  }));
  const settled = actual.map((item) => ({
    id: `${item.source}:${item.sourceId}`,
    kind: item.source === "TIMER_SEGMENT" ? "TIMER_ACTUAL" as const : item.source,
    taskId: item.taskId,
    title: item.source === "TIMER_SEGMENT" ? "计时实际" : item.source === "MANUAL_ACTUAL" ? "手工实际" : "历史实际",
    startedAt: item.startedAt,
    endedAt: item.endedAt,
    durationSeconds: item.durationSeconds
  }));
  return [...planned, ...settled].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function useTimeline(request: Request, userId: number, date: string, timezone: string, plannedSchedules: PlannedSchedule[], enabled = true) {
  return useQuery({
    queryKey: queryKeys.timeline(userId, date),
    enabled,
    queryFn: async () => {
      const payload = await request<ActualTimePayload>(`/api/timer-sessions/actual-time?date=${encodeURIComponent(date)}&timezone=${encodeURIComponent(timezone)}`);
      return { items: mapTimeline(plannedSchedules, payload.entries, date), summary: payload.summary };
    }
  });
}

function timeSeconds(value: string) {
  const [hours, minutes, seconds = 0] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}
