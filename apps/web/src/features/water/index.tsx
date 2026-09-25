import { Droplets, GlassWater } from "lucide-react";
import { useState } from "react";
import { Button } from "../../shared/ui";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type SleepWindow = { sleepStart: string; wakeTime: string };

export type WaterRecord = {
  id?: number;
  waterDate: string;
  cups: number;
  targetCups: number;
  lastDrinkAt?: string | null;
  drinkTimes?: string | string[] | null;
};

export type WaterTimelineItem = {
  id: number;
  taskId: null;
  categoryId: null;
  startTime: string;
  endTime: string;
  title: string;
  note: string;
  kind: 1;
  source: 0;
  color: string;
  marker: "water";
};

export async function recordWaterCups(request: Request, waterDate: string, cups: number) {
  const nextCups = Math.max(0, Math.min(127, cups));
  await request("/api/water-records", {
    method: "POST",
    body: JSON.stringify({ waterDate, cups: nextCups, targetCups: 8 })
  });
  return nextCups;
}

export function WaterFeature({
  request,
  selectedDate,
  record,
  sleep,
  onError,
  onChanged
}: {
  request: Request;
  selectedDate: string;
  record: WaterRecord | null;
  sleep: SleepWindow | null;
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const water = record ?? emptyWaterRecord(selectedDate);
  const plan = hydrationPlan(water, sleep, selectedDate);
  const [manualCups, setManualCups] = useState(String(water.cups));

  async function saveCups(cups: number) {
    try {
      const nextCups = await recordWaterCups(request, selectedDate, cups);
      setManualCups(String(nextCups));
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  return (
    <section className="glass-panel p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-mint-700"><Droplets size={17} /></span>
        <h2 className="section-title">喝水</h2>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-soft">
            <span>{water.cups}/{water.targetCups} 杯</span>
            <span>{plan.statusText}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full border border-white/80 bg-white/70">
            <div className={`h-full rounded-full transition-all duration-500 ${plan.percent >= 100 ? "bg-mint-500" : "bg-pink-300"}`} style={{ width: `${plan.percent}%` }} />
          </div>
          <div className="water-cups" aria-label={`饮水杯数 ${water.cups} 杯`}>
            {Array.from({ length: 8 }, (_, index) => <GlassWater aria-hidden="true" className={`water-cup ${index < water.cups ? "is-filled" : ""}`} key={index} size={18} />)}
            {water.cups > 8 ? <span className="water-cup-extra">+{water.cups - 8}</span> : null}
          </div>
          <div className="mt-1.5 space-y-0.5 text-[10px] leading-4 text-soft">
            <p>{plan.lastDrinkText}</p>
            <p>{plan.rhythmText}</p>
          </div>
        </div>
        <div className="water-compact-actions"><Button variant="primary" type="button" onClick={() => void saveCups(water.cups + 1)}>+1 杯</Button><label>修正杯数<input aria-label="手动修正喝水杯数" className="field" min="0" max="127" type="number" value={manualCups} onChange={(event) => setManualCups(event.target.value)} /></label><Button size="sm" type="button" onClick={() => void saveCups(Number(manualCups))}>保存</Button></div>
      </div>
    </section>
  );
}

export function waterTimelineItems(water: WaterRecord | null): WaterTimelineItem[] {
  if (!water) return [];
  return parseDrinkTimes(water)
    .slice(0, water.cups)
    .map((drinkTime, index) => {
      const at = timeText(drinkTime);
      return {
        id: -10001 - index,
        taskId: null,
        categoryId: null,
        startTime: `${at}:00`,
        endTime: `${at}:00`,
        title: `喝水 · 第 ${index + 1} 杯`,
        note: "喝水记录",
        kind: 1,
        source: 0,
        color: "#7EC8E3",
        marker: "water"
      };
    });
}

function hydrationPlan(water: WaterRecord, sleep: SleepWindow | null, date: string) {
  const now = new Date();
  const targetCups = Math.max(1, water.targetCups);
  const startMinutes = sleep ? timeToMinutes(timeText(sleep.wakeTime)) : 8 * 60;
  let endMinutes = sleep ? timeToMinutes(timeText(sleep.sleepStart)) : 22 * 60;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  const intervalMinutes = Math.max(45, Math.round((endMinutes - startMinutes) / targetCups));
  const clockMinutes = now.getHours() * 60 + now.getMinutes();
  const currentMinutes = clockMinutes + (clockMinutes < startMinutes ? 24 * 60 : 0);
  const elapsed = Math.max(0, Math.min(endMinutes - startMinutes, currentMinutes - startMinutes));
  const expectedCups = date === todayString() ? Math.min(targetCups, Math.ceil(elapsed / intervalMinutes)) : targetCups;
  const percent = expectedCups <= 0 ? 100 : Math.min(100, Math.round((water.cups / expectedCups) * 100));
  const nextDueMinutes = startMinutes + water.cups * intervalMinutes;
  const overdueMinutes = Math.max(0, currentMinutes - nextDueMinutes);
  const statusText =
    date !== todayString()
      ? "历史记录"
      : water.cups >= targetCups
        ? "今日完成"
        : expectedCups === 0
          ? "还没到开始时间"
          : percent >= 100
            ? "节奏正常"
            : `慢了 ${formatDuration(overdueMinutes || intervalMinutes)}`;
  return {
    percent,
    statusText,
    rhythmText: `约每 ${formatDuration(intervalMinutes)} 一杯，当前应到 ${expectedCups}/${targetCups} 杯`,
    lastDrinkText: lastDrinkText(water.lastDrinkAt)
  };
}

function parseDrinkTimes(water: WaterRecord) {
  if (Array.isArray(water.drinkTimes)) return water.drinkTimes;
  if (typeof water.drinkTimes === "string" && water.drinkTimes.trim()) {
    try {
      const parsed = JSON.parse(water.drinkTimes);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
    } catch {
      return water.lastDrinkAt ? [water.lastDrinkAt] : [];
    }
  }
  return water.lastDrinkAt ? [water.lastDrinkAt] : [];
}

function emptyWaterRecord(date: string): WaterRecord {
  return { waterDate: date, cups: 0, targetCups: 8, lastDrinkAt: null, drinkTimes: "[]" };
}

function lastDrinkText(value?: string | null) {
  if (!value) return "今天还没记录喝水";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "上次喝水：刚刚";
  if (minutes < 60) return `上次喝水：${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return `上次喝水：${hours} 小时${rest ? ` ${rest} 分钟` : ""}前`;
  return `上次喝水：${Math.floor(hours / 24)} 天前`;
}

function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return date.toTimeString().slice(0, 5);
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
