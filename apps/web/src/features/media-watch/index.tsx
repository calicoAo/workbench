import { createContext, type FormEvent, type ReactNode, useContext, useState } from "react";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type MediaWatchRecord = {
  id?: number;
  watchDate: string;
  title: string | null;
  episode: string | null;
  note: string | null;
};

type MediaWatchDraft = {
  title: string;
  episode: string;
  note: string;
};

type MediaWatchState = {
  date: string;
  initialized: boolean;
  draft: MediaWatchDraft;
};

type ContextValue = {
  disabled: boolean;
  draft: MediaWatchDraft;
  updateDraft: (patch: Partial<MediaWatchDraft>) => void;
  save: (event: FormEvent) => Promise<void>;
};

const MediaWatchContext = createContext<ContextValue | null>(null);

export function MediaWatchFeature({
  children,
  request,
  selectedDate,
  initialRecord,
  snapshotReady,
  disabled = false,
  onError,
  onChanged
}: {
  children: ReactNode;
  request: Request;
  selectedDate: string;
  initialRecord: MediaWatchRecord | null;
  snapshotReady: boolean;
  disabled?: boolean;
  onError: (message: string, title?: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [state, setState] = useState<MediaWatchState>(() => stateFromSnapshot(selectedDate, snapshotReady, initialRecord));

  let currentState = state;
  if (state.date !== selectedDate || (!state.initialized && snapshotReady)) {
    currentState = stateFromSnapshot(selectedDate, snapshotReady, initialRecord);
    setState(currentState);
  }

  function updateDraft(patch: Partial<MediaWatchDraft>) {
    setState((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const draft = currentState.draft;
    try {
      const record = await request<MediaWatchRecord>("/api/media-watch-records", {
        method: "POST",
        body: JSON.stringify({ watchDate: selectedDate, ...draft })
      });
      setState({ date: selectedDate, initialized: true, draft: draftFromRecord(record) });
      await onChanged();
    } catch (error) {
      onError(errorMessage(error), "操作没有成功");
    }
  }

  return (
    <MediaWatchContext.Provider
      value={{
        disabled: disabled || !currentState.initialized,
        draft: currentState.draft,
        updateDraft,
        save
      }}
    >
      {children}
    </MediaWatchContext.Provider>
  );
}

export function MediaWatchEditor() {
  const feature = useMediaWatch();
  return (
    <form className="space-y-2" onSubmit={feature.save}>
      <input
        aria-label="影视标题"
        className="field"
        disabled={feature.disabled}
        placeholder="今天在看什么剧/电影"
        value={feature.draft.title}
        onChange={(event) => feature.updateDraft({ title: event.target.value })}
      />
      <input
        aria-label="影视进度"
        className="field"
        disabled={feature.disabled}
        placeholder="集数/进度，比如第 12 集"
        value={feature.draft.episode}
        onChange={(event) => feature.updateDraft({ episode: event.target.value })}
      />
      <textarea
        aria-label="影视备注"
        className="journal-input min-h-20"
        disabled={feature.disabled}
        placeholder="一句备注：剧情、氛围、适合搭配什么任务..."
        value={feature.draft.note}
        onChange={(event) => feature.updateDraft({ note: event.target.value })}
      />
      <button className="primary-button w-full px-4" disabled={feature.disabled} type="submit">
        保存
      </button>
    </form>
  );
}

function useMediaWatch() {
  const context = useContext(MediaWatchContext);
  if (!context) throw new Error("MediaWatchEditor must be rendered inside MediaWatchFeature");
  return context;
}

function stateFromSnapshot(date: string, snapshotReady: boolean, record: MediaWatchRecord | null): MediaWatchState {
  return {
    date,
    initialized: snapshotReady,
    draft: snapshotReady ? draftFromRecord(record) : emptyDraft()
  };
}

function draftFromRecord(record: MediaWatchRecord | null): MediaWatchDraft {
  return {
    title: record?.title ?? "",
    episode: record?.episode ?? "",
    note: record?.note ?? ""
  };
}

function emptyDraft(): MediaWatchDraft {
  return { title: "", episode: "", note: "" };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
