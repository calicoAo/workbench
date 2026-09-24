import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { projects, schedules, tasks, timerSegments } from "../db/schema.js";
import { ActualTimeClass, AttributionStatus, ProjectStatus, ScheduleKind, TaskStatus, TimerSegmentStatus } from "../enums.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { projectMaterialsForUser } from "../quick-note.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const projectFields = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000).nullable().optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  startDate: date.nullable().optional(),
  targetDate: date.nullable().optional(),
  notes: z.string().max(10000).nullable().optional()
});
const createSchema = projectFields.refine((value) => !value.startDate || !value.targetDate || value.targetDate >= value.startDate, { path: ["targetDate"], message: "target date must not precede start date" });
const updateSchema = projectFields.partial().extend({ expectedVersion: z.number().int().positive() }).refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), { message: "at least one editable field is required" });
const statusSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.union([z.literal(ProjectStatus.ACTIVE), z.literal(ProjectStatus.PAUSED), z.literal(ProjectStatus.DONE)]),
  unfinishedTaskPolicy: z.literal("KEEP").optional()
});
const versionSchema = z.object({ expectedVersion: z.number().int().positive() });

async function summarize(userId: number, projectRows: Array<typeof projects.$inferSelect>) {
  if (!projectRows.length) return [];
  const ids = projectRows.map((project) => project.id);
  const [taskStats, timerStats, manualStats, nextTasks] = await Promise.all([
    db.select({
      projectId: tasks.projectId,
      taskCount: sql<number>`count(*)`,
      completedTaskCount: sql<number>`sum(case when ${tasks.status} = ${TaskStatus.DONE} then 1 else 0 end)`,
      progressPercent: sql<number>`avg(case when ${tasks.status} = ${TaskStatus.DONE} then 100 else ${tasks.progressPercent} end)`
    }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.projectId, ids), isNull(tasks.deletedAt), sql`${tasks.status} <> ${TaskStatus.ARCHIVED}`)).groupBy(tasks.projectId),
    db.select({ projectId: timerSegments.projectIdAtOccurrence, seconds: sql<number>`sum(timestampdiff(second, ${timerSegments.startedAt}, ${timerSegments.endedAt}))` })
      .from(timerSegments).where(and(eq(timerSegments.userId, userId), inArray(timerSegments.projectIdAtOccurrence, ids), eq(timerSegments.projectAttributionStatus, AttributionStatus.ATTRIBUTED), eq(timerSegments.status, TimerSegmentStatus.CLOSED), isNull(timerSegments.deletedAt))).groupBy(timerSegments.projectIdAtOccurrence),
    db.select({ projectId: schedules.projectIdAtOccurrence, seconds: sql<number>`sum(timestampdiff(second, ${schedules.actualStartedAt}, ${schedules.actualEndedAt}))` })
      .from(schedules).where(and(eq(schedules.userId, userId), inArray(schedules.projectIdAtOccurrence, ids), eq(schedules.projectAttributionStatus, AttributionStatus.ATTRIBUTED), inArray(schedules.actualTimeClass, [ActualTimeClass.MANUAL_ACTUAL, ActualTimeClass.LEGACY_ACTUAL]), eq(schedules.includeInActualTime, 1), isNull(schedules.deletedAt))).groupBy(schedules.projectIdAtOccurrence),
    db.select({ id: tasks.id, projectId: tasks.projectId, title: tasks.title, priority: tasks.priority, dueAt: tasks.dueAt, progressPercent: tasks.progressPercent, status: tasks.status, version: tasks.version })
      .from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.projectId, ids), inArray(tasks.status, [TaskStatus.TODO, TaskStatus.IN_PROGRESS]), isNull(tasks.deletedAt))).orderBy(desc(tasks.priority), asc(tasks.dueAt), asc(tasks.sortOrder))
  ]);
  const taskMap = new Map(taskStats.map((row) => [row.projectId, row]));
  const timerMap = new Map(timerStats.map((row) => [row.projectId, Number(row.seconds ?? 0)]));
  const manualMap = new Map(manualStats.map((row) => [row.projectId, Number(row.seconds ?? 0)]));
  return projectRows.map((project) => {
    const stats = taskMap.get(project.id);
    return {
      ...project,
      taskCount: Number(stats?.taskCount ?? 0),
      completedTaskCount: Number(stats?.completedTaskCount ?? 0),
      progressPercent: stats ? Math.round(Number(stats.progressPercent)) : null,
      actualSeconds: (timerMap.get(project.id) ?? 0) + (manualMap.get(project.id) ?? 0),
      nextTask: nextTasks.find((task) => task.projectId === project.id) ?? null
    };
  });
}

