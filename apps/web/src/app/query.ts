import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  currentSession: (userId: number) => ["current-session", userId] as const,
  today: (userId: number, date: string) => ["today", userId, date] as const,
  tasks: (userId: number, filters = "all") => ["tasks", userId, filters] as const,
  task: (userId: number, taskId: number) => ["task", userId, taskId] as const,
  assignments: (userId: number, date: string) => ["assignments", userId, date] as const,
  continuations: (userId: number, date: string) => ["continuations", userId, date] as const,
  timeline: (userId: number, date: string) => ["timeline", userId, date] as const,
  quickNotes: (userId: number, filters = "active") => ["quick-notes", userId, filters] as const,
  quickNote: (userId: number, noteId: number) => ["quick-note", userId, noteId] as const
};

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 },
      mutations: { retry: false }
    }
  });
}
