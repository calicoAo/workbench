import { Droplets, Moon, Pencil, Trash2 } from "lucide-react";
import { IconButton } from "../../shared/ui";

export type Schedule = {
  id: number;
  taskId: number | null;
  categoryId: number | null;
  projectIdAtOccurrence?: number | null;
  scheduleDate?: string;
  recordTimezone?: string;
  startTime: string;
  endTime: string;
  title: string;
  note: string | null;
  kind: number;
  source: number;
  sourceId?: string | null;
  color: string;
  version?: number;
  actualTimeClass?: number;
  lifecycleState?: number;
};

export type TimelineItem = Schedule & { marker?: "water" | "sleep" };

type TimelineLayout = {
  item: TimelineItem;
  start: number;
  end: number;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
};

const HOUR_START = 0;
const HOUR_END = 24;
const COMPRESSED_START_MINUTE = 3 * 60;
const COMPRESSED_END_MINUTE = 7 * 60;
const COMPRESSED_VISUAL_MINUTES = 2 * 60;
const TIMELINE_VISUAL_MINUTES = 24 * 60 - (COMPRESSED_END_MINUTE - COMPRESSED_START_MINUTE) + COMPRESSED_VISUAL_MINUTES;
const timelineTicks = [
  ...Array.from({ length: 4 }, (_, hour) => ({ minute: hour * 60, label: `${String(hour).padStart(2, "0")}:00` })),
  { minute: 5 * 60, label: "03-07", compressed: true },
  ...Array.from({ length: HOUR_END - 7 + 1 }, (_, index) => {
    const hour = 7 + index;
    return { minute: hour * 60, label: `${String(hour).padStart(2, "0")}:00` };
  })
];

export function scheduleDurationMinutes(item: Pick<Schedule, "startTime" | "endTime">) {
  const seconds = Math.max(0, timeToSeconds(item.endTime) - timeToSeconds(item.startTime));
  return seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0;
}

