import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { schedules, taskCategories, tasks, timerSessions } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";


const createCategorySchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().max(32).default("#35C99A"),
  icon: z.string().max(64).optional(),
  targetMinutes: z.number().int().positive().default(6000)
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().max(32),
  icon: z.string().max(64).optional(),
  targetMinutes: z.number().int().positive()
});

export const taskCategoriesRoute = new Hono()
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(taskCategories)
      .where(and(eq(taskCategories.userId, getCurrentUserId(c)), eq(taskCategories.enabled, 1), isNull(taskCategories.deletedAt)));

    return ok(c, rows);
  })
  .post("/", async (c) => {
    const body = createCategorySchema.parse(await c.req.json());
    const [result] = await db.insert(taskCategories).values({
      userId: getCurrentUserId(c),
      name: body.name,
      color: body.color,
      icon: body.icon,
      targetMinutes: body.targetMinutes,
      sortOrder: 0,
      enabled: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return ok(c, { id: result.insertId });
  })
  .put("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const body = updateCategorySchema.parse(await c.req.json());
    const [category] = await db
      .select()
      .from(taskCategories)
      .where(and(eq(taskCategories.id, id), eq(taskCategories.userId, getCurrentUserId(c)), isNull(taskCategories.deletedAt)));
    if (!category) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "category not found", 404);
    }

    await db
      .update(taskCategories)
      .set({ name: body.name, color: body.color, icon: body.icon, targetMinutes: body.targetMinutes, updatedAt: new Date() })
      .where(and(eq(taskCategories.id, id), eq(taskCategories.userId, getCurrentUserId(c))));

    log.info({ userId: getCurrentUserId(c), categoryId: id }, "[category_updated]");
    return ok(c, { id });
  })
  .delete("/:id", async (c) => {
    const id = z.coerce.number().int().positive().parse(c.req.param("id"));
    const [category] = await db
      .select()
      .from(taskCategories)
      .where(and(eq(taskCategories.id, id), eq(taskCategories.userId, getCurrentUserId(c)), isNull(taskCategories.deletedAt)));
    if (!category) {
      throw new BusinessError(ErrorCode.NOT_FOUND, "category not found", 404);
    }

    const now = new Date();
    await Promise.all([
      db.update(tasks).set({ categoryId: null, updatedAt: now }).where(and(eq(tasks.categoryId, id), eq(tasks.userId, getCurrentUserId(c)))),
      db.update(schedules).set({ categoryId: null, updatedAt: now }).where(and(eq(schedules.categoryId, id), eq(schedules.userId, getCurrentUserId(c)))),
      db.update(timerSessions).set({ categoryId: null, updatedAt: now }).where(and(eq(timerSessions.categoryId, id), eq(timerSessions.userId, getCurrentUserId(c)))),
      db.delete(taskCategories).where(and(eq(taskCategories.id, id), eq(taskCategories.userId, getCurrentUserId(c))))
    ]);

    log.info({ userId: getCurrentUserId(c), categoryId: id }, "[category_deleted]");
    return ok(c, { id });
  });

