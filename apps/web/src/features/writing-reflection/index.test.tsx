// @vitest-environment jsdom

import { type ComponentProps, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AiInsight,
  type WritingReflectionSnapshot,
  WritingReflectionFeature,
  WritingReflectionHistory,
  WritingReflectionShortcuts
} from ".";

type FeatureProps = ComponentProps<typeof WritingReflectionFeature>;

afterEach(cleanup);

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
    render(feature(emptySnapshot, { request, children: <WritingReflectionShortcuts /> }));
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
});