export function TimelineBoard({ items, onDelete, onEdit }: { items: TimelineItem[]; onDelete: (id: number) => void; onEdit?: (item: TimelineItem) => void }) {
  const dayStart = HOUR_START * 60;
  const dayEnd = HOUR_END * 60;
  const blockLayouts = layoutTimelineBlocks(items, dayStart, dayEnd);
  const waterItems = items.filter((item) => item.marker === "water");

  return (
    <div className="timeline-board">
      {timelineTicks.map((tick) => {
        const top = timelineTopPercent(tick.minute);
        return (
          <div key={`${tick.minute}-${tick.label}`} className={`timeline-hour ${"compressed" in tick && tick.compressed ? "timeline-hour-compressed" : ""}`} style={{ top: `${top}%` }}>
            <span>{tick.label}</span>
          </div>
        );
      })}

      {blockLayouts.map(({ item, top, height, lane, laneCount }) => {
        const minutes = timelineDurationMinutes(item);
        const short = minutes < 15;
        const planned = item.kind === 0;
        const sleepBlock = item.marker === "sleep";
        const laneWidth = 74 / laneCount;
        return (
          <div
            key={item.id}
            className={`timeline-block ${short ? "timeline-block-short" : ""} ${laneCount > 1 ? "timeline-block-overlap" : ""} ${planned ? "timeline-block-planned" : "timeline-block-actual"} ${sleepBlock ? "timeline-block-sleep" : ""}`}
            title={[`${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)} · ${sourceText(item)} · ${formatDuration(minutes)}`, item.title, item.note ? `备注：${item.note}` : ""].filter(Boolean).join("\n")}
            style={{
              top: `${top}%`,
              height: `max(${height}%, ${short ? 28 : 34}px)`,
              borderColor: item.color,
              left: `${23 + lane * laneWidth}%`,
              width: `calc(${laneWidth}% - ${laneCount > 1 ? 4 : 0}px)`
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="timeline-block-title inline-flex max-w-full items-center gap-1.5">
                {sleepBlock && <Moon className="shrink-0" size={12} />}
                <span className="truncate">{item.title}</span>
              </p>
              <p className="timeline-block-meta">{`${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)} · ${sourceText(item)} · ${formatDuration(minutes)}`}</p>
            </div>
            <span className="timeline-block-actions">{onEdit ? <IconButton size="sm" label={`${sleepBlock || (item.source !== 1 && item.actualTimeClass !== 2) ? "编辑" : "查看"}${sourceText(item)}`} onClick={() => onEdit(item)}><Pencil size={11} /></IconButton> : null}{!sleepBlock && item.source !== 1 && item.actualTimeClass !== 2 ? <IconButton size="sm" className="timeline-delete" label="删除时间记录" onClick={() => onDelete(item.id)}><Trash2 size={12} /></IconButton> : null}</span>
          </div>
        );
      })}

      {waterItems.map((item) => {
        const start = Math.max(dayStart, timeToMinutes(item.startTime));
        const top = timelineTopPercent(start);
        return (
          <div key={`water-${item.id}-${item.startTime}`} className="timeline-point timeline-point-water" title={`${item.startTime.slice(0, 5)} · ${item.title}`} style={{ top: `${top}%` }}>
            <span className="timeline-point-dot"><Droplets size={12} /></span>
            <span className="truncate">{`${item.startTime.slice(0, 5)} ${item.title}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function timelineEndMinute(item: TimelineItem) {
  const start = timeToMinutes(item.startTime);
  const end = timeToMinutes(item.endTime);
  return item.marker === "sleep" && end <= start ? end + 24 * 60 : end;
}

function timelineDurationMinutes(item: TimelineItem) {
  if (item.marker !== "sleep") return scheduleDurationMinutes(item);
  return Math.max(1, timelineEndMinute(item) - timeToMinutes(item.startTime));
}

function timelineVisualMinute(minute: number) {
  if (minute <= COMPRESSED_START_MINUTE) return minute;
  if (minute < COMPRESSED_END_MINUTE) {
    return COMPRESSED_START_MINUTE + ((minute - COMPRESSED_START_MINUTE) / (COMPRESSED_END_MINUTE - COMPRESSED_START_MINUTE)) * COMPRESSED_VISUAL_MINUTES;
  }
  return minute - (COMPRESSED_END_MINUTE - COMPRESSED_START_MINUTE) + COMPRESSED_VISUAL_MINUTES;
}

function timelineTopPercent(minute: number) {
  return (timelineVisualMinute(minute) / TIMELINE_VISUAL_MINUTES) * 100;
}

function layoutTimelineBlocks(items: TimelineItem[], dayStart: number, dayEnd: number) {
  const layouts: TimelineLayout[] = items
    .filter((item) => item.marker !== "water")
    .map((item) => {
      const rawStart = timeToMinutes(item.startTime);
      const rawEnd = timelineEndMinute(item);
      const start = Math.max(dayStart, rawStart);
      const end = Math.min(dayEnd, rawEnd);
      if (end <= dayStart || start >= dayEnd || end <= start) return null;
      return { item, start, end, top: timelineTopPercent(start), height: Math.max(2.8, timelineTopPercent(end) - timelineTopPercent(start)), lane: 0, laneCount: 1 };
    })
    .filter((item): item is TimelineLayout => Boolean(item))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let group: TimelineLayout[] = [];
  let groupEnd = -1;
  const applyGroupLanes = () => {
    const laneEnds: number[] = [];
    for (const item of group) {
      const reusableLane = laneEnds.findIndex((end) => end <= item.start);
      item.lane = reusableLane === -1 ? laneEnds.length : reusableLane;
      laneEnds[item.lane] = item.end;
    }
    group.forEach((item) => { item.laneCount = Math.max(1, laneEnds.length); });
  };

  for (const item of layouts) {
    if (!group.length || item.start < groupEnd) {
      group.push(item);
      groupEnd = Math.max(groupEnd, item.end);
      continue;
    }
    applyGroupLanes();
    group = [item];
    groupEnd = item.end;
  }
  applyGroupLanes();
  return layouts;
}

function sourceText(item: TimelineItem) {
  if (item.marker === "sleep") return "睡眠";
  if (item.kind === 0) return "计划";
  if (item.source === 1) return "计时";
  if (item.actualTimeClass === 2) return "历史实际";
  return "补录";
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
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
