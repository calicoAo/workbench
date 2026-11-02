// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearTaskSplitDrafts, newSplitDraft, readSplitDraft, writeSplitDraft } from "./split-draft";
beforeEach(() => localStorage.clear());
describe("Tasks split persisted command draft", () => {
    it("restores edits and frozen publication identity without changing the payload", () => { const draft = newSplitDraft(); draft.text = "Private task text"; draft.candidates = [{ candidateId: "candidate", title: "Review", description: "", priority: 3, difficulty: 2, categoryId: null, projectId: null, categorySuggestion: null, projectSuggestion: null, dueAtLocal: null, dueEvidence: null, estimatedMinutes: 30, durationEvidence: "30分钟", suggestedMinutes: 40, warnings: [], selected: true, publishOperationId: "stable-operation", frozen: { operationId: "stable-operation", recordTimezone: "Asia/Shanghai", title: "Review" } }]; const saved = writeSplitDraft(7, draft, null); expect(readSplitDraft(7)).toEqual(saved); expect(readSplitDraft(8).text).toBe(""); });
    it("rejects stale-tab writes and preserves the last acknowledged edit", () => { const a = writeSplitDraft(7, newSplitDraft(), null); const b = writeSplitDraft(7, { ...a, text: "new edit" }, a.revision); expect(() => writeSplitDraft(7, { ...a, text: "stale" }, a.revision)).toThrow(); expect(readSplitDraft(7)).toEqual(b); });
    it("does not overwrite unsupported saved drafts", () => { localStorage.setItem("wb.task-split.v1:7", '{"schemaVersion":99}'); expect(() => readSplitDraft(7)).toThrow(); expect(localStorage.getItem("wb.task-split.v1:7")).toBe('{"schemaVersion":99}'); });
    it("explicit session cleanup removes task drafts and leaves unrelated data", () => { writeSplitDraft(7, newSplitDraft(), null); localStorage.setItem("other", "keep"); clearTaskSplitDrafts(); expect(localStorage.getItem("wb.task-split.v1:7")).toBeNull(); expect(localStorage.getItem("other")).toBe("keep"); });
});
