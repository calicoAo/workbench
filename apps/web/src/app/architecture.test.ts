// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("R1C frontend boundaries", () => {
  it("does not import API implementation source into Web", () => {
    const files = ["src/App.tsx", "src/app/shell/index.tsx", "src/features/timer/index.tsx", "src/features/tasks/integration.tsx", "src/features/timeline/index.ts"];
    for (const file of files) expect(readFileSync(resolve(process.cwd(), file), "utf8")).not.toMatch(/apps\/api|\.\.\/\.\.\/\.\.\/api\/src/);
  });

  it("keeps current-session ownership in the timer public surface", () => {
    const shell = readFileSync(resolve(process.cwd(), "src/app/shell/index.tsx"), "utf8");
    const timer = readFileSync(resolve(process.cwd(), "src/features/timer/index.tsx"), "utf8");
    expect(shell.match(/useCurrentSession\(/g)).toHaveLength(1);
    expect(timer).toContain("queryKeys.currentSession(userId)");
    expect(shell).not.toContain("activeTimer");
    expect(timer).toContain("export function CurrentFocusCard");
    expect(shell).not.toContain("function CurrentFocus(");
    expect(shell).toContain('location.pathname !== "/today"');
  });
});
