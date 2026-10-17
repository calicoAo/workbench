// @vitest-environment jsdom

import { type ComponentProps, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AiInsight,
  type WritingReflectionSnapshot,
  WritingReflectionFeature,
  WritingReflectionHistory,
  WritingReflectionShortcuts,
  useJournalDraftBridge
} from ".";

type FeatureProps = ComponentProps<typeof WritingReflectionFeature>;

afterEach(() => { cleanup(); localStorage.clear(); delete document.body.dataset.duplicate; });

const emptySnapshot: WritingReflectionSnapshot = {
  morning: null,
  journal: null,
  review: null,
  insights: []
};

function snapshot(suffix: string): WritingReflectionSnapshot {
  return {
    morning: { writingDate: "2026-09-18", content: `晨写 ${suffix}`, moodScore: 4 },
    journal: { id: 1, journalDate: "2026-09-18", content: `日记 ${suffix}`, moodScore: 3 },
    review: {
      id: 1,
      reviewDate: "2026-09-18",
      marketSummary: `复盘 ${suffix}`,
      operations: "",
      holdingsReview: "",
      goodPoints: null,
      mistakes: "",
      tomorrowPlan: "",
      emotionScore: 4,
      disciplineScore: 5,
      tags: ""
    },
    insights: []
  };
}

function feature(
  initialSnapshot: WritingReflectionSnapshot,
  options: Partial<FeatureProps> & { children?: ReactNode; key?: string } = {}
) {
  return (
    <WritingReflectionFeature
      key={options.key}
      userId={options.userId}
      request={options.request ?? (vi.fn(async () => ({})) as FeatureProps["request"])}
      selectedDate={options.selectedDate ?? "2026-09-18"}
      initialSnapshot={initialSnapshot}
      onError={options.onError ?? vi.fn()}
      onChanged={options.onChanged ?? vi.fn()}
    >
      {options.children ?? <WritingReflectionHistory loading={false} />}
    </WritingReflectionFeature>
  );
}

function input(label: string) {
  if (!screen.queryByLabelText(label)) {
    const close = screen.queryByRole("button", { name: "关闭" });
    if (close) fireEvent.click(close);
    fireEvent.click(screen.getByRole("button", { name: label === "晨写内容" ? "打开晨写编辑" : label === "日记内容" ? "打开日记编辑" : "打开复盘编辑" }));
  }
  return screen.getByLabelText(label) as HTMLTextAreaElement;
}

function saveForm(label: string) {
  const form = input(label).closest("form");
  if (!form) throw new Error(`Missing form for ${label}`);
  fireEvent.click(within(form).getByRole("button", { name: "保存" }));
}

