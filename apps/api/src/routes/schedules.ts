import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { schedules, tasks } from "../db/schema.js";
import { ScheduleKind, ScheduleSource } from "../enums.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";


const createScheduleSchema = z.object({
  scheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  kind: z.union([z.literal(ScheduleKind.PLANNED), z.literal(ScheduleKind.ACTUAL)]),
  taskId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(500).optional()
});

export const schedulesRoute = new Hono()
  .post("/", async (c) => {
    const body = createScheduleSchema.parse(await c.req.json());
    if (body.endTime <= body.startTime) {
      throw new BusinessError(ErrorCode.PARAM_ERROR, "end time must be later than start time");
    }

    const [task] = body.taskId
      ? await db.select().from(tasks).where(and(eq(tasks.id, body.taskId), eq(tasks.userId, getCurrentUserId(c)), isNull(tasks.deletedAt)))
      : [];
    if (body.taskId && !task) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "task not found", 404);
    }
    if (!task && !body.title) {
      throw new BusinessError(ErrorCode.PARAM_ERROR, "title is required when taskId is omitted");
    }

    const now = new Date();
    const [result] = await db.insert(schedules).values({
      userId: getCurrentUserId(c),
      taskId: task?.id,
      categoryId: task?.categoryId ?? body.categoryId,
      scheduleDate: body.scheduleDate,
      startTime: `${body.startTime}:00`,
      endTime: `${body.endTime}:00`,
      title: body.title ?? task?.title ?? "Untitled time block",
      note: body.note,
      completed: body.kind === ScheduleKind.ACTUAL ? 1 : 0,
      kind: body.kind,
      source: ScheduleSource.MANUAL,
      createdAt: now,
      updatedAt: now
    });

    log.info({ userId: getCurrentUserId(c), scheduleId: result.insertId }, "[schedule_created]");
    return ok(c, { id: result.insertId });
  })
  .delete("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    await db.delete(schedules).where(and(eq(schedules.id, id), eq(schedules.userId, getCurrentUserId(c))));
    log.info({ userId: getCurrentUserId(c), scheduleId: id }, "[schedule_deleted]");
    return ok(c, { id });
  });

