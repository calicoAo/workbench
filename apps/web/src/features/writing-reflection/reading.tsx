import { tx } from "../../app/i18n";
import { MarkdownContent } from "../../shared/markdown";
import type { WritingReflectionSnapshot } from ".";

export type ReadingSnapshot = {
  morning: Pick<NonNullable<WritingReflectionSnapshot["morning"]>, "content" | "moodScore"> | null;
  journal: Pick<NonNullable<WritingReflectionSnapshot["journal"]>, "content" | "moodScore"> | null;
  review: Omit<NonNullable<WritingReflectionSnapshot["review"]>, "id" | "reviewDate"> | null;
};

export function WritingReading({ kind, snapshot, hasDraft }: { kind: keyof ReadingSnapshot; snapshot: ReadingSnapshot; hasDraft: boolean }) {
  const simple = kind === "review" ? null : snapshot[kind];
  const review = kind === "review" ? snapshot.review : null;
  const sections = review ? [
    { label: "大盘结论", value: review.marketSummary }, { label: "操作记录", value: review.operations },
    { label: "持仓观察", value: review.holdingsReview }, { label: "做得好的地方", value: review.goodPoints },
    { label: "错误复盘", value: review.mistakes }, { label: "明日计划", value: review.tomorrowPlan }
  ].filter((section) => section.value?.trim()) : [];
  return <div className="writing-reading">
    {simple?.content?.trim() ? <MarkdownContent content={simple.content} /> : sections.length ? sections.map((section) => <section key={section.label}><h3>{tx(section.label)}</h3><MarkdownContent content={section.value!} /></section>) : <p className="text-soft">{tx("这天还没写内容。")}</p>}
    {simple?.moodScore != null ? <p className="text-soft">{tx("状态")} · {simple.moodScore}/5</p> : null}
    {review?.emotionScore != null ? <p className="text-soft">{tx("心情")} · {review.emotionScore}/5</p> : null}
    {review?.disciplineScore != null ? <p className="text-soft">{tx("纪律")} · {review.disciplineScore}/5</p> : null}
    {review?.tags ? <p className="text-soft">{tx("标签")} · {review.tags}</p> : null}
    {hasDraft ? <p className="writing-draft-hint">{tx("有未保存草稿，点击编辑继续。")}</p> : null}
  </div>;
}
