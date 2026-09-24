import { and, asc, eq, isNull, isNotNull, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { habitDefinitions, habitGoalVersions, habitOccurrences, habitRuleVersions, habitTaskLinks, journals, morningWritings, projects, quickNotes, quickNoteTaskLinks, rewardEvents, rewardRedemptions, schedules, sleepRecords, tasks, timerSegments, waterRecords } from "../db/schema.js";
import { ActualTimeClass, ScheduleKind, TimerSegmentStatus } from "../enums.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";

const querySchema = z.object({ format: z.enum(["json", "csv", "markdown"]), includeTrash: z.enum(["true", "false"]).default("false") });
const domains = ["projects", "tasks", "habits", "writing", "calendar", "rewards", "life"] as const;

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [keys.map(cell).join(","), ...rows.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\n");
}

function markdownWriting(rows: Record<string, unknown>[]) {
  return rows.map((row) => `## ${row.kind === "quick_note" ? row.title || "随手记" : row.title}\n\n日期：${row.date}\n\n${row.body ?? ""}\n`).join("\n---\n\n");
}

export const exportsRoute = new Hono().get("/:domain", async (c) => {
  const domain = z.enum(domains).parse(c.req.param("domain"));
  const query = querySchema.parse(c.req.query());
  const includeTrash = query.includeTrash === "true";
  const userId = getCurrentUserId(c);
  let rows: Record<string, unknown>[] = [];

  if (domain === "projects") {
    rows = (await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.id))).map((row) => ({ kind: "project", ...row }));
  } else if (domain === "tasks") {
    const [taskRows, links] = await Promise.all([
      db.select().from(tasks).where(and(eq(tasks.userId, userId), ...(includeTrash ? [] : [isNull(tasks.deletedAt)]))).orderBy(asc(tasks.id)),
      db.select().from(quickNoteTaskLinks).where(eq(quickNoteTaskLinks.userId, userId))
    ]);
    const sourceByTask = new Map(links.map((link) => [link.taskId, link.quickNoteId]));
    rows = taskRows.map((row) => ({ kind: "task", ...row, sourceType: sourceByTask.has(row.id) ? "QUICK_NOTE" : null, sourceId: sourceByTask.get(row.id) ?? null }));
  } else if (domain === "habits") {
    const [definitions, rules, goals, occurrences, links] = await Promise.all([
      db.select().from(habitDefinitions).where(eq(habitDefinitions.userId, userId)).orderBy(asc(habitDefinitions.id)),
      db.select().from(habitRuleVersions).where(eq(habitRuleVersions.userId, userId)).orderBy(asc(habitRuleVersions.id)),
      db.select().from(habitGoalVersions).where(eq(habitGoalVersions.userId, userId)).orderBy(asc(habitGoalVersions.id)),
      db.select().from(habitOccurrences).where(eq(habitOccurrences.userId, userId)).orderBy(asc(habitOccurrences.id)),
      db.select().from(habitTaskLinks).where(eq(habitTaskLinks.userId, userId)).orderBy(asc(habitTaskLinks.id))
    ]);
    rows = [...definitions.map((row) => ({ kind: "habit_definition", ...row })), ...rules.map((row) => ({ kind: "habit_rule_version", ...row })), ...goals.map((row) => ({ kind: "habit_goal_version", ...row })), ...occurrences.map((row) => ({ kind: "habit_occurrence", ...row })), ...links.map((row) => ({ kind: "habit_task_link", ...row }))];
  } else if (domain === "writing") {
    const [notes, links, journalRows, morningRows] = await Promise.all([
      db.select().from(quickNotes).where(and(eq(quickNotes.userId, userId), ...(includeTrash ? [] : [isNull(quickNotes.deletedAt)]))).orderBy(asc(quickNotes.id)),
      db.select().from(quickNoteTaskLinks).where(eq(quickNoteTaskLinks.userId, userId)),
      db.select().from(journals).where(and(eq(journals.userId, userId), ...(includeTrash ? [] : [isNull(journals.deletedAt)]))).orderBy(asc(journals.id)),
      db.select().from(morningWritings).where(and(eq(morningWritings.userId, userId), ...(includeTrash ? [] : [isNull(morningWritings.deletedAt)]))).orderBy(asc(morningWritings.id))
    ]);
    const taskByNote = new Map(links.map((link) => [link.quickNoteId, link.taskId]));
    rows = [
      ...notes.map((row) => ({ kind: "quick_note", id: row.id, title: row.title, body: row.content, tag: row.tag, date: row.noteDate, recordTimezone: row.recordTimezone, createdAt: row.createdAt, archivedAt: row.archivedAt, deletedAt: row.deletedAt, linkedTaskId: taskByNote.get(row.id) ?? null })),
      ...journalRows.map((row) => ({ kind: "journal", id: row.id, title: `日记 · ${row.journalDate}`, body: row.content, date: row.journalDate, recordTimezone: row.recordTimezone, createdAt: row.createdAt, deletedAt: row.deletedAt })),
      ...morningRows.map((row) => ({ kind: "morning_writing", id: row.id, title: `晨写 · ${row.writingDate}`, body: row.content, date: row.writingDate, createdAt: row.createdAt, deletedAt: row.deletedAt }))
    ];
  } else if (domain === "calendar") {
    const [scheduleRows, segmentRows] = await Promise.all([
      db.select().from(schedules).where(and(eq(schedules.userId, userId), or(eq(schedules.kind, ScheduleKind.PLANNED), ne(schedules.actualTimeClass, ActualTimeClass.TIMER_PROJECTION)), ...(includeTrash ? [] : [isNull(schedules.deletedAt)]))).orderBy(asc(schedules.id)),
      db.select().from(timerSegments).where(and(eq(timerSegments.userId, userId), eq(timerSegments.status, TimerSegmentStatus.CLOSED), isNotNull(timerSegments.endedAt), ...(includeTrash ? [] : [isNull(timerSegments.deletedAt)]))).orderBy(asc(timerSegments.id))
    ]);
    rows = [...scheduleRows.map((row) => ({ ...row, recordType: row.kind === ScheduleKind.PLANNED ? "planned_schedule" : "manual_or_legacy_actual" })), ...segmentRows.map((row) => ({ kind: "timer_segment_actual", ...row }))];
  } else if (domain === "rewards") {
    const [events, redemptions] = await Promise.all([db.select().from(rewardEvents).where(eq(rewardEvents.userId, userId)).orderBy(asc(rewardEvents.id)), db.select().from(rewardRedemptions).where(eq(rewardRedemptions.userId, userId)).orderBy(asc(rewardRedemptions.id))]);
    rows = [...events.map((row) => ({ kind: "reward_event", ...row })), ...redemptions.map((row) => ({ kind: "reward_redemption", ...row }))];
  } else {
    const [sleep, water] = await Promise.all([
      db.select().from(sleepRecords).where(and(eq(sleepRecords.userId, userId), ...(includeTrash ? [] : [isNull(sleepRecords.deletedAt)]))).orderBy(asc(sleepRecords.id)),
      db.select().from(waterRecords).where(and(eq(waterRecords.userId, userId), ...(includeTrash ? [] : [isNull(waterRecords.deletedAt)]))).orderBy(asc(waterRecords.id))
    ]);
    rows = [...sleep.map((row) => ({ kind: "sleep", ...row })), ...water.map((row) => ({ kind: "water", ...row }))];
  }

  if (query.format === "markdown" && domain !== "writing") throw new BusinessError(ErrorCode.PARAM_ERROR, "Markdown is available only for writing exports");
  const content = query.format === "json" ? JSON.stringify({ domain, exportedAt: new Date().toISOString(), includeTrash, records: rows }, null, 2) : query.format === "csv" ? csv(rows) : markdownWriting(rows);
  const extension = query.format === "markdown" ? "md" : query.format;
  return ok(c, { fileName: `personal-workbench-${domain}.${extension}`, contentType: query.format === "json" ? "application/json" : query.format === "csv" ? "text/csv" : "text/markdown", format: query.format, recordCount: rows.length, content });
});
