import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId } from "../auth.js";
import { createGrowthDimension, growthConfiguration, growthOverview, updateCategoryGrowthMapping, updateGrowthDimension } from "../growth.js";
import { ok } from "../http.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((value) => value.toUpperCase());
const overviewQuery = z.object({ period: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30), to: date.optional() });
const dimensionBody = z.object({ name: z.string().trim().min(1).max(64), iconKey: z.string().trim().max(64).nullable().optional(), color, sortOrder: z.number().int().min(0).max(10000) });
const updateDimensionBody = dimensionBody.partial().extend({ expectedVersion: z.number().int().positive(), enabled: z.boolean().optional() }).refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "at least one change is required");
const mappingBody = z.object({ dimensionKey: z.string().min(1).max(32).nullable() });

export const growthRoute = new Hono()
  .get("/overview", async (c) => { const query = overviewQuery.parse(c.req.query()); return ok(c, await growthOverview(getCurrentUserId(c), query.period, query.to)); })
  .get("/dimensions", async (c) => ok(c, await growthConfiguration(getCurrentUserId(c))))
  .post("/dimensions", async (c) => ok(c, await createGrowthDimension(getCurrentUserId(c), dimensionBody.parse(await c.req.json()))))
  .put("/dimensions/:id", async (c) => ok(c, await updateGrowthDimension(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("id")), updateDimensionBody.parse(await c.req.json()))))
  .put("/category-mappings/:categoryId", async (c) => { const body = mappingBody.parse(await c.req.json()); return ok(c, await updateCategoryGrowthMapping(getCurrentUserId(c), z.coerce.number().int().positive().parse(c.req.param("categoryId")), body.dimensionKey)); });
