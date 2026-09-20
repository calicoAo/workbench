import assert from "node:assert/strict";
import test, { after } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "mysql://unused:unused@127.0.0.1:3306/unused_test";
process.env.JWT_SECRET = "app-surface-tests-only-secret";

const [{ app }, { signToken }, { pool }] = await Promise.all([
  import("../src/app.js"),
  import("../src/auth.js"),
  import("../src/db/index.js")
]);

const headers = {
  Authorization: `Bearer ${signToken({ id: 1, username: "surface-test", displayName: "Surface Test" })}`
};

after(async () => {
  await pool.end();
});

test("Media Watch application routes are not registered", async () => {
  const getResponse = await app.request("/api/media-watch-records?date=2026-09-18", { headers });
  const postResponse = await app.request("/api/media-watch-records", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ watchDate: "2026-09-18", title: "retired" })
  });

  assert.equal(getResponse.status, 404);
  assert.equal(postResponse.status, 404);
});
