import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { HabitFrequency, HabitRecordMode } from "../enums.js";
import { createHabit, habitDetail, habitList, habitSummary, publishHabitTask, recordHabitOccurrence, reviseHabitGoal, reviseHabitRule, setHabitState } from "../habits.js";
import { ok } from "../http.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const operation = z.string().uuid();
const rule = z.object({ frequencyType: z.union([z.literal(HabitFrequency.DAILY), z.literal(HabitFrequency.WEEKDAYS), z.literal(HabitFrequency.WEEKLY_N)]), weekdayMask: z.number().int().min(1).max(127).nullable().optional(), weeklyTarget: z.number().int().min(1).max(7).nullable().optional() }).superRefine((value, ctx) => {
  if (value.frequencyType === HabitFrequency.WEEKDAYS && !value.weekdayMask) ctx.addIssue({ code: "custom", path: ["weekdayMask"], message: "weekdayMask is required" });
  if (value.frequencyType === HabitFrequency.WEEKLY_N && !value.weeklyTarget) ctx.addIssue({ code: "custom", path: ["weeklyTarget"], message: "weeklyTarget is required" });
});
const create = z.object({ operationId: operation, name: z.string().trim().min(1).max(120), description: z.string().max(4000).nullable().optional(), categoryId: z.number().int().positive().nullable().optional(), startDate: date, endDate: date.nullable().optional(), recordMode: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), unit: z.string().trim().max(32).nullable().optional(), taskCompletionEnabled: z.boolean().default(false), rule, targetValue: z.number().positive() }).refine((value) => !value.endDate || value.endDate >= value.startDate, { path: ["endDate"], message: "end date must not precede start date" }).refine((value) => !value.taskCompletionEnabled || value.recordMode === HabitRecordMode.COMPLETION, { path: ["taskCompletionEnabled"], message: "task completion is only available for completion habits" });
const revision = z.object({ operationId: operation, expectedVersion: z.number().int().positive(), effectiveFrom: date });

export const habitsRoute = new Hono()
  .get("/", async (c) => ok(c, await habitList(getCurrentUserId(c))))
  .get("/summary", async (c) => ok(c, await habitSummary(getCurrentUserId(c), date.parse(c.req.query("date")))))
  .get("/:id", async (c) => ok(c, await habitDetail(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")))))
  .post("/", async (c) => ok(c, await createHabit({ userId: getCurrentUserId(c), ...create.parse(await c.req.json()) })))
  .put("/:id/rule", async (c) => { const body = revision.extend({ rule }).parse(await c.req.json()); return ok(c, await reviseHabitRule({ userId: getCurrentUserId(c), habitId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .put("/:id/goal", async (c) => { const body = revision.extend({ targetValue: z.number().positive() }).parse(await c.req.json()); return ok(c, await reviseHabitGoal({ userId: getCurrentUserId(c), habitId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .put("/:id/state", async (c) => { const body = revision.extend({ action: z.enum(["disable", "enable", "archive", "restore"]) }).parse(await c.req.json()); return ok(c, await setHabitState({ userId: getCurrentUserId(c), habitId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .post("/:id/occurrences", async (c) => { const body = z.object({ operationId: operation, occurrenceDate: date, recordTimezone: z.string().min(1).max(64), expectedVersion: z.number().int().nonnegative(), actualValue: z.number().nonnegative().optional(), skipped: z.boolean().default(false), skipReason: z.string().max(500).optional() }).parse(await c.req.json()); return ok(c, await recordHabitOccurrence({ userId: getCurrentUserId(c), habitId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); })
  .post("/:id/task", async (c) => { const body = z.object({ operationId: operation, occurrenceDate: date, recordTimezone: z.string().min(1).max(64) }).parse(await c.req.json()); return ok(c, await publishHabitTask({ userId: getCurrentUserId(c), habitId: z.coerce.number().int().positive().parse(c.req.param("id")), ...body })); });
