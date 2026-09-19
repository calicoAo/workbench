import type { RewardGrant } from "../rewards";

export type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type Task = {
  id: number;
  title: string;
  description: string | null;
  categoryId: number | null;
  status: number;
  priority: number;
  difficulty: number;
  pinned: number;
  sortOrder: number;
  dueAt: string | null;
  progressPercent: number;
  createdAt: string;
  completedAt: string | null;
  completionNote: string | null;
};

export type TimerSession = { id: number; taskId: number; startTime: string; durationMinutes: number; status: number };

export type Schedule = {
  id: number;
  taskId: number | null;
  categoryId: number | null;
  startTime: string;
  endTime: string;
  title: string;
  note: string | null;
  kind: number;
  source: number;
  sourceId?: string | null;
  color: string;
};

export type Confirm = (title: string, message: string, onConfirm: () => void | Promise<void>, confirmText?: string) => void;
export type CompleteResult = { id: number; status: number; scheduleId: number; reward: RewardGrant | null };

export const DIFFICULTIES = [
  { value: "1", label: "轻松" },
  { value: "2", label: "普通" },
  { value: "3", label: "困难" },
  { value: "4", label: "硬仗" }
] as const;

export async function perform(onError: (message: string, title?: string) => void, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    onError(error instanceof Error ? error.message : "操作失败", "操作没有成功");
  }
}

export function dueAtPayload(date: string, time: string) {
  return date ? `${date}T${time || "18:00"}` : null;
}

export function dateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function timeInput(value?: string | null) {
  if (!value) return "18:00";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 5) : date.toTimeString().slice(0, 5);
}

export function currentTimeInput() {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export function minutesAgoInput(minutes: number) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(Date.now() - minutes * 60000));
}

export function formatDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function difficultyLabel(value: number) {
  return DIFFICULTIES.find((item) => Number(item.value) === value)?.label ?? "普通";
}
