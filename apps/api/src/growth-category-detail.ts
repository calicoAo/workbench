import { growthConfiguration, growthPeriod, rejectForeignGrowthCategory } from "./growth.js";
import { growthContributions } from "./growth-contributions.js";
import { actualTimeForRange, actualTimeSourceBounds, type ActualTimeEntry } from "./execution-read-model.js";
import { completionEventsForRange, taskContributionMetadata } from "./task-completion.js";
import { parseUtcDateTime } from "./time.js";
import { AttributionStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";

/** Read-only Growth projection. The same eligible fact set and aggregator as G1; bounded detail payloads. */
export async function growthCategoryDetail(userId: number, categoryRef: string, days: 7 | 30 | 90, to?: string, options: { taskRef?: string; cursor?: string; limit?: number } = {}) {
  if (categoryRef.startsWith("category:")) await rejectForeignGrowthCategory(userId, Number(categoryRef.slice(9)));
  const period = await growthPeriod(userId, days, to);
  const [allEntries, allEvents, config] = await Promise.all([
    actualTimeForRange(userId, period.from, period.to, period.timezone),
    completionEventsForRange(userId, period.from, period.to), growthConfiguration(userId)
  ]);
  const aggregate = (entries: ActualTimeEntry[], events: typeof allEvents) => growthContributions(entries, events, config.categories, config.dimensions, period);
  const category = aggregate(allEntries, allEvents).categoryBreakdown.find((row) => row.categoryRef === categoryRef);
  // Unavailable historic identities are permitted only when this user's canonical facts attest them.
  if (!category) throw new BusinessError(ErrorCode.NOT_FOUND, "category contribution not found", 404);
  const entries = allEntries.filter((entry) => (entry.categoryIdAtOccurrence !== null ? `category:${entry.categoryIdAtOccurrence}` : entry.categoryAttributionStatus === AttributionStatus.UNKNOWN ? "unknown" : "unassigned") === categoryRef);
  const events = allEvents.filter((event) => (event.categoryIdAtOccurrence !== null ? `category:${event.categoryIdAtOccurrence}` : "unassigned") === categoryRef);
  const taskRefOf = (id: number | null) => id === null ? "unassigned" : `task:${id}`;
  const ids = [...new Set([...entries.map((e) => taskRefOf(e.taskId)), ...events.map((e) => taskRefOf(e.taskId))])].sort();
  const limit = options.limit ?? 20;
  const scope = JSON.stringify([userId, categoryRef, period, options.taskRef ?? null, limit]);
  let after = "";
  if (options.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(options.cursor, "base64url").toString());
      if (parsed.scope !== scope || typeof parsed.after !== "string") throw new Error();
      after = parsed.after;
    } catch { throw new BusinessError(ErrorCode.PARAM_ERROR, "invalid contribution cursor"); }
  }
  const page = <T extends { key: string }>(items: T[]) => {
    const eligible = items.sort((a, b) => a.key.localeCompare(b.key)).filter((item) => item.key.localeCompare(after) > 0);
    const rows = eligible.slice(0, limit);
    return { rows, nextCursor: eligible.length > limit ? Buffer.from(JSON.stringify({ scope, after: rows.at(-1)!.key })).toString("base64url") : null };
  };
  const taskEntries = (ref: string) => entries.filter((entry) => taskRefOf(entry.taskId) === ref);
  const taskEvents = (ref: string) => events.filter((event) => taskRefOf(event.taskId) === ref);
  const dimension = config.dimensions.find((d) => d.dimensionKey === category.dimensionKey) ?? null;
  if (!options.taskRef) {
    const selected = page(ids.map((ref) => ({ key: ref })));
    const metadata = await taskContributionMetadata(userId, selected.rows.flatMap(({ key }) => key === "unassigned" ? [] : [Number(key.slice(5))]));
    return { period, category, dimension, tasks: selected.rows.map(({ key }) => {
      const taskId = key === "unassigned" ? null : Number(key.slice(5));
      const task = metadata.find((t) => t.id === taskId);
      return { taskRef: key, taskId, title: task?.title ?? taskEntries(key)[0]?.title ?? taskEvents(key)[0]?.title ?? null, available: Boolean(task && !task.deletedAt), ...aggregate(taskEntries(key), taskEvents(key)).summary };
    }), nextCursor: selected.nextCursor, task: null, executions: [], completions: [], sessions: [] };
  }
  const ref = options.taskRef;
  if (!ids.includes(ref)) throw new BusinessError(ErrorCode.NOT_FOUND, "task contribution not found", 404);
  const work = taskEntries(ref), completion = taskEvents(ref);
  const groups = new Map<string, ActualTimeEntry[]>();
  for (const entry of work) { const key = `${entry.source}:${entry.sourceId}`; const group = groups.get(key) ?? []; group.push(entry); groups.set(key, group); }
  const selected = page([
    ...[...groups].map(([key]) => ({ key, kind: "EXECUTION" as const })),
    ...completion.map((event) => ({ key: `COMPLETION:${event.id}`, kind: "COMPLETION" as const }))
  ]);
  const references = selected.rows.filter((row) => row.kind === "EXECUTION").map((row) => groups.get(row.key)![0]);
  const [bounds, metadata] = await Promise.all([actualTimeSourceBounds(userId, references), taskContributionMetadata(userId, ref === "unassigned" ? [] : [Number(ref.slice(5))])]);
  const executions = references.map((entry) => {
    const slices = groups.get(`${entry.source}:${entry.sourceId}`)!;
    const full = bounds.get(`${entry.source}:${entry.sourceId}`);
    // Concurrent removal: don't relabel a clipped projection as a full real interval.
    return { source: entry.source, sourceId: entry.sourceId, timerSessionId: entry.timerSessionId,
      startedAt: full?.startedAt.toISOString() ?? null, endedAt: full?.endedAt.toISOString() ?? null,
      fullDurationSeconds: full ? (full.endedAt.getTime() - full.startedAt.getTime()) / 1000 : null,
      attributedSeconds: slices.reduce((sum, slice) => sum + slice.durationSeconds, 0), recordTimezone: entry.recordTimezone,
      slices: slices.map((slice) => ({ businessDate: slice.businessDate, startedAt: slice.startedAt.toISOString(), endedAt: slice.endedAt.toISOString(), durationSeconds: slice.durationSeconds })) };
  });
  const sessions = [...new Map(references.filter((entry) => entry.timerSessionId !== null).map((entry) => [entry.timerSessionId!, { id: entry.timerSessionId!, note: entry.sessionNote, startedAt: entry.sessionStartedAt?.toISOString() ?? null, endedAt: entry.sessionEndedAt?.toISOString() ?? null }])).values()];
  return { period, category, dimension, tasks: [], nextCursor: selected.nextCursor,
    task: { taskRef: ref, taskId: ref === "unassigned" ? null : Number(ref.slice(5)), title: metadata[0]?.title ?? work[0]?.title ?? completion[0]?.title ?? null, available: Boolean(metadata[0] && !metadata[0].deletedAt), completionNote: metadata[0]?.completionNote ?? null, ...aggregate(work, completion).summary },
    executions, sessions,
    completions: selected.rows.filter((row) => row.kind === "COMPLETION").map((row) => { const event = completion.find((e) => `COMPLETION:${e.id}` === row.key)!; return { id: event.id, occurredAt: parseUtcDateTime(event.occurredAt).toISOString(), businessDate: event.businessDate, lifecycleVersion: event.lifecycleVersion }; }) };
}
