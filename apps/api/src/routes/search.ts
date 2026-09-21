import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { pool } from "../db/index.js";
import { ok } from "../http.js";

const typeSchema = z.enum(["task", "quick_note", "journal", "morning_writing", "schedule"]);
const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
  type: typeSchema.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).refine((value) => !value.from || !value.to || value.from <= value.to, { path: ["to"], message: "to must not be before from" });

type SearchRow = { type: z.infer<typeof typeSchema>; id: number; title: string; body: string; result_date: Date | string; created_at: Date | string };
type Cursor = { date: string; createdAt: string; type: SearchRow["type"]; id: number };

function decodeCursor(value: string): Cursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) || !typeSchema.safeParse(parsed.type).success || !Number.isInteger(parsed.id) || Number.isNaN(new Date(parsed.createdAt).getTime())) throw new Error("invalid cursor");
  return parsed;
}

function encodeCursor(row: SearchRow) {
  return Buffer.from(JSON.stringify({ date: resultDate(row.result_date), createdAt: new Date(row.created_at).toISOString(), type: row.type, id: row.id } satisfies Cursor)).toString("base64url");
}

function resultDate(value: Date | string) {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function snippet(value: string, query: string) {
  const flat = value.replace(/\s+/g, " ").trim();
  const index = flat.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - 55);
  return `${start ? "..." : ""}${flat.slice(start, start + 180)}${flat.length > start + 180 ? "..." : ""}`;
}

export const searchRoute = new Hono().get("/", async (c) => {
  const query = querySchema.parse(c.req.query());
  let cursor: Cursor | undefined;
  if (query.cursor) {
    try { cursor = decodeCursor(query.cursor); } catch { throw new z.ZodError([{ code: "custom", path: ["cursor"], message: "invalid cursor" }]); }
  }
  const union = `
    SELECT 'task' AS type, id, title, COALESCE(description, '') AS body, COALESCE(due_date, DATE(created_at)) AS result_date, created_at
      FROM tasks WHERE user_id = ? AND deleted_at IS NULL
    UNION ALL
    SELECT 'quick_note', id, COALESCE(NULLIF(title, ''), '随手记'), CONCAT_WS(' ', title, content, tag), note_date, created_at
      FROM quick_notes WHERE user_id = ? AND deleted_at IS NULL
    UNION ALL
    SELECT 'journal', id, CONCAT('日记 · ', journal_date), COALESCE(content, ''), journal_date, created_at
      FROM journals WHERE user_id = ? AND deleted_at IS NULL
    UNION ALL
    SELECT 'morning_writing', id, CONCAT('晨写 · ', writing_date), COALESCE(content, ''), writing_date, created_at
      FROM morning_writings WHERE user_id = ? AND deleted_at IS NULL
    UNION ALL
    SELECT 'schedule', id, title, CONCAT_WS(' ', title, note), schedule_date, created_at
      FROM schedules WHERE user_id = ? AND deleted_at IS NULL
  `;
  const where = ["(title LIKE ? OR body LIKE ?)"];
  const keyword = `%${query.q}%`;
  const userId = getCurrentUserId(c);
  const values: unknown[] = [userId, userId, userId, userId, userId, keyword, keyword];
  if (query.type) { where.push("type = ?"); values.push(query.type); }
  if (query.from) { where.push("result_date >= ?"); values.push(query.from); }
  if (query.to) { where.push("result_date <= ?"); values.push(query.to); }
  if (cursor) {
    where.push("(result_date < ? OR (result_date = ? AND created_at < ?) OR (result_date = ? AND created_at = ? AND type > ?) OR (result_date = ? AND created_at = ? AND type = ? AND id < ?))");
    values.push(cursor.date, cursor.date, cursor.createdAt, cursor.date, cursor.createdAt, cursor.type, cursor.date, cursor.createdAt, cursor.type, cursor.id);
  }
  values.push(query.limit + 1);
  const [raw] = await pool.query(`SELECT type, id, title, body, result_date, created_at FROM (${union}) domain_results WHERE ${where.join(" AND ")} ORDER BY result_date DESC, created_at DESC, type ASC, id DESC LIMIT ?`, values);
  const rows = raw as SearchRow[];
  const page = rows.slice(0, query.limit);
  const items = page.map((row) => ({
    type: row.type,
    id: Number(row.id),
    title: row.title,
    snippet: snippet(row.body || row.title, query.q),
    date: resultDate(row.result_date),
    deepLink: row.type === "task" ? `/tasks/${row.id}?date=${resultDate(row.result_date)}` : row.type === "quick_note" ? `/notes/${row.id}?date=${resultDate(row.result_date)}` : row.type === "schedule" ? `/calendar?date=${resultDate(row.result_date)}` : `/journal?date=${resultDate(row.result_date)}`
  }));
  return ok(c, { items, nextCursor: rows.length > query.limit && page.length ? encodeCursor(page[page.length - 1]) : null, archivedPolicy: "Archived Tasks and Quick Notes are included; soft-deleted records are excluded." });
});
