import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db/index.js";
import { scheduleCarryovers, schedules, taskDailyAssignments, tasks } from "./db/schema.js";
import { ScheduleKind, ScheduleSource, TaskStatus } from "./enums.js";

export type DailyCarryoverCommand = {
  userId: number;
  targetDate: string;
};

export async function applyDailyCarryover(command: DailyCarryoverCommand) {
  await inheritDailyTaskAssignments(command);
  await carryForwardUnfinishedPlans(command);
  return { targetDate: command.targetDate };
}

async function inheritDailyTaskAssignments({ userId, targetDate }: DailyCarryoverCommand) {
  await db.transaction(async (tx) => {
    const current = await tx
      .select({ taskId: taskDailyAssignments.taskId })
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.taskDate, targetDate)));
    if (current.length) return;

    const previousDate = shiftDate(targetDate, -1);
    const previousRows = await tx
      .select({ taskId: taskDailyAssignments.taskId, sortOrder: taskDailyAssignments.sortOrder })
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.taskDate, previousDate)))
      .orderBy(asc(taskDailyAssignments.sortOrder), asc(taskDailyAssignments.id));
    if (!previousRows.length) return;

    const taskRows = await tx
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));
    const pendingIds = new Set(
      taskRows
        .filter((task) => task.status !== TaskStatus.DONE && task.status !== TaskStatus.ARCHIVED)
        .map((task) => task.id)
    );
    const inherited = previousRows.filter((row) => pendingIds.has(row.taskId));
    if (!inherited.length) return;

    const now = new Date();
    await tx
      .insert(taskDailyAssignments)
      .values(
        inherited.map((row, index) => ({
          userId,
          taskId: row.taskId,
          taskDate: targetDate,
          sortOrder: index + 1,
          createdAt: now,
          updatedAt: now
        }))
      )
      .onDuplicateKeyUpdate({ set: { taskId: sql`${taskDailyAssignments.taskId}` } });
  });
}

async function carryForwardUnfinishedPlans({ userId, targetDate }: DailyCarryoverCommand) {
  await db.transaction(async (tx) => {
    const previousDate = shiftDate(targetDate, -1);
    const previousPlans = await tx
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.userId, userId),
          eq(schedules.scheduleDate, previousDate),
          eq(schedules.kind, ScheduleKind.PLANNED),
          isNull(schedules.deletedAt)
        )
      )
      .orderBy(asc(schedules.id));
    if (!previousPlans.length) return;

    const currentPlans = await tx
      .select({ taskId: schedules.taskId })
      .from(schedules)
      .where(and(eq(schedules.userId, userId), eq(schedules.scheduleDate, targetDate), isNull(schedules.deletedAt)));
    const taskRows = await tx.select().from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)));
    const handledCarryovers = await tx
      .select({ fromScheduleId: scheduleCarryovers.fromScheduleId })
      .from(scheduleCarryovers)
      .where(and(eq(scheduleCarryovers.userId, userId), eq(scheduleCarryovers.carryDate, targetDate)));

    const taskById = new Map(taskRows.map((task) => [task.id, task]));
    const handledScheduleIds = new Set(handledCarryovers.map((carryover) => carryover.fromScheduleId));
    const candidatePlans = previousPlans.filter((plan) => {
      if (!plan.taskId || plan.completed || handledScheduleIds.has(plan.id)) return false;
      const task = taskById.get(plan.taskId);
      return task && task.status !== TaskStatus.DONE && task.status !== TaskStatus.ARCHIVED;
    });
    if (!candidatePlans.length) return;

    const occupiedTaskIds = new Set(
      currentPlans.map((plan) => plan.taskId).filter((taskId): taskId is number => Boolean(taskId))
    );
    const inheritedPlans = candidatePlans.filter((plan) => {
      if (!plan.taskId || occupiedTaskIds.has(plan.taskId)) return false;
      occupiedTaskIds.add(plan.taskId);
      return true;
    });
    const now = new Date();

    if (inheritedPlans.length) {
      await tx
        .insert(schedules)
        .values(
          inheritedPlans.map((plan) => ({
            userId,
            taskId: plan.taskId,
            categoryId: plan.categoryId,
            scheduleDate: targetDate,
            startTime: plan.startTime,
            endTime: plan.endTime,
            title: plan.title,
            note: plan.note,
            completed: 0,
            kind: ScheduleKind.PLANNED,
            source: ScheduleSource.PLANNED_TASK,
            sourceId: carryoverSourceId(targetDate, plan.id),
            createdAt: now,
            updatedAt: now
          }))
        )
        .onDuplicateKeyUpdate({ set: { sourceId: sql`${schedules.sourceId}` } });
    }

    await tx
      .insert(scheduleCarryovers)
      .values(
        candidatePlans.map((plan) => ({
          userId,
          fromScheduleId: plan.id,
          carryDate: targetDate,
          createdAt: now
        }))
      )
      .onDuplicateKeyUpdate({ set: { fromScheduleId: sql`${scheduleCarryovers.fromScheduleId}` } });
  });
}

function carryoverSourceId(targetDate: string, fromScheduleId: number) {
  return `daily-carryover:${targetDate}:${fromScheduleId}`;
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days, 12));
  return next.toISOString().slice(0, 10);
}
