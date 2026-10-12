import { AttributionStatus } from "./enums.js";
import type { ActualTimeEntry } from "./execution-read-model.js";
import { splitByBusinessDay } from "./time.js";

export type GrowthContributionMetrics = {
  actualSeconds: number;
  actualMinutes: number;
  completionEventCount: number;
  closedSegmentCount: number;
};
export type GrowthContributionTrend = GrowthContributionMetrics & { from: string; to: string };
export type GrowthCategoryContribution = GrowthContributionMetrics & {
  categoryRef: string;
  categoryId: number | null;
  attribution: "CATEGORY" | "UNASSIGNED" | "UNKNOWN";
  availability: "AVAILABLE" | "UNAVAILABLE" | "NOT_APPLICABLE";
  name: string | null;
  color: string | null;
  icon: string | null;
  enabled: number | null;
  dimensionKey: string | null;
  resolvedDimensionKey: string | null;
  unmappedReason: "NO_CATEGORY" | "UNKNOWN_ATTRIBUTION" | "CATEGORY_UNAVAILABLE" | "NO_MAPPING" | "DIMENSION_DISABLED" | "DIMENSION_UNAVAILABLE" | null;
  lastActivityDate: string | null;
  trend: GrowthContributionTrend[];
};

type Category = { id: number; name: string; color: string; icon: string | null; enabled: number; dimensionKey: string | null };
type Dimension = { dimensionKey: string; enabled: number };
type Completion = { categoryIdAtOccurrence: number | null; businessDate: string };
type Accumulator = { seconds: number; completions: number; segments: Set<number>; lastActivityDate: string | null };
const empty = (): Accumulator => ({ seconds: 0, completions: 0, segments: new Set(), lastActivityDate: null });
function metrics(value: Accumulator): GrowthContributionMetrics {
  return { actualSeconds: value.seconds, actualMinutes: Math.floor(value.seconds / 60), completionEventCount: value.completions, closedSegmentCount: value.segments.size };
}
function merge(target: Accumulator, source: Accumulator) {
  target.seconds += source.seconds;
  target.completions += source.completions;
  for (const id of source.segments) target.segments.add(id);
  if (source.lastActivityDate && (!target.lastActivityDate || source.lastActivityDate > target.lastActivityDate)) target.lastActivityDate = source.lastActivityDate;
}
function active(value: Accumulator, date: string) {
  if (!value.lastActivityDate || date > value.lastActivityDate) value.lastActivityDate = date;
}
function addDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

/** Growth-only report buckets. Source attribution, timestamps, Session notes and reward facts are untouched. */
export function growthContributions(entries: ActualTimeEntry[], completions: Completion[], categories: Category[], dimensions: Dimension[], period: { days: 7 | 30 | 90; from: string; timezone: string }) {
  const bucketDays = period.days === 7 ? 1 : period.days === 30 ? 5 : 10;
  const ranges = Array.from({ length: Math.ceil(period.days / bucketDays) }, (_, index) => ({
    from: addDate(period.from, index * bucketDays),
    to: addDate(period.from, Math.min(period.days - 1, (index + 1) * bucketDays - 1))
  }));
  const dimensionByKey = new Map(dimensions.map((dimension) => [dimension.dimensionKey, dimension]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const groups = new Map<string, { row: Omit<GrowthCategoryContribution, keyof GrowthContributionMetrics | "lastActivityDate" | "trend">; total: Accumulator; buckets: Accumulator[] }>();

  function group(id: number | null, unknown = false) {
    const ref = id !== null ? `category:${id}` : unknown ? "unknown" : "unassigned";
    const existing = groups.get(ref);
    if (existing) return existing;
    const category = id !== null ? categoryById.get(id) : undefined;
    const key = category?.dimensionKey ?? null;
    const dimension = key ? dimensionByKey.get(key) : undefined;
    const resolvedDimensionKey = dimension?.enabled ? key : null;
    const unmappedReason: GrowthCategoryContribution["unmappedReason"] = id === null ? (unknown ? "UNKNOWN_ATTRIBUTION" : "NO_CATEGORY")
      : !category ? "CATEGORY_UNAVAILABLE" : !key ? "NO_MAPPING" : !dimension ? "DIMENSION_UNAVAILABLE" : !dimension.enabled ? "DIMENSION_DISABLED" : null;
    const value = {
      row: {
        categoryRef: ref, categoryId: id,
        attribution: id !== null ? "CATEGORY" as const : unknown ? "UNKNOWN" as const : "UNASSIGNED" as const,
        availability: category ? "AVAILABLE" as const : id !== null ? "UNAVAILABLE" as const : "NOT_APPLICABLE" as const,
        name: category?.name ?? null, color: category?.color ?? null, icon: category?.icon ?? null, enabled: category?.enabled ?? null,
        dimensionKey: key, resolvedDimensionKey, unmappedReason
      },
      total: empty(), buckets: ranges.map(empty)
    };
    groups.set(ref, value);
    return value;
  }
  // Zero-activity and disabled definitions remain discoverable without including Task detail payloads.
  for (const category of categories) group(category.id);
  function bucketIndex(date: string) { return ranges.findIndex((range) => date >= range.from && date <= range.to); }

  for (const entry of entries) {
    const target = group(entry.categoryIdAtOccurrence, entry.categoryAttributionStatus === AttributionStatus.UNKNOWN);
    // actualTimeForRange has already clipped the UTC interval. Re-split only its reporting projection.
    for (const slice of splitByBusinessDay(entry.startedAt, entry.endedAt, period.timezone)) {
      const index = bucketIndex(slice.businessDate);
      if (index < 0) continue;
      const seconds = (slice.end.getTime() - slice.start.getTime()) / 1000;
      for (const value of [target.total, target.buckets[index]]) {
        value.seconds += seconds;
        if (entry.source === "TIMER_SEGMENT") value.segments.add(entry.sourceId);
        active(value, slice.businessDate);
      }
    }
  }
  for (const event of completions) {
    const index = bucketIndex(event.businessDate);
    if (index < 0) continue;
    // CompletionEvent null has no attribution-status snapshot; no legacy provenance is inferred.
    const target = group(event.categoryIdAtOccurrence);
    for (const value of [target.total, target.buckets[index]]) { value.completions += 1; active(value, event.businessDate); }
  }

  const overall = empty(), mapped = empty(), unmapped = empty();
  const byDimension = new Map(dimensions.filter((dimension) => dimension.enabled).map((dimension) => [dimension.dimensionKey, empty()]));
  const trendTotals = ranges.map(empty);
  const categoryBreakdown = [...groups.values()].map(({ row, total, buckets }): GrowthCategoryContribution => {
    merge(overall, total);
    if (row.resolvedDimensionKey) {
      merge(mapped, total);
      merge(byDimension.get(row.resolvedDimensionKey)!, total);
    } else merge(unmapped, total);
    buckets.forEach((bucket, index) => merge(trendTotals[index], bucket));
    return { ...row, ...metrics(total), lastActivityDate: total.lastActivityDate, trend: buckets.map((bucket, index) => ({ ...ranges[index], ...metrics(bucket) })) };
  });
  return {
    summary: { ...metrics(overall), mappedActualSeconds: mapped.seconds, mappedActualMinutes: Math.floor(mapped.seconds / 60) },
    dimensions: new Map([...byDimension].map(([key, total]) => [key, { ...metrics(total), lastActivityDate: total.lastActivityDate }])),
    unmapped: { ...metrics(unmapped), lastActivityDate: unmapped.lastActivityDate },
    trend: trendTotals.map((total, index) => ({ ...ranges[index], ...metrics(total) })),
    categoryBreakdown
  };
}
