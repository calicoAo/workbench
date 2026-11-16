// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearTaskSplitDrafts, newSplitDraft, readSplitDraft, removeSplitDraft, todaySplitAcceptDate, writeSplitDraft } from "./split-draft";
beforeEach(() => localStorage.clear());
describe("Tasks split persisted command draft", () => {
    it("recognizes explicit today batch headings in the user timezone without inferring deadlines", () => {
        const now = new Date("2026-11-16T17:00:00Z");
        for (const text of ["今天的任务：整理材料、准备考试", "今天的任务是整理材料", "我今日待办如下：整理材料", "今天的任务是为明天考试整理材料", "今天的任务是修复网络不通的问题"]) {
            expect(todaySplitAcceptDate(text, "Asia/Shanghai", now)).toBe("2026-11-17");
            expect(todaySplitAcceptDate(text, "America/Los_Angeles", now)).toBe("2026-11-16");
        }
        for (const text of ["明天的任务：整理材料", "如果今天的任务是整理材料", "整理今天的任务记录", "今天不做任务", "任务今天截止", "今天的任务不是整理材料"]) expect(todaySplitAcceptDate(text, "Asia/Shanghai", now)).toBeNull();
    });
    it("clears only the acknowledged draft revision", () => {
        const a = writeSplitDraft(7, newSplitDraft(), null);
        const b = writeSplitDraft(7, { ...a, text: "new edit" }, a.revision);
        expect(() => removeSplitDraft(7, a.revision)).toThrow();
        expect(readSplitDraft(7).text).toBe("new edit");
        removeSplitDraft(7, b.revision);
        expect(localStorage.getItem("wb.task-split.v1:7")).toBeNull();
    });
    it("restores edits and frozen publication identity without changing the payload", () => { const draft = newSplitDraft(); draft.text = "Private task text"; draft.candidates = [{ candidateId: "candidate", title: "Review", description: "", priority: 3, difficulty: 2, categoryId: null, projectId: null, categorySuggestion: null, projectSuggestion: null, dueAtLocal: null, dueEvidence: null, estimatedMinutes: 30, durationEvidence: "30分钟", suggestedMinutes: 40, warnings: [], selected: true, publishOperationId: "stable-operation", frozen: { operationId: "stable-operation", recordTimezone: "Asia/Shanghai", title: "Review" } }]; const saved = writeSplitDraft(7, draft, null); expect(readSplitDraft(7)).toEqual(saved); expect(readSplitDraft(8).text).toBe(""); });
    it("rejects stale-tab writes and preserves the last acknowledged edit", () => { const a = writeSplitDraft(7, newSplitDraft(), null); const b = writeSplitDraft(7, { ...a, text: "new edit" }, a.revision); expect(() => writeSplitDraft(7, { ...a, text: "stale" }, a.revision)).toThrow(); expect(readSplitDraft(7)).toEqual(b); });
    it("does not overwrite unsupported saved drafts", () => { localStorage.setItem("wb.task-split.v1:7", '{"schemaVersion":99}'); expect(() => readSplitDraft(7)).toThrow(); expect(localStorage.getItem("wb.task-split.v1:7")).toBe('{"schemaVersion":99}'); });
    it("explicit session cleanup removes task drafts and leaves unrelated data", () => { writeSplitDraft(7, newSplitDraft(), null); localStorage.setItem("other", "keep"); clearTaskSplitDrafts(); expect(localStorage.getItem("wb.task-split.v1:7")).toBeNull(); expect(localStorage.getItem("other")).toBe("keep"); });
});
