import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const reporter = fileURLToPath(new URL("./require-all-tests.mjs", import.meta.url));
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;

for (const [name, body, succeeds] of [
  ["passing test", 'test("pass", () => {});', true],
  ["static skip", 'test("skip", { skip: true }, () => {});', false],
  ["runtime skip", 'test("skip", t => t.skip());', false],
  ["skipped nested test", 'test("parent", async t => { await t.test("child", { skip: true }, () => {}); });', false],
  ["TODO", 'test("todo", { todo: true }, () => {});', false],
  ["failed test", 'test("fail", () => { throw new Error("failure"); });', false]
]) {
  test(`strict workflow reporter: ${name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "workbench-ci-gate-"));
    try {
      const fixture = join(dir, "fixture.test.mjs");
      writeFileSync(fixture, `import test from "node:test";\n${body}\n`);
      const result = spawnSync(process.execPath, ["--test", `--test-reporter=${reporter}`, fixture], {
        env: childEnv,
        encoding: "utf8",
        timeout: 10000
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      assert.equal(result.status === 0, succeeds, result.stdout + result.stderr);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
