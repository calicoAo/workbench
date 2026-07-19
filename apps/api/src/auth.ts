import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Context, MiddlewareHandler } from "hono";
import { env } from "./env.js";
import { BusinessError, ErrorCode } from "./errors.js";

const scryptAsync = promisify(scrypt);
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

type TokenPayload = {
  sub: number;
  username: string;
  displayName: string;
  exp: number;
};

type TokenUser = {
  id: number;
  username: string;
  displayName: string;
};

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", env.JWT_SECRET).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) return false;
  const [algorithm, salt, hash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const candidate = (await scryptAsync(password, Buffer.from(salt, "base64url"), 64)) as Buffer;
  const expected = Buffer.from(hash, "base64url");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function signToken(user: TokenUser) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    } satisfies TokenPayload)
  );
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function verifyToken(token: string) {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const unsigned = `${header}.${payload}`;
  if (!safeEqual(signature, sign(unsigned))) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<TokenPayload>;
    if (!decoded.sub || !decoded.username || !decoded.displayName || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded as TokenPayload;
  } catch {
    return null;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  if (path === "/api/health" || path === "/api/auth/login" || path === "/api/auth/register") {
    await next();
    return;
  }

  const authorization = c.req.header("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    throw new BusinessError(ErrorCode.UNAUTHORIZED, "please login first", 401);
  }

  (c.set as (key: string, value: unknown) => void)("userId", payload.sub);
  (c.set as (key: string, value: unknown) => void)("username", payload.username);
  (c.set as (key: string, value: unknown) => void)("displayName", payload.displayName);
  await next();
};

export function getCurrentUserId(c: Context) {
  const userId = (c.get as (key: string) => unknown)("userId");
  if (typeof userId !== "number") {
    throw new BusinessError(ErrorCode.UNAUTHORIZED, "please login first", 401);
  }
  return userId;
}
