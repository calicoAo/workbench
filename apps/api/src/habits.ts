import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { habitDefinitions, habitGoalVersions, habitOccurrences, habitRuleVersions, habitTaskLinks, morningWritings, sleepRecords, taskCategories, users, waterRecords } from "./db/schema.js";
import { HabitFrequency, HabitOccurrenceSource, HabitOccurrenceStatus, HabitRecordMode } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { runMutation } from "./mutation-receipt.js";
import { publishTaskInClient } from "./task-publishing.js";
import { businessDateAt } from "./time.js";

export type HabitRuleInput = { frequencyType: number; weekdayMask?: number | null; weeklyTarget?: number | null };

function dateOnly(value: string | Date) {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mondayOf(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function sundayOf(value: string) {
  const date = new Date(`${mondayOf(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

function weekdayBit(value: string) {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay() || 7;
  return 1 << (day - 1);
}

function expectedForDate(rule: typeof habitRuleVersions.$inferSelect, date: string) {
  if (!rule.enabled) return false;
  if (rule.frequencyType === HabitFrequency.DAILY) return true;
  if (rule.frequencyType === HabitFrequency.WEEKDAYS) return Boolean((rule.weekdayMask ?? 0) & weekdayBit(date));
  return true;
}

function latestAt<T extends { habitId: number; effectiveFrom: string }>(rows: T[], habitId: number, date: string) {
  return rows.filter((row) => row.habitId === habitId && dateOnly(row.effectiveFrom) <= date).sort((a, b) => dateOnly(b.effectiveFrom).localeCompare(dateOnly(a.effectiveFrom)))[0] ?? null;
}

async function ownedHabit(client: DatabaseClient, userId: number, habitId: number, lock = false) {
  let query = client.select().from(habitDefinitions).where(and(eq(habitDefinitions.id, habitId), eq(habitDefinitions.userId, userId)));
  const [habit] = lock ? await query.for("update") : await query;
  if (!habit) throw new BusinessError(ErrorCode.NOT_FOUND, "habit not found", 404);
  return habit;
}

async function validateCategory(client: DatabaseClient, userId: number, categoryId?: number | null) {
  if (!categoryId) return;
  const [category] = await client.select({ id: taskCategories.id }).from(taskCategories).where(and(eq(taskCategories.id, categoryId), eq(taskCategories.userId, userId), isNull(taskCategories.deletedAt)));
  if (!category) throw new BusinessError(ErrorCode.NOT_FOUND, "category not found", 404);
}

async function requireCurrentOrFutureEffective(client: DatabaseClient, userId: number, effectiveFrom: string) {
  const [user] = await client.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
  if (effectiveFrom < businessDateAt(new Date(), user.timezone)) throw new BusinessError(ErrorCode.CONFLICT, "effective date must not be in the past", 409);
}

export function createHabit(command: {
  userId: number; operationId: string; name: string; description?: string | null; categoryId?: number | null;
  startDate: string; endDate?: string | null; recordMode: number; unit?: string | null; taskCompletionEnabled?: boolean;
  rule: HabitRuleInput; targetValue: number;
}) {
  return runMutation({ userId: command.userId, operationId: command.operationId, commandType: "CREATE_HABIT", request: command }, async (tx) => {
    await validateCategory(tx, command.userId, command.categoryId);
    const now = new Date();
    const [result] = await tx.insert(habitDefinitions).values({ userId: command.userId, categoryId: command.categoryId ?? null, name: command.name.trim(), description: command.description?.trim() || null, startDate: command.startDate, endDate: command.endDate ?? null, recordMode: command.recordMode, unit: command.unit?.trim() || null, taskCompletionEnabled: command.taskCompletionEnabled ? 1 : 0, version: 1, createdAt: now, updatedAt: now });
    await tx.insert(habitRuleVersions).values({ userId: command.userId, habitId: result.insertId, effectiveFrom: command.startDate, frequencyType: command.rule.frequencyType, weekdayMask: command.rule.weekdayMask ?? null, weeklyTarget: command.rule.weeklyTarget ?? null, enabled: 1, createdAt: now });
    await tx.insert(habitGoalVersions).values({ userId: command.userId, habitId: result.insertId, effectiveFrom: command.startDate, targetValue: String(command.targetValue), createdAt: now });
    return { id: result.insertId, version: 1 };
  });
}

export function reviseHabitRule(command: { userId: number; operationId: string; habitId: number; expectedVersion: number; effectiveFrom: string; rule: HabitRuleInput }) {
  return runMutation({ userId: command.userId, operationId: command.operationId, commandType: "REVISE_HABIT_RULE", request: command }, async (tx) => {
    const habit = await ownedHabit(tx, command.userId, command.habitId, true);
    if (habit.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "habit version conflict", 409);
    await requireCurrentOrFutureEffective(tx, command.userId, command.effectiveFrom);
    const existing = await tx.select({ id: habitRuleVersions.id }).from(habitRuleVersions).where(and(eq(habitRuleVersions.habitId, command.habitId), eq(habitRuleVersions.effectiveFrom, command.effectiveFrom)));
    if (existing.length) throw new BusinessError(ErrorCode.CONFLICT, "a rule already starts on this date", 409);
    await tx.insert(habitRuleVersions).values({ userId: command.userId, habitId: command.habitId, effectiveFrom: command.effectiveFrom, frequencyType: command.rule.frequencyType, weekdayMask: command.rule.weekdayMask ?? null, weeklyTarget: command.rule.weeklyTarget ?? null, enabled: 1, createdAt: new Date() });
    await tx.update(habitDefinitions).set({ version: habit.version + 1, updatedAt: new Date() }).where(eq(habitDefinitions.id, habit.id));
    return { id: habit.id, version: habit.version + 1 };
  });
}

export function reviseHabitGoal(command: { userId: number; operationId: string; habitId: number; expectedVersion: number; effectiveFrom: string; targetValue: number }) {
  return runMutation({ userId: command.userId, operationId: command.operationId, commandType: "REVISE_HABIT_GOAL", request: command }, async (tx) => {
    const habit = await ownedHabit(tx, command.userId, command.habitId, true);
    if (habit.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "habit version conflict", 409);
    await requireCurrentOrFutureEffective(tx, command.userId, command.effectiveFrom);
    const existing = await tx.select({ id: habitGoalVersions.id }).from(habitGoalVersions).where(and(eq(habitGoalVersions.habitId, command.habitId), eq(habitGoalVersions.effectiveFrom, command.effectiveFrom)));
    if (existing.length) throw new BusinessError(ErrorCode.CONFLICT, "a goal already starts on this date", 409);
    await tx.insert(habitGoalVersions).values({ userId: command.userId, habitId: command.habitId, effectiveFrom: command.effectiveFrom, targetValue: String(command.targetValue), createdAt: new Date() });
    await tx.update(habitDefinitions).set({ version: habit.version + 1, updatedAt: new Date() }).where(eq(habitDefinitions.id, habit.id));
    return { id: habit.id, version: habit.version + 1 };
  });
}

export function setHabitState(command: { userId: number; operationId: string; habitId: number; expectedVersion: number; effectiveFrom: string; action: "disable" | "enable" | "archive" | "restore" }) {
  return runMutation({ userId: command.userId, operationId: command.operationId, commandType: "SET_HABIT_STATE", request: command }, async (tx) => {
    const habit = await ownedHabit(tx, command.userId, command.habitId, true);
    if (habit.version !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "habit version conflict", 409);
    await requireCurrentOrFutureEffective(tx, command.userId, command.effectiveFrom);
    const rules = await tx.select().from(habitRuleVersions).where(and(eq(habitRuleVersions.habitId, habit.id), lte(habitRuleVersions.effectiveFrom, command.effectiveFrom))).orderBy(desc(habitRuleVersions.effectiveFrom));
    const current = rules[0];
    if (!current) throw new BusinessError(ErrorCode.CONFLICT, "habit has no active rule", 409);
    const existing = await tx.select({ id: habitRuleVersions.id }).from(habitRuleVersions).where(and(eq(habitRuleVersions.habitId, habit.id), eq(habitRuleVersions.effectiveFrom, command.effectiveFrom)));
    if (existing.length) throw new BusinessError(ErrorCode.CONFLICT, "a rule already starts on this date", 409);
    const enabled = command.action === "enable" || command.action === "restore";
    const now = new Date();
    await tx.insert(habitRuleVersions).values({ userId: command.userId, habitId: habit.id, effectiveFrom: command.effectiveFrom, frequencyType: current.frequencyType, weekdayMask: current.weekdayMask, weeklyTarget: current.weeklyTarget, enabled: enabled ? 1 : 0, createdAt: now });
    await tx.update(habitDefinitions).set({ archivedAt: command.action === "archive" ? now : command.action === "restore" ? null : habit.archivedAt, version: habit.version + 1, updatedAt: now }).where(eq(habitDefinitions.id, habit.id));
    return { id: habit.id, enabled, archived: command.action === "archive" ? true : command.action === "restore" ? false : Boolean(habit.archivedAt), version: habit.version + 1 };
  });
}

export function recordHabitOccurrence(command: { userId: number; operationId: string; habitId: number; occurrenceDate: string; recordTimezone: string; expectedVersion: number; actualValue?: number; skipped?: boolean; skipReason?: string }) {
  return runMutation({ userId: command.userId, operationId: command.operationId, commandType: "RECORD_HABIT_OCCURRENCE", request: command }, async (tx) => {
    const habit = await ownedHabit(tx, command.userId, command.habitId);
    if (command.occurrenceDate > businessDateAt(new Date(), command.recordTimezone)) throw new BusinessError(ErrorCode.CONFLICT, "future occurrences are not allowed", 409);
    const rules = await tx.select().from(habitRuleVersions).where(and(eq(habitRuleVersions.habitId, habit.id), lte(habitRuleVersions.effectiveFrom, command.occurrenceDate))).orderBy(desc(habitRuleVersions.effectiveFrom));
    const goals = await tx.select().from(habitGoalVersions).where(and(eq(habitGoalVersions.habitId, habit.id), lte(habitGoalVersions.effectiveFrom, command.occurrenceDate))).orderBy(desc(habitGoalVersions.effectiveFrom));
    if (!rules[0]?.enabled || !expectedForDate(rules[0], command.occurrenceDate)) throw new BusinessError(ErrorCode.CONFLICT, "habit is not expected on this date", 409);
    const [current] = await tx.select().from(habitOccurrences).where(and(eq(habitOccurrences.userId, command.userId), eq(habitOccurrences.habitId, habit.id), eq(habitOccurrences.occurrenceDate, command.occurrenceDate))).for("update");
    if ((current?.version ?? 0) !== command.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "habit occurrence version conflict", 409);
    const target = Number(goals[0]?.targetValue ?? 1);
    const value = command.skipped ? null : habit.recordMode === HabitRecordMode.COMPLETION ? 1 : command.actualValue ?? 0;
    const status = command.skipped ? HabitOccurrenceStatus.SKIPPED : Number(value) >= target ? HabitOccurrenceStatus.COMPLETED : HabitOccurrenceStatus.PARTIAL;
    const now = new Date();
    if (current) {
      await tx.update(habitOccurrences).set({ status, actualValue: value === null ? null : String(value), skipReason: command.skipped ? command.skipReason?.trim() || null : null, source: HabitOccurrenceSource.MANUAL, version: current.version + 1, updatedAt: now }).where(eq(habitOccurrences.id, current.id));
      return { id: current.id, version: current.version + 1, status, actualValue: value };
    }
    const [result] = await tx.insert(habitOccurrences).values({ userId: command.userId, habitId: habit.id, occurrenceDate: command.occurrenceDate, recordTimezone: command.recordTimezone, status, actualValue: value === null ? null : String(value), skipReason: command.skipped ? command.skipReason?.trim() || null : null, source: HabitOccurrenceSource.MANUAL, version: 1, createdAt: now, updatedAt: now });
    return { id: result.insertId, version: 1, status, actualValue: value };
  });
}

export function publishHabitTask(command: { userId: number; operationId: string; habitId: number; occurrenceDate: string; recordTimezone: string }) {
  return runMutation({ userId: command.userId, operationId: command.operationId, commandType: "PUBLISH_HABIT_TASK", request: command }, async (tx) => {
    const habit = await ownedHabit(tx, command.userId, command.habitId);
    const [existing] = await tx.select().from(habitTaskLinks).where(and(eq(habitTaskLinks.userId, command.userId), eq(habitTaskLinks.habitId, habit.id), eq(habitTaskLinks.occurrenceDate, command.occurrenceDate)));
    if (existing) return { id: existing.taskId, taskId: existing.taskId, linked: true };
    const task = await publishTaskInClient(tx, { userId: command.userId, operationId: command.operationId, title: habit.name, description: `习惯 · ${command.occurrenceDate}`, categoryId: habit.categoryId ?? undefined, priority: 2, difficulty: 1, progressPercent: 0, acceptDate: command.occurrenceDate, recordTimezone: command.recordTimezone });
    await tx.insert(habitTaskLinks).values({ userId: command.userId, habitId: habit.id, occurrenceDate: command.occurrenceDate, taskId: task.id, completeHabitOnTask: habit.recordMode === HabitRecordMode.COMPLETION && habit.taskCompletionEnabled ? 1 : 0, createdAt: new Date() });
    return { id: task.id, taskId: task.id, linked: true };
  });
}

export async function completeLinkedHabitFromTaskInClient(client: DatabaseClient, command: { userId: number; taskId: number; completedAt: Date; recordTimezone: string }) {
  const [link] = await client.select().from(habitTaskLinks).where(and(eq(habitTaskLinks.userId, command.userId), eq(habitTaskLinks.taskId, command.taskId), eq(habitTaskLinks.completeHabitOnTask, 1)));
  if (!link) return null;
  const [current] = await client.select().from(habitOccurrences).where(and(eq(habitOccurrences.userId, command.userId), eq(habitOccurrences.habitId, link.habitId), eq(habitOccurrences.occurrenceDate, link.occurrenceDate))).for("update");
  if (current?.status === HabitOccurrenceStatus.COMPLETED) return { id: current.id, created: false };
  const now = command.completedAt;
  if (current) {
    await client.update(habitOccurrences).set({ status: HabitOccurrenceStatus.COMPLETED, actualValue: "1", skipReason: null, source: HabitOccurrenceSource.LINKED_TASK, version: current.version + 1, updatedAt: now }).where(eq(habitOccurrences.id, current.id));
    return { id: current.id, created: false };
  }
  const [result] = await client.insert(habitOccurrences).values({ userId: command.userId, habitId: link.habitId, occurrenceDate: link.occurrenceDate, recordTimezone: command.recordTimezone, status: HabitOccurrenceStatus.COMPLETED, actualValue: "1", source: HabitOccurrenceSource.LINKED_TASK, version: 1, createdAt: now, updatedAt: now });
  return { id: result.insertId, created: true };
}

export async function habitList(userId: number) {
  const definitions = await db.select().from(habitDefinitions).where(eq(habitDefinitions.userId, userId)).orderBy(asc(habitDefinitions.archivedAt), asc(habitDefinitions.name));
  const ids = definitions.map((item) => item.id);
  const [rules, goals] = ids.length ? await Promise.all([db.select().from(habitRuleVersions).where(inArray(habitRuleVersions.habitId, ids)).orderBy(asc(habitRuleVersions.effectiveFrom)), db.select().from(habitGoalVersions).where(inArray(habitGoalVersions.habitId, ids)).orderBy(asc(habitGoalVersions.effectiveFrom))]) : [[], []];
  return definitions.map((definition) => ({ ...definition, rules: rules.filter((rule) => rule.habitId === definition.id), goals: goals.filter((goal) => goal.habitId === definition.id) }));
}

export async function habitDetail(userId: number, habitId: number) {
  const habit = await ownedHabit(db, userId, habitId);
  const [rules, goals, occurrences, links] = await Promise.all([
    db.select().from(habitRuleVersions).where(eq(habitRuleVersions.habitId, habit.id)).orderBy(desc(habitRuleVersions.effectiveFrom)),
    db.select().from(habitGoalVersions).where(eq(habitGoalVersions.habitId, habit.id)).orderBy(desc(habitGoalVersions.effectiveFrom)),
    db.select().from(habitOccurrences).where(and(eq(habitOccurrences.userId, userId), eq(habitOccurrences.habitId, habit.id))).orderBy(desc(habitOccurrences.occurrenceDate)),
    db.select().from(habitTaskLinks).where(and(eq(habitTaskLinks.userId, userId), eq(habitTaskLinks.habitId, habit.id))).orderBy(desc(habitTaskLinks.occurrenceDate))
  ]);
  return { habit, rules, goals, occurrences, links };
}

export async function habitSummary(userId: number, date: string) {
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
  const today = businessDateAt(new Date(), user.timezone);
  const definitions = await db.select().from(habitDefinitions).where(and(eq(habitDefinitions.userId, userId), lte(habitDefinitions.startDate, date))).orderBy(asc(habitDefinitions.name));
  const ids = definitions.map((item) => item.id);
  const weekFrom = mondayOf(date), weekTo = sundayOf(date);
  const [rules, goals, occurrenceRows, water, writing, sleep] = await Promise.all([
    ids.length ? db.select().from(habitRuleVersions).where(and(inArray(habitRuleVersions.habitId, ids), lte(habitRuleVersions.effectiveFrom, date))) : [],
    ids.length ? db.select().from(habitGoalVersions).where(and(inArray(habitGoalVersions.habitId, ids), lte(habitGoalVersions.effectiveFrom, date))) : [],
    ids.length ? db.select().from(habitOccurrences).where(and(eq(habitOccurrences.userId, userId), inArray(habitOccurrences.habitId, ids), lte(habitOccurrences.occurrenceDate, weekTo))) : [],
    db.select().from(waterRecords).where(and(eq(waterRecords.userId, userId), eq(waterRecords.waterDate, date), isNull(waterRecords.deletedAt))),
    db.select().from(morningWritings).where(and(eq(morningWritings.userId, userId), eq(morningWritings.writingDate, date), isNull(morningWritings.deletedAt))),
    db.select().from(sleepRecords).where(and(eq(sleepRecords.userId, userId), eq(sleepRecords.sleepDate, date), isNull(sleepRecords.deletedAt)))
  ]);
  const items = definitions.flatMap((habit) => {
    if (habit.endDate && date > dateOnly(habit.endDate)) return [];
    const rule = latestAt(rules, habit.id, date), goal = latestAt(goals, habit.id, date);
    if (!rule?.enabled || !goal) return [];
    const target = Number(goal.targetValue);
    if (rule.frequencyType === HabitFrequency.WEEKLY_N) {
      const weekRows = occurrenceRows.filter((row) => row.habitId === habit.id && dateOnly(row.occurrenceDate) >= weekFrom && dateOnly(row.occurrenceDate) <= weekTo);
      const completed = weekRows.filter((row) => row.status === HabitOccurrenceStatus.COMPLETED).length;
      return [{ ...habit, frequencyType: rule.frequencyType, weeklyTarget: rule.weeklyTarget, targetValue: target, weekFrom, weekTo, completed, status: completed >= (rule.weeklyTarget ?? 1) ? "COMPLETED" : "IN_PROGRESS", occurrence: null }];
    }
    if (!expectedForDate(rule, date)) return [];
    const occurrence = occurrenceRows.find((row) => row.habitId === habit.id && dateOnly(row.occurrenceDate) === date) ?? null;
    const status = occurrence ? ["PARTIAL", "COMPLETED", "SKIPPED"][occurrence.status] : date < today ? "MISSED" : "PENDING";
    return [{ ...habit, frequencyType: rule.frequencyType, targetValue: target, status, occurrence }];
  });
  return { date, weekFrom, weekTo, items, specialized: { water: water[0] ? { cups: water[0].cups, targetCups: water[0].targetCups, status: water[0].cups >= water[0].targetCups ? "COMPLETED" : "PARTIAL" } : { cups: 0, targetCups: 8, status: "PENDING" }, morningWriting: { completed: Boolean(writing[0]?.content?.trim()) }, sleep: sleep[0] ? { recorded: true, durationMinutes: sleep[0].durationMinutes, qualityScore: sleep[0].qualityScore } : { recorded: false } } };
}
