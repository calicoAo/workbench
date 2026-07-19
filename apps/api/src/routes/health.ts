import { Hono } from "hono";
import { ok } from "../http.js";

export const healthRoute = new Hono().get("/", (c) => ok(c, { status: "ok" }));
