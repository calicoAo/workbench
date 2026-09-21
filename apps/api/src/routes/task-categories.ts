import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { db } from "../db/index.js";
import { schedules, taskCategories, tasks, timerSessions } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";


const dimensionKeySchema = z.enum(["career", "creative", "learning", "life", "body", "social", "leisure", "foundation"]);

const createCategorySchema = z.object({
  name: z.string().min(1).max(64),
  dimensionKey: dimensionKeySchema.default("life"),
  color: z.string().max(32).default("#35C99A"),
  icon: z.string().max(64).optional(),
  targetMinutes: z.number().int().positive().default(6000)
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(64).optional(),
  dimensionKey: dimensionKeySchema.optional(),
  color: z.string().max(32).optional(),
  icon: z.string().max(64).optional(),
  targetMinutes: z.number().int().positive().optional(),
  enabled: z.boolean().optional()
}).refine((value) => Object.values(value).some((item) => item !== undefined), { message: "at least one field is required" });

export const taskCategoriesRoute = new Hono()
  .get("/", async (c) => {
    const includeDisabled = c.req.query("includeDisabled") === "true";
    const rows = await db
      .select()
      .from(taskCategories)
      .where(and(eq(taskCategories.userId, getCurrentUserId(c)), ...(includeDisabled ? [] : [eq(taskCategories.enabled, 1)]), isNull(taskCategories.deletedAt)));

    return ok(c, rows);
  })
  .post("/", async (c) => {
    const body = createCategorySchema.parse(await c.req.json());
    const [result] = await db.insert(taskCategories).values({
      userId: getCurrentUserId(c),
      name: body.name,
      color: body.color,
      icon: body.icon,
      dimensionKey: body.dimensionKey,
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
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.dimensionKey !== undefined ? { dimensionKey: body.dimensionKey } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        ...(body.targetMinutes !== undefined ? { targetMinutes: body.targetMinutes } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled ? 1 : 0 } : {}),
        updatedAt: new Date()
      })
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
