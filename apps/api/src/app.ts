import { cors } from "hono/cors";
import { Hono } from "hono";
import { authMiddleware } from "./auth.js";
import { env } from "./env.js";
import { handleError } from "./http.js";
import { authRoute } from "./routes/auth.js";
import { dashboardRoute } from "./routes/dashboard.js";
import { healthRoute } from "./routes/health.js";
import { journalsRoute } from "./routes/journals.js";
import { mediaWatchRecordsRoute } from "./routes/media-watch-records.js";
import { morningWritingsRoute } from "./routes/morning-writings.js";
import { schedulesRoute } from "./routes/schedules.js";
import { stockReviewsRoute } from "./routes/stock-reviews.js";
import { sleepRecordsRoute } from "./routes/sleep-records.js";
import { taskCategoriesRoute } from "./routes/task-categories.js";
import { tasksRoute } from "./routes/tasks.js";
import { timerSessionsRoute } from "./routes/timer-sessions.js";
import { waterRecordsRoute } from "./routes/water-records.js";

export const app = new Hono();

app.use("*", cors({ origin: env.WEB_ORIGIN }));
app.onError(handleError);
app.use("/api/*", authMiddleware);

app.route("/api/health", healthRoute);
app.route("/api/auth", authRoute);
app.route("/api/dashboard", dashboardRoute);
app.route("/api/journals", journalsRoute);
app.route("/api/media-watch-records", mediaWatchRecordsRoute);
app.route("/api/morning-writings", morningWritingsRoute);
app.route("/api/schedules", schedulesRoute);
app.route("/api/stock-reviews", stockReviewsRoute);
app.route("/api/sleep-records", sleepRecordsRoute);
app.route("/api/task-categories", taskCategoriesRoute);
app.route("/api/tasks", tasksRoute);
app.route("/api/timer-sessions", timerSessionsRoute);
app.route("/api/water-records", waterRecordsRoute);
