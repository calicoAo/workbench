import { createContext, type FormEvent, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpenText, CheckCircle2, Pencil, Sparkles, SunMedium, TrendingUp, X } from "lucide-react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type WritingKind = "morning" | "journal" | "review";
type InsightKind = Exclude<WritingKind, "review">;

export type JournalRecord = { id: number; journalDate: string; content: string | null; moodScore: number | null };
export type MorningWritingRecord = { id?: number; writingDate: string; content: string | null; moodScore: number | null };
export type StockReviewRecord = {
  id: number;
  reviewDate: string;
  marketSummary: string | null;
  operations: string | null;
  holdingsReview: string | null;
  goodPoints: string | null;
  mistakes: string | null;
  tomorrowPlan: string | null;
  emotionScore: number | null;
  disciplineScore: number | null;
  tags: string | null;
};
export type AiInsight = {
  id: number;
  sourceType: InsightKind;
  sourceDate: string;
  summary: string | null;
  emotionTags: string | null;
  energyScore: number | null;
  stressKeywords: string | null;
  suggestion: string | null;
  fullText: string | null;
};
export type WritingReflectionSnapshot = {
  morning: MorningWritingRecord | null;
  journal: JournalRecord | null;
  review: StockReviewRecord | null;
  insights: AiInsight[];
};

type SimpleDraft = { content: string; moodScore: string };
type ReviewDraft = {
  marketSummary: string;
  operations: string;
  holdingsReview: string;
  mistakes: string;
  tomorrowPlan: string;
  emotionScore: string;
  disciplineScore: string;
  tags: string;
};
type ContextValue = {
  selectedDate: string;
  disabled: boolean;
  modal: WritingKind | null;
  setModal: (kind: WritingKind | null) => void;
  morning: SimpleDraft;
  setMorning: (draft: SimpleDraft) => void;
  journal: SimpleDraft;
  setJournal: (draft: SimpleDraft) => void;
  review: ReviewDraft;
  setReview: (draft: ReviewDraft) => void;
  completed: Record<WritingKind, boolean>;
  insights: Partial<Record<InsightKind, AiInsight>>;
  aiLoading: InsightKind | null;
  saveMorning: (event: FormEvent) => Promise<void>;
  saveJournal: (event: FormEvent) => Promise<void>;
  saveReview: (event: FormEvent) => Promise<void>;
  analyze: (kind: InsightKind) => Promise<void>;
};

const WritingReflectionContext = createContext<ContextValue | null>(null);

const MORNING_STATE_OPTIONS = [
  { value: "5", label: "稳定有余力，可以主动推进" },
  { value: "4", label: "状态不错，先做最重要的一件事" },
  { value: "3", label: "普通水平，降低阻力开始" },
  { value: "2", label: "有点乱，先完成一个小动作" },
  { value: "1", label: "能量很低，只照顾基本节奏" }
] as const;

const JOURNAL_STATE_OPTIONS = [
  { value: "5", label: "放松满足，今天值得收好" },
  { value: "4", label: "整体平稳，给自己一个肯定" },
  { value: "3", label: "有些起伏，先把感受写清楚" },
  { value: "2", label: "压力偏高，允许自己慢下来" },
  { value: "1", label: "很累很难，先恢复和休息" }
] as const;