describe("WritingReflectionFeature draft ownership", () => {
  it("initializes each draft from the selected-date snapshot", () => {
    render(feature(snapshot("A")));

    expect(input("晨写内容").value).toBe("晨写 A");
    expect(input("日记内容").value).toBe("日记 A");
    expect(input("大盘结论").value).toBe("复盘 A");
  });

  it("preserves active drafts when an ordinary remote refresh returns different data", () => {
    const view = render(feature(snapshot("A")));
    fireEvent.change(input("晨写内容"), { target: { value: "晨写 B" } });
    fireEvent.change(input("日记内容"), { target: { value: "日记 B" } });
    fireEvent.change(input("大盘结论"), { target: { value: "复盘 B" } });

    view.rerender(feature(snapshot("C")));

    expect(input("晨写内容").value).toBe("晨写 B");
    expect(input("日记内容").value).toBe("日记 B");
    expect(input("大盘结论").value).toBe("复盘 B");
  });

  it("normalizes and keeps the saved draft after a successful mutation", async () => {
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => ({ journalDate: "2026-09-18", reward: null }));
    const request = requestMock as FeatureProps["request"];
    const onChanged = vi.fn(async () => undefined);
    render(feature(emptySnapshot, { request, onChanged }));
    fireEvent.change(input("日记内容"), { target: { value: "  日记 B  " } });

    saveForm("日记内容");

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(input("日记内容").value).toBe("日记 B");
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body))).toMatchObject({ content: "  日记 B  " });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps the active draft when a save fails", async () => {
    const request = vi.fn(async () => { throw new Error("保存失败"); }) as FeatureProps["request"];
    const onError = vi.fn();
    render(feature(emptySnapshot, { request, onError }));
    fireEvent.change(input("日记内容"), { target: { value: "日记 B" } });

    saveForm("日记内容");

    await waitFor(() => expect(onError).toHaveBeenCalledWith("保存失败", "操作没有成功"));
    expect(input("日记内容").value).toBe("日记 B");
  });

  it("updates the AI result without replacing the analyzed draft", async () => {
    const insight: AiInsight = {
      id: 1,
      sourceType: "journal",
      sourceDate: "2026-09-18",
      summary: "已生成洞察",
      emotionTags: "平静",
      energyScore: 4,
      stressKeywords: null,
      suggestion: null,
      fullText: null
    };
    const requestMock = vi.fn(async (_path: string, _init?: RequestInit) => insight);
    const request = requestMock as FeatureProps["request"];
    render(feature(emptySnapshot, { request, children: <WritingReflectionShortcuts enabledSlots={["JOURNAL"]} /> }));
    fireEvent.click(screen.getByRole("button", { name: "日记" }));
    fireEvent.change(input("日记内容"), { target: { value: "日记 B" } });

    fireEvent.click(screen.getByRole("button", { name: "分析日记内容" }));

    await screen.findByText("已生成洞察");
    expect(input("日记内容").value).toBe("日记 B");
    expect(JSON.parse(String(requestMock.mock.calls[0][1]?.body))).toMatchObject({ content: "日记 B", sourceType: "journal" });
  });

  it("resets from the new snapshot when the selected date changes", () => {
    const view = render(<div>{feature(snapshot("A"), { key: "2026-09-18" })}</div>);
    fireEvent.change(input("日记内容"), { target: { value: "未保存 B" } });

    view.rerender(<div>{feature(snapshot("新日期"), { key: "2026-09-19", selectedDate: "2026-09-19" })}</div>);

    expect(input("日记内容").value).toBe("日记 新日期");
  });

  it("appends a Note reference without replacing unsaved Journal text and detects duplicates", () => {
    function Driver() { const bridge = useJournalDraftBridge(); return <><button onClick={() => bridge.stageJournalReference({ noteId: 44, targetDate: "2026-09-18", text: "Quoted text" })}>quote</button><button onClick={() => { const result = bridge.stageJournalReference({ noteId: 44, targetDate: "2026-09-18", text: "Quoted text" }); document.body.dataset.duplicate = result.status; }}>repeat</button><WritingReflectionHistory loading={false} /></>; }
    render(feature(snapshot("A"), { userId: 9, children: <Driver /> }));
    fireEvent.change(input("日记内容"), { target: { value: "Unsaved text" } }); fireEvent.click(screen.getByRole("button", { name: "quote" }));
    expect(input("日记内容").value).toContain("Unsaved text"); expect(input("日记内容").value).toContain("[来自随手记 #44]\nQuoted text");
    fireEvent.click(screen.getByRole("button", { name: "repeat" })); expect(document.body.dataset.duplicate).toBe("duplicate"); expect(input("日记内容").value.match(/Quoted text/g)).toHaveLength(1);
  });

  it("shows Journal only after opt-in and removes its primary entry after opt-out", () => {
    const view = render(feature(snapshot("A"), { children: <WritingReflectionHistory loading={false} enabledSlots={[]} /> }));
    expect(screen.queryByLabelText("日记内容")).toBeNull();
    view.rerender(feature(snapshot("A"), { children: <WritingReflectionHistory loading={false} enabledSlots={["JOURNAL"]} /> }));
    expect(screen.getByText("日记 A")).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开日记编辑" })).toBeTruthy();
    expect(screen.queryByLabelText("晨写内容")).toBeNull();
    expect(screen.queryByLabelText("大盘结论")).toBeNull();
    view.rerender(feature(snapshot("A"), { children: <WritingReflectionHistory loading={false} enabledSlots={[]} /> }));
    expect(screen.queryByLabelText("日记内容")).toBeNull();
  });

  it("shows no global writing shortcut until a slot is enabled", () => {
    const view = render(feature(emptySnapshot, { children: <WritingReflectionShortcuts /> }));
    expect(screen.queryByRole("button", { name: "晨写" })).toBeNull();
    expect(screen.queryByRole("button", { name: "日记" })).toBeNull();
    expect(screen.queryByRole("button", { name: "复盘" })).toBeNull();

    view.rerender(feature(emptySnapshot, { children: <WritingReflectionShortcuts enabledSlots={["JOURNAL"]} /> }));
    expect(screen.getByRole("button", { name: "日记" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "晨写" })).toBeNull();
    expect(screen.queryByRole("button", { name: "复盘" })).toBeNull();
  });
  it("defaults every writing detail to Markdown reading and only opens fields through Edit", () => {
    const records = snapshot("A");
    records.morning!.content = "# Morning heading\n\n**important**";
    records.journal!.content = "# Journal heading";
    records.review!.marketSummary = "# Review heading";
    records.review!.goodPoints = "**Preserved observation**";
    render(feature(records));
    for (const heading of ["Morning heading", "Journal heading", "Review heading"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByText("Preserved observation").tagName).toBe("STRONG");
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "打开晨写编辑" }));
    expect(input("晨写内容").value).toBe(records.morning!.content);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each(["morning", "journal", "review"] as const)("saves %s Markdown through its existing owner and displays it after acknowledgement", async (kind) => {
    const request = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    render(feature(emptySnapshot, { request: request as FeatureProps["request"] }));
    const label = kind === "morning" ? "晨写内容" : kind === "journal" ? "日记内容" : "大盘结论";
    const source = "## Saved Markdown\n\n> thought\n\n- item";
    fireEvent.change(input(label), { target: { value: source } });
    saveForm(label);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "Saved Markdown" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body[kind === "review" ? "marketSummary" : "content"]).toBe(source);
    expect(request.mock.calls[0][0]).toBe(kind === "morning" ? "/api/morning-writings" : kind === "journal" ? "/api/journals" : "/api/stock-reviews");
  });

  it("keeps unsaved or failed edits separate from the saved reading surface and allows retry", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({});
    const onError = vi.fn();
    render(feature(snapshot("A"), { request: request as FeatureProps["request"], onError }));
    fireEvent.change(input("日记内容"), { target: { value: "# Unsaved" } });
    saveForm("日记内容");
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Offline", "操作没有成功"));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("日记 A")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Unsaved" })).toBeNull();
    expect(input("日记内容").value).toBe("# Unsaved");
    saveForm("日记内容");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "Unsaved" })).toBeTruthy();
  });

  it("supports an explicit archive edit intent once after loading, without reopening on ordinary refresh", () => {
    const children = <WritingReflectionHistory loading={false} onlySlot="JOURNAL" editOnOpen />;
    const view = render(feature(snapshot("A"), { children }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    view.rerender(feature(snapshot("B"), { children }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("日记 B")).toBeTruthy();
  });

  it("keeps the existing goodPoints field editable and preserved when saving other review text", async () => {
    const records = snapshot("A"); records.review!.goodPoints = "**Keep discipline**";
    const request = vi.fn(async (_path: string, _init?: RequestInit) => ({}));
    render(feature(records, { request: request as FeatureProps["request"] }));
    fireEvent.change(input("大盘结论"), { target: { value: "# Changed market" } });
    expect(screen.getByLabelText<HTMLTextAreaElement>("做得好的地方").value).toBe("**Keep discipline**");
    saveForm("大盘结论");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).goodPoints).toBe("**Keep discipline**");
    expect(screen.getByText("Keep discipline").tagName).toBe("STRONG");
  });

});
