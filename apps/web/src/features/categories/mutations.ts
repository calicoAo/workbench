import type { Request } from "../../app/api";
import type { CategoryEditorCategory } from ".";

type CategoryChanges = Partial<Pick<CategoryEditorCategory, "name" | "color" | "dimensionKey" | "targetMinutes">> & { enabled?: boolean };

/** Existing Category POST returns the saved row; PUT acknowledges identity only. */
export async function mutateCategory(request: Request, id: number | null, changes: CategoryChanges) {
  if (id === null) {
    const category = await request<CategoryEditorCategory>("/api/task-categories", { method: "POST", body: JSON.stringify(changes) });
    return { kind: "created", category } as const;
  }
  const result = await request<{ id: number }>(`/api/task-categories/${id}`, { method: "PUT", body: JSON.stringify(changes) });
  return { kind: "updated", id: result.id } as const;
}
