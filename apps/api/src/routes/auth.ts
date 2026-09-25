import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getCurrentUserId, hashPassword, signToken, verifyPassword } from "../auth.js";
import { db, type DatabaseClient } from "../db/index.js";
import { taskCategories, userExecutionSlots, users } from "../db/schema.js";
import { BusinessError, ErrorCode } from "../errors.js";
import { ok } from "../http.js";
import { log } from "../logger.js";
import { DEFAULT_TIMEZONE } from "../time.js";
import { seedWritingSlots } from "../writing-slots.js";
import { seedGrowthDimensions } from "../growth.js";

type RegistrationMetadataSeeder = (client: DatabaseClient, userId: number, now: Date) => Promise<void>;

const registerSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().trim().min(1).max(64).optional(),
  password: z.string().min(6).max(100)
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(100)
});

function publicUser(user: { id: number; username: string; displayName: string; timezone: string }) {
  return { id: user.id, username: user.username, displayName: user.displayName, timezone: user.timezone };
}

async function seedDefaultCategories(client: DatabaseClient, userId: number, now: Date) {
  await client.insert(taskCategories).values([
    { userId, name: "工作", color: "#3B82F6", icon: "briefcase", dimensionKey: "career", targetMinutes: 6000, sortOrder: 10, enabled: 1, createdAt: now, updatedAt: now },
    { userId, name: "学习", color: "#8B5CF6", icon: "book-open", dimensionKey: "learning", targetMinutes: 6000, sortOrder: 20, enabled: 1, createdAt: now, updatedAt: now },
    { userId, name: "创作", color: "#EC4899", icon: "pen-tool", dimensionKey: "creative", targetMinutes: 6000, sortOrder: 30, enabled: 1, createdAt: now, updatedAt: now },
    { userId, name: "生活", color: "#10B981", icon: "home", dimensionKey: "life", targetMinutes: 6000, sortOrder: 40, enabled: 1, createdAt: now, updatedAt: now },
    { userId, name: "健康", color: "#EF4444", icon: "heart-pulse", dimensionKey: "body", targetMinutes: 6000, sortOrder: 50, enabled: 1, createdAt: now, updatedAt: now },
    { userId, name: "社交", color: "#F59E0B", icon: "users", dimensionKey: "social", targetMinutes: 6000, sortOrder: 60, enabled: 1, createdAt: now, updatedAt: now },
    { userId, name: "其他", color: "#64748B", icon: "circle", dimensionKey: null, targetMinutes: 6000, sortOrder: 70, enabled: 1, createdAt: now, updatedAt: now }
  ]);
}

export function createAuthRoute(seedRegistrationMetadata?: RegistrationMetadataSeeder) {
  return new Hono()
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
      timezone: DEFAULT_TIMEZONE,
      passwordHash: await hashPassword(body.password),
      createdAt: now,
      updatedAt: now
    };
    const data = await db.transaction(async (tx) => {
      const [result] = await tx.insert(users).values(user);
      const registeredUser = publicUser({ id: result.insertId, username: user.username, displayName: user.displayName, timezone: user.timezone });
      await tx.insert(userExecutionSlots).values({ userId: registeredUser.id, updatedAt: now });
      await seedDefaultCategories(tx, registeredUser.id, now);
      await seedGrowthDimensions(tx, registeredUser.id, now);
      await seedWritingSlots(tx, registeredUser.id, now);
      await seedRegistrationMetadata?.(tx, registeredUser.id, now);
      return registeredUser;
    });

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
}

export const authRoute = createAuthRoute();
