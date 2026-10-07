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
        { source: "TIMER_SEGMENT", sourceId: 7, taskId: 3, title: "Task", note: "first pass", startedAt: "2026-09-19T01:00:00Z", endedAt: "2026-09-19T01:30:00Z", durationSeconds: 1800, businessDate: "2026-09-19", recordTimezone: "Asia/Shanghai", timerSessionId: 11, sessionNote: "first pass", sessionStartedAt: "2026-09-19T01:00:00Z", sessionEndedAt: "2026-09-19T01:30:00Z", sessionDurationSeconds: 1800, isTerminalSlice: true },
        { source: "MANUAL_ACTUAL", sourceId: 8, taskId: null, title: "Manual", note: null, startedAt: "2026-09-19T02:00:00Z", endedAt: "2026-09-19T02:20:00Z", durationSeconds: 1200, businessDate: "2026-09-19", recordTimezone: "Asia/Shanghai", timerSessionId: null, sessionNote: null, sessionStartedAt: null, sessionEndedAt: null, sessionDurationSeconds: null, isTerminalSlice: false },
        { source: "LEGACY_ACTUAL", sourceId: 9, taskId: null, title: "Legacy", note: null, startedAt: "2026-09-19T03:00:00Z", endedAt: "2026-09-19T03:10:00Z", durationSeconds: 600, businessDate: "2026-09-19", recordTimezone: "Asia/Shanghai", timerSessionId: null, sessionNote: null, sessionStartedAt: null, sessionEndedAt: null, sessionDurationSeconds: null, isTerminalSlice: false }
      ],
      "2026-09-19"
    );
    expect(result.map((item) => item.kind).sort()).toEqual(["LEGACY_ACTUAL", "MANUAL_ACTUAL", "PLANNED", "TIMER_ACTUAL"].sort());
    expect(result.filter((item) => item.kind === "TIMER_ACTUAL")).toHaveLength(1);
    expect(result.find((item) => item.kind === "TIMER_ACTUAL")?.note).toBe("first pass");
    expect(result.find((item) => item.kind === "TIMER_ACTUAL")?.hasNote).toBe(true);
    expect(result.find((item) => item.kind === "TIMER_ACTUAL")?.title).toBe("Task");
  });

  it("keeps a cross-midnight session note on the terminal slice only", () => {
    const result = mapTimeline([], [
      { source: "TIMER_SEGMENT", sourceId: 21, taskId: 3, title: "Cross-day", note: "scene remains", startedAt: "2026-10-06T15:55:00Z", endedAt: "2026-10-06T16:00:00Z", durationSeconds: 300, businessDate: "2026-10-06", recordTimezone: "Asia/Shanghai", timerSessionId: 12, sessionNote: "scene remains", sessionStartedAt: "2026-10-06T15:55:00Z", sessionEndedAt: "2026-10-06T16:15:00Z", sessionDurationSeconds: 1200, isTerminalSlice: false },
      { source: "TIMER_SEGMENT", sourceId: 22, taskId: 3, title: "Cross-day", note: "scene remains", startedAt: "2026-10-06T16:00:00Z", endedAt: "2026-10-06T16:15:00Z", durationSeconds: 900, businessDate: "2026-10-07", recordTimezone: "Asia/Shanghai", timerSessionId: 12, sessionNote: "scene remains", sessionStartedAt: "2026-10-06T15:55:00Z", sessionEndedAt: "2026-10-06T16:15:00Z", sessionDurationSeconds: 1200, isTerminalSlice: true }
    ], "2026-10-07");
    expect(result.filter((item) => item.kind === "TIMER_ACTUAL" && item.note).map((item) => item.note)).toEqual(["scene remains"]);
  });
});
