// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationFeedback } from "../../app/feedback";
import type { Request } from "../../app/api";
import { TaskSplitWorkflow } from "./split-workflow";
import { newSplitDraft, readSplitDraft, writeSplitDraft, type SplitCandidate } from "./split-draft";

const candidate = (title: string): SplitCandidate => ({ candidateId: crypto.randomUUID(), title, description: "", priority: 2, difficulty: 2, categoryId: null, projectId: null, categorySuggestion: null, projectSuggestion: null, dueAtLocal: null, dueEvidence: null, estimatedMinutes: null, durationEvidence: null, suggestedMinutes: null, warnings: [], selected: true });
beforeEach(() => { localStorage.clear(); vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(options: { failTitle?: string; lostTitle?: string } = {}) {
    const receipts = new Map<string, number>(), posts: Record<string, any>[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
        if (path === "/api/tasks/split/context") return { projects: [], categories: [], selectionRequired: false };
        if (path === "/api/tasks/split/preview") return { status: "SUCCEEDED", result: { candidates: [candidate("整理材料"), candidate("明天准备考试")], hasMore: false, unprocessedTextSpans: [] } };
        if (path.startsWith("/api/tasks/split/publish-status/")) { const id = receipts.get(path.split("/").at(-1)!); return id ? { status: "committed", taskId: id } : { status: "not_found" }; }
        if (path === "/api/tasks" && init?.method === "POST") {
            const body = JSON.parse(String(init.body)); posts.push(body);
            if (body.title === options.failTitle) throw Error("service unavailable");
            const id = receipts.get(body.operationId) ?? 100 + posts.length;
            receipts.set(body.operationId, id);
            if (body.title === options.lostTitle) throw Error("acknowledgement lost");
            return { id };
        }
        return [];
    }) as unknown as Request;
    const changed = vi.fn();
    const view = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ApplicationFeedback>{feedback => <TaskSplitWorkflow request={request} userId={7} timezone="Asia/Shanghai" onError={feedback.notice} onChanged={changed} initiallyOpen />}</ApplicationFeedback></MemoryRouter></QueryClientProvider>);
    return { view, posts, receipts, changed };
}
const publish = () => fireEvent.click(screen.getByRole("button", { name: "确认发布所选 / 重试待定项" }));
describe("AI split publication lifecycle", () => {
    it("defaults explicit today batches to acceptance, allows opting out, and clears a fully published draft", async () => {
        const { posts, changed } = setup();
        fireEvent.change(screen.getByLabelText("待整理文本"), { target: { value: "今天的任务：整理材料、明天准备考试" } });
        const generate = screen.getByRole("button", { name: "生成可审核草稿" });
        await waitFor(() => expect(generate.hasAttribute("disabled")).toBe(false));
        fireEvent.click(generate);
        const toggles = await screen.findAllByLabelText("发布时同时接取");
        expect((toggles[0] as HTMLInputElement).checked).toBe(true);
        expect((toggles[1] as HTMLInputElement).checked).toBe(false);
        fireEvent.click(toggles[0]);
        expect(readSplitDraft(7).candidates[0].acceptDate).toBeNull();
        fireEvent.click(toggles[0]);
        const acceptedDate = readSplitDraft(7).candidates[0].acceptDate;
        publish();
        await waitFor(() => expect(changed).toHaveBeenCalled());
        expect(posts[0].acceptDate).toBe(acceptedDate);
        expect(posts[1].acceptDate).toBeUndefined();
        expect(localStorage.getItem("wb.task-split.v1:7")).toBeNull();
        expect(screen.queryByLabelText("标题")).toBeNull();
        expect((screen.getByLabelText("待整理文本") as HTMLTextAreaElement).value).toBe("");
        expect(screen.getByRole("link", { name: "整理材料" })).toBeTruthy();
    });
    it("retains only failed and unchecked drafts and resolves a lost acknowledgement without another POST", async () => {
        const draft = newSplitDraft();
        draft.text = "今天的任务：三条";
        draft.generation = { operationId: "generation", request: {}, status: "SUCCEEDED", applied: true };
        draft.candidates = [candidate("success"), { ...candidate("lost"), acceptDate: "2026-11-16" }, { ...candidate("unchecked"), selected: false }];
        writeSplitDraft(7, draft, null);
        const { posts, changed } = setup({ lostTitle: "lost" });
        publish(); await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
        const remaining = readSplitDraft(7).candidates;
        expect(remaining.map(c => c.title)).toEqual(["lost", "unchecked"]);
        const frozen = remaining[0].frozen;
        expect(frozen?.acceptDate).toBe("2026-11-16");
        publish(); await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
        expect(posts).toHaveLength(2);
        expect(readSplitDraft(7).candidates.map(c => c.title)).toEqual(["unchecked"]);
    });
    it("removes legacy acknowledged candidates on reopening without deleting unfinished work", () => {
        const draft = newSplitDraft(); draft.text = "remaining";
        draft.candidates = [{ ...candidate("old success"), publishedId: 123 }, candidate("remaining")];
        writeSplitDraft(7, draft, null); setup();
        expect(readSplitDraft(7).candidates.map(c => c.title)).toEqual(["remaining"]);
    });
    it("clears a legacy draft that contains only acknowledged successes", () => {
        const draft = newSplitDraft(); draft.text = "already published";
        draft.candidates = [{ ...candidate("old success"), publishedId: 123 }];
        writeSplitDraft(7, draft, null); setup();
        expect(localStorage.getItem("wb.task-split.v1:7")).toBeNull();
        expect((screen.getByLabelText("待整理文本") as HTMLTextAreaElement).value).toBe("");
    });
    it("keeps an uncertain generation identity while removing old acknowledged candidates", () => {
        const draft = newSplitDraft(); draft.text = "new input";
        draft.generation = { operationId: "pending-generation", request: {}, status: "UNKNOWN" };
        draft.candidates = [{ ...candidate("old success"), publishedId: 123 }];
        writeSplitDraft(7, draft, null); setup();
        expect(readSplitDraft(7)).toMatchObject({ text: "new input", candidates: [], generation: { operationId: "pending-generation", status: "UNKNOWN" } });
    });
    it("keeps unprocessed input after publishing all generated candidates", async () => {
        const draft = newSplitDraft(); draft.text = "over twenty tasks"; draft.hasMore = true; draft.unprocessedTextSpans = ["remaining text"]; draft.candidates = [candidate("success")];
        writeSplitDraft(7, draft, null); const { changed } = setup(); publish();
        await waitFor(() => expect(changed).toHaveBeenCalled());
        expect(readSplitDraft(7)).toMatchObject({ text: draft.text, candidates: [], hasMore: true, unprocessedTextSpans: ["remaining text"] });
    });
});
