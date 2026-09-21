import { CalendarDays, ListFilter, PieChart, TimerReset, TrendingUp } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { type Schedule } from "../calendar";
import { CORE_DIMENSIONS, EXTRA_DIMENSIONS, categoriesInDimension, dimensionTotalMinutes, isCoreDimensionKey, type Category } from "../categories";
import { type SleepRecord } from "../sleep";
import { WritingReflectionHistory } from "../writing-reflection";
import { ArchiveBrowser } from "./archive";

export { ArchiveBrowser } from "./archive";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type SleepRange = "week" | "month";

export type SleepSeriesItem = { date: string; sleepMinutes: number; sleepQuality: number | null };
export type WeeklySeriesItem = SleepSeriesItem & { journalFilled: boolean; reviewFilled: boolean; emotionScore: number | null; disciplineScore: number | null };
export type HistoryStats = { totalMinutes: number; completedTasks: number; journalDays: number; stockReviewDays: number };

export function HistoryFeature({ request, selectedDate, refreshRevision, loading, stats, sleep, categories, schedules, weeklySeries, monthlySleepSeries, onError, onBack }: {
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
  const [sleepRange, setSleepRange] = useState<SleepRange>("week");
  const actualMinutes = schedules.filter((item) => item.kind === 1).reduce((sum, item) => sum + durationMinutes(item), 0);
  const plannedCount = schedules.filter((item) => item.kind === 0).length;
  const timeBreakdown = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of schedules) {
      if (item.kind !== 1 || !item.categoryId) continue;
      map.set(item.categoryId, (map.get(item.categoryId) ?? 0) + durationMinutes(item));
    }
    return categories.map((category) => ({ id: category.id, name: category.name, color: category.color, minutes: map.get(category.id) ?? 0 })).filter((item) => item.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  }, [categories, schedules]);
  const pieTotalMinutes = timeBreakdown.reduce((sum, item) => sum + item.minutes, 0);
  const sleepSeries = sleepRange === "week" ? weeklySeries : monthlySleepSeries;

  return (
    <section className="grid gap-2.5">
      <Panel title="全部记录" icon={<ListFilter size={17} />} className="min-h-[420px]" action={<button className="icon-button h-8 w-auto px-3 text-[11px]" type="button" aria-label="回到工作台" onClick={onBack}>回工作台</button>}>
        <ArchiveBrowser request={request} refreshRevision={refreshRevision} onError={onError} />
      </Panel>
      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-2.5"><WritingReflectionHistory loading={loading} /></div>
        <div className="grid gap-2.5">
          <Panel title={`时间饼图 · ${formatDayLabel(selectedDate)}`} icon={<PieChart size={17} />}><DailyPieChart items={timeBreakdown} totalMinutes={pieTotalMinutes} /></Panel>
          <Panel title="能力总统计" icon={<TimerReset size={17} />}><AbilityTotalStats categories={categories} /></Panel>
          <Panel
            title={sleepRange === "week" ? "睡眠柱图 · 周" : "睡眠柱图 · 月"}
            icon={<TrendingUp size={17} />}
            action={<div className="inline-flex rounded-full border border-white/80 bg-white/70 p-0.5"><button className={`h-7 rounded-full px-2.5 text-[11px] font-semibold ${sleepRange === "week" ? "bg-mint-500 text-white" : "text-soft"}`} type="button" onClick={() => setSleepRange("week")}>周</button><button className={`h-7 rounded-full px-2.5 text-[11px] font-semibold ${sleepRange === "month" ? "bg-pink-400 text-white" : "text-soft"}`} type="button" onClick={() => setSleepRange("month")}>月</button></div>}
          >
            <SleepChart series={sleepSeries} />
          </Panel>
          <Panel title="本周统计" icon={<CalendarDays size={17} />}>
            <div className="grid grid-cols-2 gap-1.5"><Metric label="实际" value={formatDuration(stats?.totalMinutes ?? 0)} /><Metric label="完成" value={`${stats?.completedTasks ?? 0}`} /><Metric label="日记" value={`${stats?.journalDays ?? 0}天`} /><Metric label="复盘" value={`${stats?.stockReviewDays ?? 0}天`} /></div>
            <div className="mt-3 space-y-2">{weeklySeries.map((item) => <div className="flex items-center justify-between rounded-card bg-white/55 px-3 py-2 text-xs" key={item.date}><span>{formatDayLabel(item.date)}</span><span className="text-soft">{item.sleepMinutes ? `${formatDuration(item.sleepMinutes)} 睡眠` : "无睡眠记录"}</span></div>)}</div>
            {sleep && <p className="mt-3 text-[11px] text-soft">今天睡眠：{(sleep.durationMinutes / 60).toFixed(1)}h · 质量 {sleep.qualityScore ?? "-"}/5</p>}
            <p className="mt-1 text-[11px] text-soft">今日记录：{formatDuration(actualMinutes)} · 安排 {plannedCount} 段</p>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function AbilityTotalStats({ categories }: { categories: Category[] }) {
  const items = categories.filter((category) => category.totalMinutes > 0).sort((a, b) => b.totalMinutes - a.totalMinutes);
  const coreDimensions = CORE_DIMENSIONS.map((dimension) => ({ ...dimension, minutes: dimensionTotalMinutes(categories, dimension.key) })).filter((dimension) => dimension.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const extraDimensions = EXTRA_DIMENSIONS.map((dimension) => ({ ...dimension, minutes: dimensionTotalMinutes(categories, dimension.key) })).filter((dimension) => dimension.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const coreItems = items.filter((item) => isCoreDimensionKey(item.dimensionKey));
  const totalMinutes = coreDimensions.reduce((sum, item) => sum + item.minutes, 0);
  const extraTotalMinutes = extraDimensions.reduce((sum, item) => sum + item.minutes, 0);
  if (!totalMinutes && !extraTotalMinutes) return <EmptyText text="还没有能力耗时记录。" />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5"><Metric label="六维累计" value={formatDuration(totalMinutes)} /><Metric label="六维技能" value={`${coreItems.length}`} /></div>
      {!!coreDimensions.length && <div className="space-y-2">{coreDimensions.map((dimension) => <DimensionStat key={dimension.key} dimension={dimension} items={categoriesInDimension(coreItems, dimension.key)} totalMinutes={totalMinutes} />)}</div>}
      {!!extraDimensions.length && <div className="space-y-2"><p className="text-[11px] font-semibold text-soft">附加记录，不计入六维</p>{extraDimensions.map((dimension) => <DimensionStat key={dimension.key} dimension={dimension} items={categoriesInDimension(items, dimension.key)} totalMinutes={extraTotalMinutes} muted />)}</div>}
    </div>
  );
}

function DimensionStat({ dimension, items, totalMinutes, muted = false }: { dimension: { key: string; label: string; color: string; minutes: number }; items: Category[]; totalMinutes: number; muted?: boolean }) {
  const percent = Math.max(1, Math.round((dimension.minutes / Math.max(1, totalMinutes)) * 100));
  return <div className={`rounded-card p-2 ${muted ? "bg-white/45" : "bg-white/55"}`}><div className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span className="ability-title"><i style={{ backgroundColor: dimension.color }} />{dimension.label}</span><span className="shrink-0 text-soft">{formatDuration(dimension.minutes)}</span></div><div className="h-2 rounded-full bg-white/80"><div className="progress-fill" style={{ width: `${percent}%`, backgroundColor: dimension.color }} /></div><div className="mt-2 flex flex-wrap gap-1.5">{items.map((item) => <span className="text-[10px] text-soft" key={item.id}>{item.name} {formatDuration(item.totalMinutes)}</span>)}</div></div>;
}

function DailyPieChart({ items, totalMinutes }: { items: Array<{ id: number; name: string; color: string; minutes: number }>; totalMinutes: number }) {
  if (!totalMinutes) return <EmptyText text="今天还没有可统计的时间分布。" />;
  const circumference = 2 * Math.PI * 44;
  let offset = 0;
  return <div className="grid gap-3 md:grid-cols-[160px_1fr] md:items-center"><svg viewBox="0 0 120 120" className="mx-auto h-36 w-36"><circle cx="60" cy="60" r="44" fill="none" stroke="rgba(53,201,154,0.12)" strokeWidth="16" />{items.map((item) => { const length = (item.minutes / totalMinutes) * circumference; const element = <circle key={item.id} cx="60" cy="60" r="44" fill="none" stroke={item.color} strokeWidth="16" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" strokeLinecap="butt" />; offset += length; return element; })}<text x="60" y="56" textAnchor="middle" className="fill-ink text-[14px] font-semibold">{formatDuration(totalMinutes)}</text><text x="60" y="72" textAnchor="middle" className="fill-soft text-[10px]">今日分布</text></svg><div className="space-y-2">{items.map((item) => <div className="flex items-center justify-between gap-2 rounded-card bg-white/55 px-3 py-2 text-xs" key={item.id}><span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate">{item.name}</span></span><span className="shrink-0 text-soft">{formatDuration(item.minutes)}</span></div>)}</div></div>;
}

function SleepChart({ series }: { series: Array<SleepSeriesItem & Partial<Pick<WeeklySeriesItem, "journalFilled" | "reviewFilled">>> }) {
  if (!series.length) return <EmptyText text="还没有睡眠统计。" />;
  const max = Math.max(1, ...series.map((item) => item.sleepMinutes));
  return <div className="grid grid-cols-7 gap-1.5">{series.map((item) => { const height = Math.max(8, (item.sleepMinutes / max) * 100); return <div className="flex flex-col items-center gap-2" key={item.date}><div className="flex h-32 w-full items-end rounded-card border border-white/70 bg-white/50 p-1"><div className="w-full rounded-none bg-mint-500/85 transition-all" style={{ height: `${height}%` }} /></div><div className="text-center text-[11px]"><p>{formatDayLabel(item.date)}</p><p className="text-soft">{formatDuration(item.sleepMinutes)}</p></div>{"journalFilled" in item && <div className="flex gap-1"><span className={`h-1.5 w-1.5 rounded-full ${item.journalFilled ? "bg-pink-400" : "bg-white/60"}`} title="日记" /><span className={`h-1.5 w-1.5 rounded-full ${item.reviewFilled ? "bg-mint-500" : "bg-white/60"}`} title="复盘" /></div>}</div>; })}</div>;
}

function Panel({ title, icon, children, className = "", action }: { title: string; icon: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`glass-panel p-3 ${className}`}><div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="text-mint-700">{icon}</span><h2 className="section-title">{title}</h2></div>{action}</div>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric-card"><p className="text-[11px] text-soft">{label}</p><p className="mt-0.5 text-base font-semibold">{value}</p></div>;
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-card bg-white/50 p-3 text-sm text-soft">{text}</p>;
}

function durationMinutes(item: Pick<Schedule, "startTime" | "endTime">) {
  const seconds = Math.max(0, timeToSeconds(item.endTime) - timeToSeconds(item.startTime));
  return seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0;
}

function timeToSeconds(value: string) {
  const [hour, minute, second = 0] = value.split(":").map(Number);
  return hour * 3600 + minute * 60 + second;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00+08:00`));
}
