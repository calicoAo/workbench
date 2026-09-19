import { Moon, Pencil, X } from "lucide-react";
import { createPortal } from "react-dom";
import { type FormEvent, useState } from "react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type SleepRecord = {
  id: number;
  sleepDate?: string;
  sleepStart: string;
  wakeTime: string;
  durationMinutes: number;
  qualityScore: number | null;
};

type SleepDraft = {
  sleepStart: string;
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
  onError,
  onChanged
}: {
  request: Request;
  selectedDate: string;
  record: SleepRecord | null;
  snapshotReady: boolean;
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [state, setState] = useState<SleepState>(() => stateFromSnapshot(selectedDate, snapshotReady, record));

  let currentState = state;
  if (state.date !== selectedDate || (!state.initialized && snapshotReady)) {
    currentState = stateFromSnapshot(selectedDate, snapshotReady, record);
    setState(currentState);
  }

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
          sleepDate: selectedDate,
          sleepStart: draft.sleepStart,
          wakeTime: draft.wakeTime,
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
          {record ? `${timeText(record.sleepStart)} - ${timeText(record.wakeTime)}` : disabled ? "加载中..." : "还没有睡眠记录"}
        </p>
      </section>

      {currentState.editorOpen && (
        <SleepEditDialog
          draft={currentState.draft}
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
  onChange,
  onClose,
  onSubmit
}: {
  draft: SleepDraft;
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

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-soft">
              入睡
              <input className="field mt-1" type="time" value={draft.sleepStart} onChange={(event) => onChange({ sleepStart: event.target.value })} />
            </label>
            <label className="text-[11px] text-soft">
              起床
              <input className="field mt-1" type="time" value={draft.wakeTime} onChange={(event) => onChange({ wakeTime: event.target.value })} />
            </label>
          </div>

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
    draft: snapshotReady ? draftFromRecord(record) : emptyDraft()
  };
}

function draftFromRecord(record: SleepRecord | null): SleepDraft {
  return {
    sleepStart: record ? timeText(record.sleepStart) : "23:30",
    wakeTime: record ? timeText(record.wakeTime) : "07:30",
    qualityScore: String(record?.qualityScore ?? 4)
  };
}

function emptyDraft(): SleepDraft {
  return { sleepStart: "23:30", wakeTime: "07:30", qualityScore: "4" };
}

function timeText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 5) : date.toTimeString().slice(0, 5);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
