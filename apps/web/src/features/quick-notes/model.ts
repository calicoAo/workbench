export type QuickNoteState = "active" | "archived" | "deleted";

export type QuickNote = {
  id: number;
  userId: number;
  noteDate: string;
  recordTimezone: string;
  title: string | null;
  content: string;
  tag: string | null;
  projectId: number | null;
  archivedAt: string | null;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  linkedTask?: { id: number; title: string; status: number; deletedAt: string | null } | null;
  linkedProject?: { id: number; name: string; status: number; archivedAt: string | null } | null;
};

export type QuickNotePage = { items: QuickNote[]; nextCursor: string | null };

export function noteTitle(note: Pick<QuickNote, "title" | "content">) {
  return note.title?.trim() || note.content.trim().split(/\r?\n/, 1)[0].slice(0, 100) || "未命名随手记";
}

export function formatNoteDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