async function lockedProject(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: number, id: number) {
  const [project] = await tx.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).for("update");
  if (!project) throw new BusinessError(ErrorCode.NOT_FOUND, "project not found", 404);
  return project;
}

export const projectsRoute = new Hono()
  .get("/", async (c) => {
    const userId = getCurrentUserId(c);
    const view = z.enum(["active", "archived", "all"]).default("active").parse(c.req.query("view"));
    const rows = await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.archivedAt), asc(projects.status), desc(projects.priority), asc(projects.targetDate), desc(projects.updatedAt));
    const filtered = rows.filter((project) => view === "all" || (view === "archived" ? project.archivedAt : !project.archivedAt));
    return ok(c, await summarize(userId, filtered));
  })
  .get("/:id/materials", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
    if (!project) throw new BusinessError(ErrorCode.NOT_FOUND, "project not found", 404);
    return ok(c, { items: await projectMaterialsForUser(userId, id), privacy: "FIRST_PARTY_PERSONAL_TEXT_SUMMARY" });
  })
  .get("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
    if (!project) throw new BusinessError(ErrorCode.NOT_FOUND, "project not found", 404);
    const [summary] = await summarize(userId, [project]);
    const [taskRows, plannedSchedules, timerActual, manualActual] = await Promise.all([
      db.select().from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.projectId, id), isNull(tasks.deletedAt))).orderBy(asc(tasks.status), desc(tasks.priority), asc(tasks.sortOrder)),
      db.select().from(schedules).innerJoin(tasks, and(eq(schedules.taskId, tasks.id), eq(tasks.userId, userId), eq(tasks.projectId, id), isNull(tasks.deletedAt))).where(and(eq(schedules.userId, userId), eq(schedules.kind, ScheduleKind.PLANNED), isNull(schedules.deletedAt))).orderBy(desc(schedules.scheduleDate)),
      db.select().from(timerSegments).where(and(eq(timerSegments.userId, userId), eq(timerSegments.projectIdAtOccurrence, id), eq(timerSegments.projectAttributionStatus, AttributionStatus.ATTRIBUTED), eq(timerSegments.status, TimerSegmentStatus.CLOSED), isNull(timerSegments.deletedAt))).orderBy(desc(timerSegments.startedAt)),
      db.select().from(schedules).where(and(eq(schedules.userId, userId), eq(schedules.projectIdAtOccurrence, id), eq(schedules.projectAttributionStatus, AttributionStatus.ATTRIBUTED), inArray(schedules.actualTimeClass, [ActualTimeClass.MANUAL_ACTUAL, ActualTimeClass.LEGACY_ACTUAL]), isNull(schedules.deletedAt))).orderBy(desc(schedules.actualStartedAt))
    ]);
    return ok(c, { project: summary, tasks: taskRows, plannedSchedules: plannedSchedules.map((row) => row.schedules), actualEntries: [...timerActual.map((row) => ({ ...row, source: "TIMER_SEGMENT" })), ...manualActual.map((row) => ({ ...row, source: row.actualTimeClass === ActualTimeClass.MANUAL_ACTUAL ? "MANUAL_ACTUAL" : "LEGACY_ACTUAL" }))] });
  })
  .post("/", async (c) => {
    const userId = getCurrentUserId(c);
    const body = createSchema.parse(await c.req.json());
    const now = new Date();
    const [result] = await db.insert(projects).values({ userId, name: body.name, description: body.description?.trim() || null, status: ProjectStatus.PLANNING, priority: body.priority, startDate: body.startDate, targetDate: body.targetDate, notes: body.notes?.trim() || null, version: 1, createdAt: now, updatedAt: now });
    return ok(c, { id: result.insertId, version: 1, status: ProjectStatus.PLANNING });
  })
  .put("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const body = updateSchema.parse(await c.req.json());
    return ok(c, await db.transaction(async (tx) => {
      const project = await lockedProject(tx, userId, id);
      if (project.version !== body.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "project version conflict", 409);
      const startDate = body.startDate === undefined ? project.startDate : body.startDate;
      const targetDate = body.targetDate === undefined ? project.targetDate : body.targetDate;
      if (startDate && targetDate && targetDate < startDate) throw new BusinessError(ErrorCode.PARAM_ERROR, "target date must not precede start date");
      const version = project.version + 1;
      await tx.update(projects).set({ name: body.name ?? project.name, description: body.description === undefined ? project.description : body.description?.trim() || null, priority: body.priority ?? project.priority, startDate, targetDate, notes: body.notes === undefined ? project.notes : body.notes?.trim() || null, version, updatedAt: new Date() }).where(eq(projects.id, id));
      return { id, version };
    }));
  })
  .put("/:id/status", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const body = statusSchema.parse(await c.req.json());
    return ok(c, await db.transaction(async (tx) => {
      const project = await lockedProject(tx, userId, id);
      if (project.archivedAt) throw new BusinessError(ErrorCode.CONFLICT, "restore project before changing status", 409);
      if (project.version !== body.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "project version conflict", 409);
      if (project.status === ProjectStatus.DONE) throw new BusinessError(ErrorCode.CONFLICT, "completed project status is final", 409);
      if (body.status === ProjectStatus.DONE) {
        const unfinished = await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.projectId, id), inArray(tasks.status, [TaskStatus.TODO, TaskStatus.IN_PROGRESS]), isNull(tasks.deletedAt)));
        if (unfinished.length && body.unfinishedTaskPolicy !== "KEEP") throw new BusinessError(ErrorCode.CONFLICT, "unfinished tasks require explicit KEEP handling", 409);
      }
      const version = project.version + 1;
      await tx.update(projects).set({ status: body.status, version, updatedAt: new Date() }).where(eq(projects.id, id));
      return { id, status: body.status, version };
    }));
  })
  .put("/:id/archive", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const body = versionSchema.parse(await c.req.json());
    return ok(c, await db.transaction(async (tx) => {
      const project = await lockedProject(tx, userId, id);
      if (project.version !== body.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "project version conflict", 409);
      if (project.status === ProjectStatus.ACTIVE) throw new BusinessError(ErrorCode.CONFLICT, "pause or complete the project before archiving", 409);
      const version = project.version + 1;
      await tx.update(projects).set({ archivedAt: new Date(), version, updatedAt: new Date() }).where(eq(projects.id, id));
      return { id, archived: true, version };
    }));
  })
  .put("/:id/restore", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const userId = getCurrentUserId(c);
    const body = versionSchema.parse(await c.req.json());
    return ok(c, await db.transaction(async (tx) => {
      const project = await lockedProject(tx, userId, id);
      if (project.version !== body.expectedVersion) throw new BusinessError(ErrorCode.CONFLICT, "project version conflict", 409);
      const version = project.version + 1;
      await tx.update(projects).set({ archivedAt: null, version, updatedAt: new Date() }).where(eq(projects.id, id));
      return { id, archived: false, version };
    }));
  });
