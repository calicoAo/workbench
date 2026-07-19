import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";
import { log } from "./logger.js";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port }, "[api_started]");
});
