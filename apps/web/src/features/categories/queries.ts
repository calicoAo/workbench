import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Request } from "../../app/api";
import type { Category, CategoryEditorCategory } from ".";

const affected = ["task-categories", "today", "settings", "growth-config", "growth-overview", "tasks", "task", "timeline"] as const;

/** Discard in-flight pre-write snapshots before committing a confirmed read. */
export async function cancelCategoryReads(client: QueryClient, userId: number) {
  await Promise.all(affected.map((prefix) => client.cancelQueries({ queryKey: [prefix, userId] })));
}

const key = (userId: number) => ["task-categories", userId] as const;

export function useCategoryOptions(request: Request, userId: number, initial?: Category[], enabled = true) {
  const client = useQueryClient();
  return useQuery({ queryKey: key(userId), enabled, staleTime: 15_000, initialData: initial?.length ? initial : undefined,
    queryFn: async () => {
      const rows = await request<CategoryEditorCategory[]>("/api/task-categories");
      const existing = client.getQueryData<Category[]>(key(userId));
      return rows.map((row) => ({ ...row, totalMinutes: existing?.find((item) => item.id === row.id)?.totalMinutes ?? 0 }));
    }
  });
}

function merge<T extends CategoryEditorCategory>(rows: T[], saved: CategoryEditorCategory): T[] {
  const present = rows.some((row) => row.id === saved.id);
  return present ? rows.map((row) => row.id === saved.id ? { ...row, ...saved } : row) : [...rows, { ...saved, totalMinutes: 0 } as unknown as T];
}

/** Commit the confirmed response before background reads; preserve per-snapshot statistics. */
export function commitCategory(client: QueryClient, userId: number, saved: CategoryEditorCategory) {
  client.setQueryData<Category[]>(key(userId), (rows = []) => merge(rows, saved).filter((row) => row.enabled !== 0 && row.enabled !== false));
  for (const prefix of ["today", "settings", "growth-config"]) {
    client.setQueriesData<{ categories: CategoryEditorCategory[] }>({ queryKey: [prefix, userId] }, (snapshot) => {
      if (!snapshot?.categories) return snapshot;
      const categories = merge(snapshot.categories, saved);
      return { ...snapshot, categories: prefix === "today" ? categories.filter((row) => row.enabled !== 0 && row.enabled !== false) : categories };
    });
  }
  // Task labels consume Today categories; Timeline also consumes that metadata during composition.
  for (const prefix of affected) {
    void client.invalidateQueries({ queryKey: [prefix, userId] });
  }
}
