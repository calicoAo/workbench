import { ListFilter } from "lucide-react";
import { type ReactNode } from "react";
import { type Schedule } from "../calendar";
import { type Category } from "../categories";
import { type SleepRecord } from "../sleep";
import { WritingReflectionHistory } from "../writing-reflection";
import { ArchiveBrowser } from "./archive";
import { tx } from "../../app/i18n";

export { ArchiveBrowser } from "./archive";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type SleepSeriesItem = { date: string; sleepMinutes: number; sleepQuality: number | null };
export type WeeklySeriesItem = SleepSeriesItem & { journalFilled: boolean; reviewFilled: boolean; emotionScore: number | null; disciplineScore: number | null };
export type HistoryStats = { totalMinutes: number; completedTasks: number; journalDays: number; stockReviewDays: number };

export function HistoryFeature({ request, refreshRevision, loading, onError }: {
  request: Request;
  selectedDate: string;
  refreshRevision: number;
  loading: boolean;
  stats: HistoryStats | undefined;
  sleep: SleepRecord | null;
  categories: Category[];
  schedules: Schedule[];
  weeklySeries: WeeklySeriesItem[];
  monthlySleepSeries: SleepSeriesItem[];
  onError: (message: string, title?: string) => void;
  onBack: () => void;
}) {
  return <section className="history-browser-route"><Panel title={tx("过去记录")} icon={<ListFilter size={17} />}><ArchiveBrowser request={request} refreshRevision={refreshRevision} onError={onError} /></Panel><Panel title={tx("文字记录")} icon={<ListFilter size={17} />}><WritingReflectionHistory loading={loading} /></Panel></section>;
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="glass-panel p-3"><div className="mb-3 flex items-center gap-2"><span className="text-mint-700">{icon}</span><h2 className="section-title">{tx(title)}</h2></div>{children}</section>;
}
