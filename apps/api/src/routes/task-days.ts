import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { taskDailyAssignments, tasks, users } from "../db/schema.js";
import { AssignmentStatus, ContinuationState, TaskStatus } from "../enums.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { acceptTaskForDate, carryOverAssignment, releaseAssignment, replaceAssignmentsForDate, resolveContinuation } from "../task-assignments.js";
import { isValidTimezone } from "../time.js";

const dateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const updateDailyTasksSchema = z.object({
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taskIds: z.array(z.number().int().positive()).max(30),
  focusTaskIds: z.array(z.number().int().positive()).max(3).optional()
});

const operationId = z.string().uuid();
const acceptSchema = z.object({ operationId, taskId: z.number().int().positive(), taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), recordTimezone: z.string().refine(isValidTimezone) });
const releaseSchema = z.object({ operationId, expectedVersion: z.number().int().positive() });
const resolveSchema = z.object({
  operationId,
  sources: z.array(z.object({ id: z.number().int().positive(), expectedVersion: z.number().int().positive() })).min(1),
  resolution: z.union([z.literal(ContinuationState.CARRIED_FORWARD), z.literal(ContinuationState.DEFERRED), z.literal(ContinuationState.DISMISSED), z.literal(ContinuationState.RESCHEDULED)]),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  targetTimezone: z.string().refine(isValidTimezone).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().trim().max(255).optional()
});

export const taskDaysRoute = new Hono()
  .post("/accept", async (c) => ok(c, await acceptTaskForDate({ userId: getCurrentUserId(c), ...acceptSchema.parse(await c.req.json()) })))
  .post("/continuations/resolve", async (c) => ok(c, await resolveContinuation({ userId: getCurrentUserId(c), ...resolveSchema.parse(await c.req.json()) })))
  .post("/continuations/carry-over", async (c) => {
    const body = resolveSchema.omit({ resolution: true }).parse(await c.req.json());
    return ok(c, await carryOverAssignment({ userId: getCurrentUserId(c), ...body }));
  })
  .put("/:id/release", async (c) => {
    const assignmentId = z.coerce.number().int().positive().parse(c.req.param("id"));
    return ok(c, await releaseAssignment({ userId: getCurrentUserId(c), assignmentId, ...releaseSchema.parse(await c.req.json()) }));
  })
  .get("/continuations", async (c) => {
    const query = dateSchema.parse(c.req.query());
    const userId = getCurrentUserId(c);
    const rows = await db
      .select({ assignment: taskDailyAssignments, task: tasks })
      .from(taskDailyAssignments)
      .innerJoin(tasks, eq(taskDailyAssignments.taskId, tasks.id))
      .where(and(
        eq(taskDailyAssignments.userId, userId),
        eq(taskDailyAssignments.assignmentStatus, AssignmentStatus.ACCEPTED),
        lt(taskDailyAssignments.taskDate, query.date),
        isNull(tasks.deletedAt),
        or(eq(tasks.status, TaskStatus.TODO), eq(tasks.status, TaskStatus.IN_PROGRESS)),
        or(
          eq(taskDailyAssignments.continuationState, ContinuationState.PENDING),
          and(
            eq(taskDailyAssignments.continuationState, ContinuationState.DEFERRED),
            lte(taskDailyAssignments.continuationTargetDate, query.date)
          )
        )
      ))
      .orderBy(asc(taskDailyAssignments.taskDate), asc(taskDailyAssignments.id));
    return ok(c, rows);
  })
  .get("/", async (c) => {
    const query = dateSchema.parse(c.req.query());
    const rows = await db
      .select({ id: taskDailyAssignments.id, taskId: taskDailyAssignments.taskId, version: taskDailyAssignments.version, sortOrder: taskDailyAssignments.sortOrder, focusRank: taskDailyAssignments.focusRank, assignmentStatus: taskDailyAssignments.assignmentStatus, recordTimezone: taskDailyAssignments.recordTimezone })
      .from(taskDailyAssignments)
      .where(and(eq(taskDailyAssignments.userId, getCurrentUserId(c)), eq(taskDailyAssignments.taskDate, query.date), eq(taskDailyAssignments.assignmentStatus, AssignmentStatus.ACCEPTED)))
      .orderBy(asc(taskDailyAssignments.sortOrder), asc(taskDailyAssignments.id));
    return ok(c, { taskDate: query.date, taskIds: rows.map((row) => row.taskId), assignments: rows });
  })
  .put("/", async (c) => {
    const body = updateDailyTasksSchema.parse(await c.req.json());
    const userId = getCurrentUserId(c);
    const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
    if (!user) throw new BusinessError(ErrorCode.NOT_FOUND, "user not found", 404);
    const result = await replaceAssignmentsForDate({ userId, taskDate: body.taskDate, taskIds: body.taskIds, focusTaskIds: body.focusTaskIds, recordTimezone: user.timezone });

    log.info({ userId, taskDate: body.taskDate, taskCount: result.taskIds.length }, "[daily_tasks_updated]");
    return ok(c, result);
  });
