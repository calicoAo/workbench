import { Droplets, GlassWater } from "lucide-react";
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

  async function saveCups(cups: number) {
    try {
      await recordWaterCups(request, selectedDate, cups);
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

      <div className="water-progress-wrap">
        <div className={`water-progress ${plan.isDue ? "is-due" : ""}`} aria-label={`饮水进度 ${water.cups} 杯`}>
          {Array.from({ length: 8 }, (_, index) => {
            const filled = index < water.cups;
            const reminder = plan.isDue && !filled && index === Math.min(water.cups, 7);
            return <GlassWater aria-hidden="true" className={`water-cup ${filled ? "is-filled" : ""} ${reminder ? "is-reminder" : ""}`} key={index} size={20} />;
          })}
          {water.cups > 8 ? <span className={`water-cup-extra ${plan.isDue ? "is-reminder" : ""}`}>+{water.cups - 8}</span> : null}
          <Button className="water-add-button" size="sm" variant="primary" type="button" aria-label="再喝一杯" onClick={() => void saveCups(water.cups + 1)}>+1</Button>
        </div>
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
  return {
    isDue: date === todayString() && water.cups < targetCups && expectedCups > water.cups
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
