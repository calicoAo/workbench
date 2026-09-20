import { describe, expect, it } from "vitest";
import { mapTimeline } from ".";

describe("Timeline read integration", () => {
  it("keeps planned, timer, manual, and legacy facts distinguishable without projections", () => {
    const result = mapTimeline(
      [
        { id: 1, taskId: 3, kind: 0, title: "Plan", scheduleDate: "2026-09-19", startTime: "09:00:00", endTime: "10:00:00" },
        { id: 2, taskId: 3, kind: 1, title: "Timer projection", scheduleDate: "2026-09-19", startTime: "09:00:00", endTime: "09:30:00" }
      ],
      [
        { source: "TIMER_SEGMENT", sourceId: 7, taskId: 3, startedAt: "2026-09-19T01:00:00Z", endedAt: "2026-09-19T01:30:00Z", durationSeconds: 1800, businessDate: "2026-09-19", recordTimezone: "Asia/Shanghai" },
        { source: "MANUAL_ACTUAL", sourceId: 8, taskId: null, startedAt: "2026-09-19T02:00:00Z", endedAt: "2026-09-19T02:20:00Z", durationSeconds: 1200, businessDate: "2026-09-19", recordTimezone: "Asia/Shanghai" },
        { source: "LEGACY_ACTUAL", sourceId: 9, taskId: null, startedAt: "2026-09-19T03:00:00Z", endedAt: "2026-09-19T03:10:00Z", durationSeconds: 600, businessDate: "2026-09-19", recordTimezone: "Asia/Shanghai" }
      ],
      "2026-09-19"
    );
    expect(result.map((item) => item.kind).sort()).toEqual(["LEGACY_ACTUAL", "MANUAL_ACTUAL", "PLANNED", "TIMER_ACTUAL"].sort());
    expect(result.filter((item) => item.kind === "TIMER_ACTUAL")).toHaveLength(1);
  });
});
