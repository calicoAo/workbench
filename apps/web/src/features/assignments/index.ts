import { useQuery } from "@tanstack/react-query";
import type { Request } from "../../app/api";
import { queryKeys } from "../../app/query";

export type AssignmentSnapshot = { taskDate: string; taskIds: number[] };
export type ContinuationCandidate = {
  assignment: { id: number; taskId: number; taskDate: string; version: number; continuationState: number };
  task: { id: number; title: string; version: number };
};

export function useAssignments(request: Request, userId: number, date: string) {
  return useQuery({
    queryKey: queryKeys.assignments(userId, date),
    queryFn: () => request<AssignmentSnapshot>(`/api/task-days?date=${encodeURIComponent(date)}`)
  });
}

export function useContinuationCandidates(request: Request, userId: number, date: string) {
  return useQuery({
    queryKey: queryKeys.continuations(userId, date),
    queryFn: () => request<ContinuationCandidate[]>(`/api/task-days/continuations?date=${encodeURIComponent(date)}`)
  });
}
