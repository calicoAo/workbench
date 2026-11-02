export type SplitCandidate = {
    candidateId: string;
    title: string;
    description: string;
    priority: number;
    difficulty: number;
    categoryId: number | null;
    projectId: number | null;
    categorySuggestion: string | null;
    projectSuggestion: string | null;
    dueAtLocal: string | null;
    dueEvidence: string | null;
    estimatedMinutes: number | null;
    durationEvidence: string | null;
    suggestedMinutes: number | null;
    warnings: string[];
    selected: boolean;
    publishOperationId?: string;
    frozen?: Record<string, unknown>;
    publishedId?: number;
    publishError?: string;
};
export type SplitDraft = {
    schemaVersion: 1;
    revision: string;
    draftId: string;
    text: string;
    generation?: {
        operationId: string;
        request: Record<string, unknown>;
        status: string;
        applied?: boolean;
    };
    candidates: SplitCandidate[];
    hasMore: boolean;
    unprocessedTextSpans: string[];
};
const prefix = "wb.task-split.v1:";
export function clearTaskSplitDrafts() { for (const key of Object.keys(localStorage))
    if (key.startsWith(prefix))
        localStorage.removeItem(key); }
export const newSplitDraft = (): SplitDraft => ({ schemaVersion: 1, revision: crypto.randomUUID(), draftId: crypto.randomUUID(), text: "", candidates: [], hasMore: false, unprocessedTextSpans: [] });
export function readSplitDraft(userId: number): SplitDraft {
    const raw = localStorage.getItem(prefix + userId);
    if (!raw)
        return newSplitDraft();
    const value = JSON.parse(raw);
    if (value.schemaVersion !== 1 || typeof value.revision !== "string" || typeof value.text !== "string" || !Array.isArray(value.candidates))
        throw Error("Saved draft needs recovery; copy its content before clearing");
    return value;
}
export function writeSplitDraft(userId: number, draft: SplitDraft, expectedRevision: string | null) {
    const key = prefix + userId, raw = localStorage.getItem(key);
    if (raw && JSON.parse(raw).revision !== expectedRevision || !raw && expectedRevision)
        throw Error("Draft changed in another tab; copy current text and reload");
    const next = { ...draft, revision: crypto.randomUUID() };
    localStorage.setItem(key, JSON.stringify(next));
    return next;
}
export function splitDraftExists(userId: number) { return localStorage.getItem(prefix + userId) !== null; }
