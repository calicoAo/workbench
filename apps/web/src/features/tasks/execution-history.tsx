import { getActiveLocale, tx } from "../../app/i18n";
import type { TaskDetailPayload } from "./integration";

type Entry = TaskDetailPayload["actualEntries"][number];
export type CurrentExecution = { startedAt: string; recordTimezone: string };

// Date slices reconstruct a source interval; Session identity only groups context
// and its note. It must never replace individual Segment bounds.
function historyGroups(entries: Entry[]) {
  const groups = new Map<string, { sessionId: number | null; note: string | null; durationSeconds: number | null; periods: Map<string, Entry> }>();
  for (const entry of entries) {
    const sessionId = entry.source === "TIMER_SEGMENT" ? entry.timerSessionId ?? null : null;
    const sourceKey = `${entry.source}:${entry.sourceId}`;
    const groupKey = sessionId === null ? sourceKey : `session:${sessionId}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { sessionId, note: sessionId === null ? entry.note : entry.sessionNote ?? null, durationSeconds: entry.sessionDurationSeconds ?? null, periods: new Map() };
      groups.set(groupKey, group);
    }
    const previous = group.periods.get(sourceKey);
    group.periods.set(sourceKey, previous ? {
      ...previous,
      startedAt: earliest(previous.startedAt, entry.startedAt),
      endedAt: latest(previous.endedAt, entry.endedAt)
    } : entry);
  }
  return [...groups.entries()];
}

function instant(value: string) { return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`); }
function earliest(a: string | null, b: string | null) { return !a ? b : !b ? a : instant(a) < instant(b) ? a : b; }
function latest(a: string | null, b: string | null) { return !a ? b : !b ? a : instant(a) > instant(b) ? a : b; }
function minutes(entry: Entry) { return entry.startedAt && entry.endedAt ? Math.max(0, (instant(entry.endedAt).getTime() - instant(entry.startedAt).getTime()) / 60000) : 0; }
function dateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(getActiveLocale(), { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant(value));
}
function sourceLabel(source: Entry["source"]) { return source === "TIMER_SEGMENT" ? tx("计时") : source === "MANUAL_ACTUAL" ? tx("补录") : tx("历史实际"); }

export function TaskExecutionHistory({ entries, currentExecution }: { entries: Entry[]; currentExecution?: CurrentExecution }) {
  const groups = historyGroups(entries);
  return <section className="detail-section"><h2>{tx("冒险记录")}</h2>
    {currentExecution ? <p>{tx("当前执行")} · {dateTime(currentExecution.startedAt, currentExecution.recordTimezone)} · {tx("进行中")}</p> : null}
    {groups.length ? <div className="detail-history">{groups.map(([key, group]) => {
      const periods = [...group.periods.values()].sort((a, b) => (a.startedAt ? instant(a.startedAt).getTime() : 0) - (b.startedAt ? instant(b.startedAt).getTime() : 0));
      return <div key={key}>
        <strong>{group.sessionId !== null ? <>{tx("本次执行")} · Session #{group.sessionId}</> : sourceLabel(periods[0].source)}</strong>
        {group.durationSeconds !== null ? <small>{tx("实际投入 {value0} 分钟", { value0: Number((group.durationSeconds / 60).toFixed(1)) })}</small> : null}
        <ul className="m-0 grid list-none gap-2 p-0" aria-label={tx("已完成执行区间")}>{periods.map((item) => <li key={`${item.source}:${item.sourceId}`}>
          <small>{item.startedAt ? dateTime(item.startedAt, item.recordTimezone) : tx("未知开始")} – {item.endedAt ? dateTime(item.endedAt, item.recordTimezone) : tx("未知结束")} · {tx("{value0} 分钟", { value0: Number(minutes(item).toFixed(1)) })} · {item.recordTimezone}</small>
        </li>)}</ul>
        {group.note ? <p className="detail-history-note">{group.note}</p> : null}
      </div>;
    })}</div> : <p className="muted">{tx("尚无真实投入，不会显示虚构时长。")}</p>}
  </section>;
}
