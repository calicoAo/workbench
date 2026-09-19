import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { type MediaWatchRecord } from "../media-watch";
import { type JournalRecord, type MorningWritingRecord, type StockReviewRecord } from "../writing-reflection";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type ArchiveTab = "morning" | "journal" | "review" | "media";
type ArchiveItem = {
  id: string | number;
  date: string;
  title: string;
  content: string | null | undefined;
  score: number | null | undefined;
  sections: Array<{ label: string; value: string | number | null | undefined }>;
};

export function ArchiveBrowser({ request, refreshRevision, onError }: {
  request: Request;
  refreshRevision: number;
  onError: (message: string, title?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<ArchiveTab>("morning");
  const [records, setRecords] = useState<MorningWritingRecord[] | JournalRecord[] | StockReviewRecord[] | MediaWatchRecord[]>([]);
  const [selectedItem, setSelectedItem] = useState<ArchiveItem | null>(null);

  useEffect(() => {
    let current = true;
    const path = activeTab === "morning"
      ? "/api/morning-writings/list?limit=50"
      : activeTab === "journal"
        ? "/api/journals/list?limit=50"
        : activeTab === "review"
          ? "/api/stock-reviews/list?limit=50"
          : "/api/media-watch-records/list?limit=50";
    void request<MorningWritingRecord[] | JournalRecord[] | StockReviewRecord[] | MediaWatchRecord[]>(path)
      .then((items) => { if (current) setRecords(items); })
      .catch((error) => { if (current) onError(errorMessage(error), "列表加载失败"); });
    return () => { current = false; };
  }, [activeTab, refreshRevision, request, onError]);

  const items = archiveItems(activeTab, records);
  return (
    <div>
      <div className="mb-3 inline-flex rounded-full border border-white/80 bg-white/70 p-0.5">
        {[["morning", "晨写"], ["journal", "日记"], ["review", "复盘"], ["media", "影视"]].map(([value, label]) => (
          <button
            className={`h-8 rounded-full px-3 text-[11px] font-semibold transition ${activeTab === value ? "bg-mint-500 text-white" : "text-soft hover:text-ink"}`}
            key={value}
            type="button"
            onClick={() => {
              setRecords([]);
              setSelectedItem(null);
              setActiveTab(value as ArchiveTab);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-2.5 lg:grid-cols-2">
        {!items.length && <EmptyText text="还没有记录。" />}
        {items.map((item) => (
          <button className="archive-card text-left" key={item.id} type="button" onClick={() => setSelectedItem(item)}>
            <div className="mb-1 flex items-center justify-between gap-2"><h3 className="truncate text-[13px] font-semibold text-ink">{item.title}</h3><span className="shrink-0 text-[11px] text-soft">{formatDayLabel(item.date)}</span></div>
            <p className="archive-card-content">{item.content?.trim() || "这天还没写内容。"}</p>
            {item.score && <p className="mt-2 text-[11px] text-mint-700">评分 {item.score}/5</p>}
            <span className="mt-3 inline-flex text-[11px] font-semibold text-pink-500">查看详情</span>
          </button>
        ))}
      </div>
      {selectedItem && <ArchiveDetailDialog item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

function archiveItems(tab: ArchiveTab, records: MorningWritingRecord[] | JournalRecord[] | StockReviewRecord[] | MediaWatchRecord[]): ArchiveItem[] {
  if (tab === "morning") return (records as MorningWritingRecord[]).map((item) => ({ id: item.id ?? item.writingDate, date: item.writingDate, title: "晨写", content: item.content, score: item.moodScore, sections: [{ label: "内容", value: item.content }, { label: "状态", value: item.moodScore ? `${item.moodScore}/5` : null }] }));
  if (tab === "journal") return (records as JournalRecord[]).map((item) => ({ id: item.id, date: item.journalDate, title: "睡前日记", content: item.content, score: item.moodScore, sections: [{ label: "内容", value: item.content }, { label: "状态", value: item.moodScore ? `${item.moodScore}/5` : null }] }));
  if (tab === "review") return (records as StockReviewRecord[]).map((item) => ({
    id: item.id,
    date: item.reviewDate,
    title: item.tags?.trim() || "股市复盘",
    content: item.marketSummary || item.operations || item.holdingsReview || item.mistakes || item.tomorrowPlan || item.tags,
    score: item.disciplineScore,
    sections: [
      { label: "大盘结论", value: item.marketSummary }, { label: "操作记录", value: item.operations }, { label: "持仓观察", value: item.holdingsReview },
      { label: "错误复盘", value: item.mistakes }, { label: "明日计划", value: item.tomorrowPlan }, { label: "标签", value: item.tags },
      { label: "心情", value: item.emotionScore ? `${item.emotionScore}/5` : null }, { label: "纪律", value: item.disciplineScore ? `${item.disciplineScore}/5` : null }
    ]
  }));
  return (records as MediaWatchRecord[]).map((item) => ({ id: item.id ?? item.watchDate, date: item.watchDate, title: item.title?.trim() || "影视陪伴", content: [item.episode, item.note].filter(Boolean).join(" · "), score: null, sections: [{ label: "剧名", value: item.title }, { label: "进度", value: item.episode }, { label: "备注", value: item.note }] }));
}

function ArchiveDetailDialog({ item, onClose }: { item: ArchiveItem; onClose: () => void }) {
  const sections = item.sections.filter((section) => String(section.value ?? "").trim());
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>
        <article className="writing-modal">
          <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-[11px] text-soft">{formatDayLabel(item.date)}</p><h3 className="text-base font-semibold">{item.title}</h3></div><button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={onClose}><X size={15} /></button></div>
          <div className="writing-body space-y-3">{sections.length ? sections.map((section) => <section className="archive-detail-section" key={section.label}><p className="mb-1 text-[11px] font-semibold text-mint-700">{section.label}</p><p className="whitespace-pre-wrap text-[13px] leading-6 text-ink">{section.value}</p></section>) : <EmptyText text="这天还没写内容。" />}</div>
        </article>
      </div>
    </div>,
    document.body
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{text}</p>;
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00+08:00`));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "列表加载失败";
}
