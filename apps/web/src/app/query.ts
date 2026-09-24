import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  currentSession: (userId: number) => ["current-session", userId] as const,
  today: (userId: number, date: string) => ["today", userId, date] as const,
  tasks: (userId: number, filters = "all") => ["tasks", userId, filters] as const,
  task: (userId: number, taskId: number) => ["task", userId, taskId] as const,
  projects: (userId: number, view = "active") => ["projects", userId, view] as const,
  project: (userId: number, projectId: number) => ["project", userId, projectId] as const,
  projectMaterials: (userId: number, projectId: number) => ["project-materials", userId, projectId] as const,
  assignments: (userId: number, date: string) => ["assignments", userId, date] as const,
  continuations: (userId: number, date: string) => ["continuations", userId, date] as const,
  timeline: (userId: number, date: string) => ["timeline", userId, date] as const,
  quickNotes: (userId: number, filters = "active") => ["quick-notes", userId, filters] as const,
  quickNote: (userId: number, noteId: number) => ["quick-note", userId, noteId] as const,
  trash: (userId: number, type = "all") => ["trash", userId, type] as const,
  habits: (userId: number) => ["habits", userId] as const,
  habitSummary: (userId: number, date: string) => ["habit-summary", userId, date] as const,
  habit: (userId: number, habitId: number) => ["habit", userId, habitId] as const,
  growthOverview: (userId: number, period: number, date: string) => ["growth-overview", userId, period, date] as const,
  growthConfig: (userId: number) => ["growth-config", userId] as const,
  inspirations: (userId: number, state = "active", keyword = "", tags = "") => ["inspirations", userId, state, keyword, tags] as const,
  inspiration: (userId: number, id: number) => ["inspiration", userId, id] as const,
  inspirationTags: (userId: number) => ["inspiration-tags", userId] as const,
  financeOverview: (userId: number, month: string) => ["finance-overview", userId, month] as const,
  financeAccounts: (userId: number, view = "active") => ["finance-accounts", userId, view] as const,
  financeCategories: (userId: number) => ["finance-categories", userId] as const,
  financeTransactions: (userId: number, filters = "") => ["finance-transactions", userId, filters] as const
};

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 },
      mutations: { retry: false }
    }
  });
}
