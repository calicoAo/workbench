// Public Tasks workflow; isolated transport and receipts, no provider charges or DB writes.
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ApplicationFeedback } from "../../apps/web/src/app/feedback";
import { I18nProvider } from "../../apps/web/src/app/i18n";
import { TaskSplitWorkflow } from "../../apps/web/src/features/tasks/split-workflow";
import "../../apps/web/src/styles.css";

const receipts = new Map<string, number>();
const candidate = (title: string) => ({ candidateId: crypto.randomUUID(), title, description: "", priority: 2, difficulty: 2, categoryId: null, projectId: null, categorySuggestion: null, projectSuggestion: null, dueAtLocal: null, dueEvidence: null, estimatedMinutes: null, durationEvidence: null, suggestedMinutes: null, warnings: [] });
const request = async (path: string, init?: RequestInit): Promise<any> => {
  if (path === "/api/tasks/split/context") return { projects: [], categories: [], selectionRequired: false };
  if (path === "/api/tasks/split/preview") return { status: "SUCCEEDED", result: { candidates: [candidate("整理资料"), candidate("准备考试")], hasMore: false, unprocessedTextSpans: [] } };
  if (path.startsWith("/api/tasks/split/publish-status/")) { const id = receipts.get(path.split("/").at(-1)!); return id ? { status: "committed", taskId: id } : { status: "not_found" }; }
  if (path === "/api/tasks" && init?.method === "POST") {
    const body = JSON.parse(String(init.body));
    const posts = JSON.parse(sessionStorage.getItem("qa.posts") ?? "[]");
    posts.push(body); sessionStorage.setItem("qa.posts", JSON.stringify(posts));
    const id = receipts.get(body.operationId) ?? posts.length;
    receipts.set(body.operationId, id);
    return { id };
  }
  return [];
};
createRoot(document.getElementById("root")!).render(<I18nProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ApplicationFeedback>{feedback => <TaskSplitWorkflow request={request} userId={7} timezone="Asia/Shanghai" initiallyOpen onChanged={() => {}} onError={feedback.notice} />}</ApplicationFeedback></MemoryRouter></QueryClientProvider></I18nProvider>);
