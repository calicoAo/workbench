import { Moon, Pencil, X } from "lucide-react";
import { createPortal } from "react-dom";
import { type FormEvent, useEffect, useRef, useState } from "react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type SleepRecord = {
  id: number;
  sleepDate?: string;
  sleepStart: string;
  wakeTime: string;
  recordTimezone?: string;
  durationMinutes: number;
  qualityScore: number | null;
};

type SleepDraft = {
  sleepStartDate: string;
  sleepStartTime: string;
  wakeDate: string;
  wakeTime: string;
  qualityScore: string;
};

type SleepState = {
  date: string;
  initialized: boolean;
  editorOpen: boolean;
  draft: SleepDraft;
};

export function SleepFeature({
  request,
  selectedDate,
  record,
  snapshotReady,
  recordTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  openEditorSignal,
  initiallyOpen = false,
  onError,
  onChanged
}: {
  request: Request;
  selectedDate: string;
  record: SleepRecord | null;
  snapshotReady: boolean;
  recordTimezone?: string;
  openEditorSignal?: number;
  initiallyOpen?: boolean;
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [state, setState] = useState<SleepState>(() => stateFromSnapshot(selectedDate, snapshotReady, record));
  const initialSignal = useRef(openEditorSignal);
  useEffect(() => { if (initiallyOpen) setState((current) => ({ ...current, editorOpen: true })); }, [initiallyOpen]);

  let currentState = state;
  if (state.date !== selectedDate || (!state.initialized && snapshotReady)) {
    currentState = stateFromSnapshot(selectedDate, snapshotReady, record);
    setState(currentState);
  }

  useEffect(() => { if (openEditorSignal !== undefined && openEditorSignal !== initialSignal.current) { initialSignal.current = openEditorSignal; setState((current) => ({ ...current, editorOpen: true })); } }, [openEditorSignal]);

  function updateDraft(patch: Partial<SleepDraft>) {
    setState((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const draft = currentState.draft;
    try {
      await request("/api/sleep-records", {
        method: "POST",
        body: JSON.stringify({
          sleepStartDate: draft.sleepStartDate,
          sleepStartTime: draft.sleepStartTime,
          wakeDate: draft.wakeDate,
          wakeTime: draft.wakeTime,
          recordTimezone,
          qualityScore: Number(draft.qualityScore)
        })
      });
      setState((current) => ({ ...current, editorOpen: false }));
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  const disabled = !currentState.initialized;
  return (
    <>
      <section className="glass-panel p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-mint-700"><Moon size={17} /></span>
            <h2 className="section-title">睡眠</h2>
          </div>
          <button
            className="icon-button h-8 w-8"
            aria-label="编辑睡眠"
            disabled={disabled}
            type="button"
            onClick={() => setState((current) => ({ ...current, editorOpen: true }))}
          >
            <Pencil size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SleepMetric label="时长" value={record ? `${(record.durationMinutes / 60).toFixed(1)}h` : "0h"} />
          <SleepMetric label="质量" value={record?.qualityScore ? `${record.qualityScore}/5` : "-/5"} />
        </div>
        <p className="mt-2 truncate text-[11px] text-soft">
          {record ? `${timeText(record.sleepStart, record.recordTimezone)} - ${timeText(record.wakeTime, record.recordTimezone)}` : disabled ? "加载中..." : "还没有睡眠记录"}
        </p>
      </section>

      {currentState.editorOpen && (
        <SleepEditDialog
          draft={currentState.draft}
          recordTimezone={recordTimezone}
          onChange={updateDraft}
          onClose={() => setState((current) => ({ ...current, editorOpen: false }))}
          onSubmit={save}
        />
      )}
    </>
  );
}

function SleepEditDialog({
  draft,
  recordTimezone,
  onChange,
  onClose,
  onSubmit
}: {
  draft: SleepDraft;
  recordTimezone: string;
  onChange: (patch: Partial<SleepDraft>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal-shell" onMouseDown={(event) => event.stopPropagation()}>
        <form className="time-modal" onSubmit={onSubmit}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">编辑睡眠</h3>
            <button className="icon-button h-8 w-8" type="button" aria-label="关闭" onClick={onClose}>
              <X size={15} />
            </button>
          </div>

          <div className="sleep-date-grid">
            <label className="text-[11px] text-soft">
              入睡日期
              <input aria-label="入睡日期" className="field mt-1" type="date" value={draft.sleepStartDate} onChange={(event) => onChange({ sleepStartDate: event.target.value })} />
            </label>
            <label className="text-[11px] text-soft">
              入睡时间
              <input aria-label="入睡时间" className="field mt-1" type="time" value={draft.sleepStartTime} onChange={(event) => onChange({ sleepStartTime: event.target.value, sleepStartDate: event.target.value > draft.wakeTime ? previousDate(draft.wakeDate) : draft.wakeDate })} />
            </label>
            <label className="text-[11px] text-soft">
              醒来日期（业务日）
              <input aria-label="醒来日期" className="field mt-1" type="date" value={draft.wakeDate} onChange={(event) => onChange({ wakeDate: event.target.value })} />
            </label>
            <label className="text-[11px] text-soft">
              醒来时间
              <input aria-label="醒来时间" className="field mt-1" type="time" value={draft.wakeTime} onChange={(event) => onChange({ wakeTime: event.target.value, sleepStartDate: draft.sleepStartTime > event.target.value ? previousDate(draft.wakeDate) : draft.wakeDate })} />
            </label>
          </div>

          <label className="mt-2 block text-[11px] text-soft">
            记录时区
            <input aria-label="记录时区" className="field mt-1" readOnly value={recordTimezone} />
          </label>

          <select aria-label="睡眠质量" className="field mt-2" value={draft.qualityScore} onChange={(event) => onChange({ qualityScore: event.target.value })}>
            <option value="5">质量 5</option>
            <option value="4">质量 4</option>
            <option value="3">质量 3</option>
            <option value="2">质量 2</option>
            <option value="1">质量 1</option>
          </select>

          <div className="mt-4 flex justify-end gap-2">
            <button className="icon-button w-auto px-4" type="button" aria-label="取消" onClick={onClose}>
              取消
            </button>
            <button className="primary-button px-5" type="submit">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function SleepMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <p className="text-[11px] text-soft">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{value}</p>
    </div>
  );
}

function stateFromSnapshot(date: string, snapshotReady: boolean, record: SleepRecord | null): SleepState {
  return {
    date,
    initialized: snapshotReady,
    editorOpen: false,
    draft: snapshotReady ? draftFromRecord(record, date) : emptyDraft(date)
  };
}

function draftFromRecord(record: SleepRecord | null, wakeDate: string): SleepDraft {
  return {
    sleepStartDate: record ? dateText(record.sleepStart, record.recordTimezone) : previousDate(wakeDate),
    sleepStartTime: record ? timeText(record.sleepStart, record.recordTimezone) : "23:30",
    wakeDate: record?.sleepDate ?? wakeDate,
    wakeTime: record ? timeText(record.wakeTime, record.recordTimezone) : "07:30",
    qualityScore: String(record?.qualityScore ?? 4)
  };
}

function emptyDraft(wakeDate: string): SleepDraft {
  return { sleepStartDate: previousDate(wakeDate), sleepStartTime: "23:30", wakeDate, wakeTime: "07:30", qualityScore: "4" };
}

function timeText(value: string, timezone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function dateText(value: string, timezone?: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value.slice(0, 10); const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`; }
function previousDate(value: string) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
