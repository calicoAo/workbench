// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs";
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

  it("keeps onboarding as a removable peripheral dependency", () => {
    const apiRoot = resolve(process.cwd(), "../api/src");
    const webRoot = resolve(process.cwd(), "src");
    const files = [...sourceFiles(apiRoot), ...sourceFiles(webRoot)].filter((file) =>
      !file.endsWith("/app.ts") &&
      !file.endsWith("/app/shell/index.tsx") &&
      !file.includes("/features/onboarding/") &&
      !file.endsWith("/onboarding.ts") &&
      !file.endsWith("/routes/onboarding.ts")
    );
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/(?:from|import\()\s*["'][^"']*onboarding/);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx)$/.test(name) ? [path] : [];
  });
}
