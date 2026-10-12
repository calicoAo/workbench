// @vitest-environment node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("R1C frontend boundaries", () => {
  it("keeps Category CRUD out of Tasks and exposes domain-owned quick editing", () => {
    const tasksRoot = resolve(process.cwd(), "src/features/tasks");
    for (const file of sourceFiles(tasksRoot).filter((name) => !name.endsWith(".test.tsx"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\/api\/task-categories/);
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s*["']\.\.\/(?:categories|growth)\//);
    }
    expect(readFileSync(resolve(process.cwd(), "src/features/categories/index.tsx"), "utf8")).toContain("CategoryQuickManager");
  });

  it("keeps Growth mapping writes Categories-owned without a runtime feature cycle", () => {
    for (const file of sourceFiles(resolve(process.cwd(), "src/features/growth")).filter((name) => !name.includes(".test."))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\/api\/(?:task-categories|growth\/category-mappings)/);
      expect(source, file).not.toMatch(/from\s*["']\.\.\/categories(?:\/|["'])/);
    }
    const editor = readFileSync(resolve(process.cwd(), "src/features/categories/editor.tsx"), "utf8");
    const mapping = readFileSync(resolve(process.cwd(), "src/features/categories/mapping-editor.tsx"), "utf8");
    expect(editor).toContain('from "./mutations"');
    expect(mapping).toContain('from "./mutations"');
    expect(mapping).not.toMatch(/from\s*["']\.\.\/growth\//);
  });

  it("keeps Project CRUD and private editing outside Tasks", () => {
    const source = readFileSync(resolve(process.cwd(), "src/features/tasks/create-task.tsx"), "utf8");
    expect(source).not.toMatch(/\/api\/projects/);
    expect(source).not.toMatch(/from\s*["']\.\.\/projects\//);
    expect(readFileSync(resolve(process.cwd(), "src/features/projects/index.tsx"), "utf8")).toContain("ProjectQuickManager");
  });

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
