import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId, hashPassword, signToken, verifyPassword } from "../auth.js";
import { db } from "../db/index.js";
import { taskCategories, users } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";

const registerSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().trim().min(1).max(64).optional(),
  password: z.string().min(6).max(100)
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(100)
});

function publicUser(user: { id: number; username: string; displayName: string }) {
  return { id: user.id, username: user.username, displayName: user.displayName };
}

async function seedDefaultCategories(userId: number, now: Date) {
  await db.insert(taskCategories).values([
    { userId, name: "coding", color: "#5B8DEF", icon: "code", targetMinutes: 6000, sortOrder: 10, enabled: 1, createdAt: now, updatedAt: now },
    { userId, name: "Life", color: "#FF8FA3", icon: "sparkles", targetMinutes: 6000, sortOrder: 20, enabled: 1, createdAt: now, updatedAt: now },
    { userId, name: "Stock Review", color: "#EA6FA3", icon: "trending-up", targetMinutes: 6000, sortOrder: 30, enabled: 1, createdAt: now, updatedAt: now }
  ]);
}

export const authRoute = new Hono()
  .post("/register", async (c) => {
    const body = registerSchema.parse(await c.req.json());
    const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.username, body.username), isNull(users.deletedAt)));
    if (existing) {
      throw new BusinessError(ErrorCode.CONFLICT, "username already exists", 409);
    }

    const now = new Date();
    const user = {
      username: body.username,
      displayName: body.displayName || body.username,
      passwordHash: await hashPassword(body.password),
      createdAt: now,
      updatedAt: now
    };
    const [result] = await db.insert(users).values(user);
    const data = publicUser({ id: result.insertId, username: user.username, displayName: user.displayName });
    await seedDefaultCategories(data.id, now);

    log.info({ userId: data.id, username: data.username }, "[user_registered]");
    return ok(c, { token: signToken(data), user: data });
  })
  .post("/login", async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const [user] = await db.select().from(users).where(and(eq(users.username, body.username), isNull(users.deletedAt)));
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new BusinessError(ErrorCode.UNAUTHORIZED, "invalid username or password", 401);
    }

    const data = publicUser(user);
    log.info({ userId: data.id, username: data.username }, "[user_logged_in]");
    return ok(c, { token: signToken(data), user: data });
  })
  .get("/me", async (c) => {
    const userId = getCurrentUserId(c);
    const [user] = await db.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) {
      throw new BusinessError(ErrorCode.UNAUTHORIZED, "please login first", 401);
    }
    return ok(c, publicUser(user));
  });
