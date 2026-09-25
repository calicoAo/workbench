// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { createWritingPlugins, readWritingTab, rememberWritingTab, WritingShell } from ".";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("Writing Shell peer navigation", () => {
  it("keeps all enabled writing domains at one level and hides disabled slots", () => {
    const plugins = createWritingPlugins("2026-09-25", ["JOURNAL"]);
    expect(plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.label)).toEqual(["日记", "随手记", "灵感库", "归档"]);
    expect(plugins.find((plugin) => plugin.id === "morning")?.enabled).toBe(false);
    expect(plugins.find((plugin) => plugin.id === "review")?.enabled).toBe(false);
  });

  it("renders peer tabs with date-aware routes", () => {
    render(<MemoryRouter><WritingShell userId={7} date="2026-09-25" activeId="journal" enabledSlots={["MORNING_WRITING", "JOURNAL", "STOCK_REVIEW"]}><p>content owner</p></WritingShell></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "晨写" }).getAttribute("href")).toBe("/journal?date=2026-09-25&tab=morning");
    expect(screen.getByRole("tab", { name: "随手记" }).getAttribute("href")).toBe("/notes?date=2026-09-25");
    expect(screen.getByText("content owner")).toBeTruthy();
  });

  it("remembers the last tab per user and ignores a disabled remembered tab", () => {
    rememberWritingTab(7, "morning");
    expect(readWritingTab(7, ["morning", "journal"])).toBe("morning");
    expect(readWritingTab(7, ["journal"])).toBeNull();
  });
});