export function WritingReflectionFeature({
  children,
  request,
  selectedDate,
  initialSnapshot,
  disabled = false,
  onError,
  onChanged
}: {
  children: ReactNode;
  request: Request;
  selectedDate: string;
  initialSnapshot: WritingReflectionSnapshot;
  disabled?: boolean;
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [modal, setModal] = useState<WritingKind | null>(null);
  const [morning, setMorning] = useState<SimpleDraft>(() => simpleDraft(initialSnapshot.morning));
  const [journal, setJournal] = useState<SimpleDraft>(() => simpleDraft(initialSnapshot.journal));
  const [review, setReview] = useState<ReviewDraft>(() => reviewDraft(initialSnapshot.review));
  const [completed, setCompleted] = useState<Record<WritingKind, boolean>>(() => ({
    morning: hasText(initialSnapshot.morning?.content),
    journal: hasText(initialSnapshot.journal?.content),
    review: hasReviewContent(initialSnapshot.review)
  }));
  const [insights, setInsights] = useState<Partial<Record<InsightKind, AiInsight>>>(() => ({
    morning: initialSnapshot.insights.find((item) => item.sourceType === "morning"),
    journal: initialSnapshot.insights.find((item) => item.sourceType === "journal")
  }));
  const [aiLoading, setAiLoading] = useState<InsightKind | null>(null);

  async function saveMorning(event: FormEvent) {
    event.preventDefault();
    const next = normalizeSimpleDraft(morning);
    try {
      await request("/api/morning-writings", {
        method: "POST",
        body: JSON.stringify({ writingDate: selectedDate, content: morning.content, moodScore: Number(morning.moodScore) })
      });
      setMorning(next);
      setCompleted((current) => ({ ...current, morning: hasText(next.content) }));
      setModal(null);
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  async function saveJournal(event: FormEvent) {
    event.preventDefault();
    const next = normalizeSimpleDraft(journal);
    try {
      await request("/api/journals", {
        method: "POST",
        body: JSON.stringify({ journalDate: selectedDate, content: journal.content, moodScore: Number(journal.moodScore) })
      });
      setJournal(next);
      setCompleted((current) => ({ ...current, journal: hasText(next.content) }));
      setModal(null);
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    const next = normalizeReviewDraft(review);
    try {
      await request("/api/stock-reviews", {
        method: "POST",
        body: JSON.stringify({ reviewDate: selectedDate, ...review, emotionScore: Number(review.emotionScore), disciplineScore: Number(review.disciplineScore) })
      });
      setReview(next);
      setCompleted((current) => ({ ...current, review: hasReviewDraftContent(next) }));
      setModal(null);
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  async function analyze(kind: InsightKind) {
    const content = kind === "morning" ? morning.content : journal.content;
    if (!content.trim()) {
      onError(kind === "morning" ? "先写一点晨写内容，再分析。" : "先写一点日记内容，再分析。");
      return;
    }
    setAiLoading(kind);
    try {
      const insight = await request<AiInsight>("/api/ai-insights/analyze", {
        method: "POST",
        body: JSON.stringify({ sourceType: kind, sourceDate: selectedDate, content })
      });
      setInsights((current) => ({ ...current, [kind]: insight }));
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    } finally {
      setAiLoading(null);
    }
  }

  const value: ContextValue = {
    selectedDate,
    disabled,
    modal,
    setModal,
    morning,
    setMorning,
    journal,
    setJournal,
    review,
    setReview,
    completed,
    insights,
    aiLoading,
    saveMorning,
    saveJournal,
    saveReview,
    analyze
  };

  return (
    <WritingReflectionContext.Provider value={value}>
      {children}
      <WritingDialogs />
    </WritingReflectionContext.Provider>
  );
}

export function WritingReflectionShortcuts() {
  const feature = useWritingReflection();
  const hasPending = !feature.completed.morning || !feature.completed.journal || !feature.completed.review;
  return (
    <div className="writing-shortcut-wrap">
      {hasPending && <span className="writing-nudge">点我记录</span>}
      <WritingShortcut label="晨写" done={feature.completed.morning} disabled={feature.disabled} onClick={() => feature.setModal("morning")} />
      <WritingShortcut label="复盘" done={feature.completed.review} disabled={feature.disabled} onClick={() => feature.setModal("review")} />
      <WritingShortcut label="日记" done={feature.completed.journal} disabled={feature.disabled} onClick={() => feature.setModal("journal")} />
    </div>
  );
}

export function WritingReflectionHistory({ loading }: { loading: boolean }) {
  const feature = useWritingReflection();
  return (
    <>
      <FeaturePanel
        title={`晨写 · ${formatDayLabel(feature.selectedDate)}`}
        icon={<SunMedium size={17} />}
        action={<ExpandButton label="打开晨写编辑" disabled={feature.disabled} onClick={() => feature.setModal("morning")} />}
      >
        <form className="space-y-2" onSubmit={feature.saveMorning}>
          <MorningFields compact />
        </form>
      </FeaturePanel>

      <FeaturePanel
        title={`睡前日记 · ${formatDayLabel(feature.selectedDate)}`}
        icon={<BookOpenText size={17} />}
        action={<ExpandButton label="打开日记编辑" disabled={feature.disabled} onClick={() => feature.setModal("journal")} />}
      >
        <p className="mb-2 text-[11px] text-soft">{loading || feature.disabled ? "加载中..." : "可随时回看和编辑当天内容。"}</p>
        <form className="space-y-2" onSubmit={feature.saveJournal}>
          <JournalFields compact />
        </form>
      </FeaturePanel>

      <FeaturePanel
        title={`股市复盘 · ${formatDayLabel(feature.selectedDate)}`}
        icon={<TrendingUp size={17} />}
        action={<ExpandButton label="打开复盘编辑" disabled={feature.disabled} onClick={() => feature.setModal("review")} />}
      >
        <form className="space-y-2" onSubmit={feature.saveReview}>
          <ReviewFields compact />
        </form>
      </FeaturePanel>
    </>
  );
}

function WritingDialogs() {
  const feature = useWritingReflection();
  if (!feature.modal) return null;
  if (feature.modal === "morning") {
    return (
      <WritingModal title={`晨写 · ${formatDayLabel(feature.selectedDate)}`} onClose={() => feature.setModal(null)} onSubmit={feature.saveMorning}>
        <InsightControls kind="morning" />
        <MorningFields />
      </WritingModal>
    );
  }
  if (feature.modal === "journal") {
    return (
      <WritingModal title={`睡前日记 · ${formatDayLabel(feature.selectedDate)}`} onClose={() => feature.setModal(null)} onSubmit={feature.saveJournal}>
        <InsightControls kind="journal" />
        <JournalFields />
      </WritingModal>
    );
  }
  return (
    <WritingModal title={`股市复盘 · ${formatDayLabel(feature.selectedDate)}`} onClose={() => feature.setModal(null)} onSubmit={feature.saveReview}>
      <ReviewFields />
    </WritingModal>
  );
}

function MorningFields({ compact = false }: { compact?: boolean }) {
  const feature = useWritingReflection();
  const select = (
    <select aria-label="晨写状态" className="field" disabled={feature.disabled} value={feature.morning.moodScore} onChange={(event) => feature.setMorning({ ...feature.morning, moodScore: event.target.value })}>
      <ScoreOptions items={MORNING_STATE_OPTIONS} />
    </select>
  );
  return (
    <>
      <textarea
        aria-label="晨写内容"
        className={compact ? "journal-input" : "writing-textarea"}
        disabled={feature.disabled}
        placeholder="早上先写几句：醒来想到什么、今天想把注意力放在哪里..."
        value={feature.morning.content}
        onChange={(event) => feature.setMorning({ ...feature.morning, content: event.target.value })}
      />
      {compact ? <div className="grid grid-cols-[1fr_auto] gap-2">{select}<SaveButton disabled={feature.disabled} /></div> : select}
    </>
  );
}

function JournalFields({ compact = false }: { compact?: boolean }) {
  const feature = useWritingReflection();
  const select = (
    <select aria-label="日记状态" className="field" disabled={feature.disabled} value={feature.journal.moodScore} onChange={(event) => feature.setJournal({ ...feature.journal, moodScore: event.target.value })}>
      <ScoreOptions items={JOURNAL_STATE_OPTIONS} />
    </select>
  );
  return (
    <>
      <textarea
        aria-label="日记内容"
        className={compact ? "journal-input" : "writing-textarea"}
        disabled={feature.disabled}
        placeholder={compact ? "睡前简单写几句：今天发生了什么、感谢什么、明天最重要的一件事..." : "睡前慢慢写：今天发生了什么、感谢什么、明天最重要的一件事..."}
        value={feature.journal.content}
        onChange={(event) => feature.setJournal({ ...feature.journal, content: event.target.value })}
      />
      {compact ? <div className="grid grid-cols-[1fr_auto] gap-2">{select}<SaveButton disabled={feature.disabled} /></div> : select}
    </>
  );
}

function ReviewFields({ compact = false }: { compact?: boolean }) {
  const feature = useWritingReflection();
  const inputClass = compact ? "journal-input" : "journal-input min-h-32 resize-y";
  return (
    <>
      <textarea aria-label="大盘结论" className={compact ? "journal-input min-h-28" : "writing-textarea min-h-[220px]"} disabled={feature.disabled} placeholder="今天的大盘和最重要的结论..." value={feature.review.marketSummary} onChange={(event) => feature.setReview({ ...feature.review, marketSummary: event.target.value })} />
      <div className="grid gap-2 md:grid-cols-2">
        <textarea aria-label="操作记录" className={inputClass} disabled={feature.disabled} placeholder="操作记录..." value={feature.review.operations} onChange={(event) => feature.setReview({ ...feature.review, operations: event.target.value })} />
        <textarea aria-label="持仓观察" className={inputClass} disabled={feature.disabled} placeholder="持仓观察..." value={feature.review.holdingsReview} onChange={(event) => feature.setReview({ ...feature.review, holdingsReview: event.target.value })} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <textarea aria-label="错误复盘" className={inputClass} disabled={feature.disabled} placeholder="错误复盘..." value={feature.review.mistakes} onChange={(event) => feature.setReview({ ...feature.review, mistakes: event.target.value })} />
        <textarea aria-label="明日计划" className={inputClass} disabled={feature.disabled} placeholder="明日计划..." value={feature.review.tomorrowPlan} onChange={(event) => feature.setReview({ ...feature.review, tomorrowPlan: event.target.value })} />
      </div>
      <div className={`grid gap-2 ${compact ? "md:grid-cols-[repeat(2,minmax(0,1fr))_auto]" : "md:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,1.4fr)]"}`}>
        <select aria-label="复盘心情" className="field" disabled={feature.disabled} value={feature.review.emotionScore} onChange={(event) => feature.setReview({ ...feature.review, emotionScore: event.target.value })}>
          <NumberOptions label="心情" />
        </select>
        <select aria-label="复盘纪律" className="field" disabled={feature.disabled} value={feature.review.disciplineScore} onChange={(event) => feature.setReview({ ...feature.review, disciplineScore: event.target.value })}>
          <NumberOptions label="纪律" />
        </select>
        {compact && <SaveButton disabled={feature.disabled} />}
        {!compact && <input aria-label="复盘标签" className="field" disabled={feature.disabled} placeholder="标签，用逗号分隔" value={feature.review.tags} onChange={(event) => feature.setReview({ ...feature.review, tags: event.target.value })} />}
      </div>
      {compact && <input aria-label="复盘标签" className="field" disabled={feature.disabled} placeholder="标签，用逗号分隔" value={feature.review.tags} onChange={(event) => feature.setReview({ ...feature.review, tags: event.target.value })} />}
    </>
  );
}

function InsightControls({ kind }: { kind: InsightKind }) {
  const feature = useWritingReflection();
  const insight = feature.insights[kind];
  return (
    <>
      <div className="flex justify-end">
        <button className="icon-button w-auto gap-1 px-3 text-[11px]" type="button" aria-label={kind === "morning" ? "分析晨写内容" : "分析日记内容"} onClick={() => void feature.analyze(kind)} disabled={feature.disabled || feature.aiLoading === kind}>
          <Sparkles size={13} />
          AI分析
        </button>
      </div>
      {insight && <AiInsightCard insight={insight} />}
    </>
  );
}

function FeaturePanel({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="glass-panel p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-mint-700">{icon}</span>
          <h2 className="section-title">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ExpandButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button className="icon-button h-8 w-auto gap-1 px-3 text-[11px]" type="button" aria-label={label} disabled={disabled} onClick={onClick}>
      <Pencil size={13} />
      展开写
    </button>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  return <button className="primary-button px-4" type="submit" disabled={disabled}>保存</button>;
}

function WritingShortcut({ label, done, disabled, onClick }: { label: string; done: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button className={`writing-shortcut ${done ? "writing-shortcut-done" : ""}`} type="button" disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      {done ? <CheckCircle2 className="text-mint-500" size={16} /> : <X className="text-pink-400" size={16} />}
    </button>
  );
}

function WritingModal({ title, children, onClose, onSubmit }: { title: string; children: ReactNode; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>
        <form className="writing-modal" onSubmit={onSubmit}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] text-soft">大空间写作</p>
              <h3 className="text-sm font-semibold">{title}</h3>
            </div>
            <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={onClose}><X size={15} /></button>
          </div>
          <div className="writing-body space-y-2">{children}</div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={onClose}>取消</button>
            <button className="primary-button px-5" type="submit">保存</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function AiInsightCard({ insight }: { insight: AiInsight }) {
  const tags = insight.emotionTags?.split(",").filter(Boolean) ?? [];
  const stress = insight.stressKeywords?.split(",").filter(Boolean) ?? [];
  return (
    <article className="insight-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-mint-700"><Sparkles size={13} />AI洞察</span>
        <span className="badge-gray">能量 {insight.energyScore ?? "-"}/5</span>
      </div>
      {insight.summary && <p className="text-[12px] leading-5 text-ink">{insight.summary}</p>}
      {!!tags.length && <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag) => <span className="badge-gray" key={tag}>{tag}</span>)}</div>}
      <div className="mt-2 space-y-2 text-[12px] leading-6 text-soft">
        {!!stress.length && <p>压力关键词：{stress.join("、")}</p>}
        {insight.suggestion && <p>建议：{insight.suggestion}</p>}
        {insight.fullText && <p className="whitespace-pre-wrap text-ink">{insight.fullText}</p>}
      </div>
    </article>
  );
}

function ScoreOptions({ items }: { items: readonly { value: string; label: string }[] }) {
  return <>{items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</>;
}

function NumberOptions({ label }: { label: string }) {
  return <>{[5, 4, 3, 2, 1].map((value) => <option value={value} key={value}>{label} {value}</option>)}</>;
}

function useWritingReflection() {
  const value = useContext(WritingReflectionContext);
  if (!value) throw new Error("Writing reflection components must be rendered inside WritingReflectionFeature");
  return value;
}

function simpleDraft(record: MorningWritingRecord | JournalRecord | null): SimpleDraft {
  return { content: record?.content ?? "", moodScore: String(record?.moodScore ?? 4) };
}

function reviewDraft(record: StockReviewRecord | null): ReviewDraft {
  return {
    marketSummary: record?.marketSummary ?? "",
    operations: record?.operations ?? "",
    holdingsReview: record?.holdingsReview ?? "",
    mistakes: record?.mistakes ?? "",
    tomorrowPlan: record?.tomorrowPlan ?? "",
    emotionScore: String(record?.emotionScore ?? 4),
    disciplineScore: String(record?.disciplineScore ?? 4),
    tags: record?.tags ?? ""
  };
}

function normalizeSimpleDraft(draft: SimpleDraft): SimpleDraft {
  return { ...draft, content: draft.content.trim() };
}

function normalizeReviewDraft(draft: ReviewDraft): ReviewDraft {
  return {
    ...draft,
    marketSummary: draft.marketSummary.trim(),
    operations: draft.operations.trim(),
    holdingsReview: draft.holdingsReview.trim(),
    mistakes: draft.mistakes.trim(),
    tomorrowPlan: draft.tomorrowPlan.trim(),
    tags: draft.tags.trim()
  };
}

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

function hasReviewContent(review: StockReviewRecord | null) {
  return Boolean(review && [review.marketSummary, review.operations, review.holdingsReview, review.goodPoints, review.mistakes, review.tomorrowPlan, review.tags].some(hasText));
}

function hasReviewDraftContent(review: ReviewDraft) {
  return [review.marketSummary, review.operations, review.holdingsReview, review.mistakes, review.tomorrowPlan, review.tags].some(hasText);
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00+08:00`));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
