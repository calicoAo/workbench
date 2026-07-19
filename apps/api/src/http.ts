import type { Context } from "hono";
import { ZodError } from "zod";
import { BusinessError, ErrorCode } from "./errors.js";
import { log } from "./logger.js";

export function ok<T>(c: Context, data: T) {
  return c.json({ code: ErrorCode.SUCCESS, message: "ok", data });
}

export function handleError(error: unknown, c: Context) {
  if (error instanceof BusinessError) {
    log.warn({ path: c.req.path, code: error.code }, "[business_error]");
    return c.json({ code: error.code, message: error.message, data: null }, error.status);
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
    log.warn({ path: c.req.path, message }, "[validation_failed]");
    return c.json({ code: ErrorCode.PARAM_ERROR, message, data: null }, 400);
  }

  log.error({ path: c.req.path, error }, "[unhandled_error]");
  return c.json({ code: ErrorCode.SERVER_ERROR, message: "server error", data: null }, 500);
}
