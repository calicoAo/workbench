export type GrowthDimension = { id: number; dimensionKey: string; name: string; iconKey: string | null; color: string; sortOrder: number; enabled: number; version: number };
export type GrowthCategory = { id: number; name: string; color: string; icon: string | null; dimensionKey: string | null; enabled: number };
export type GrowthContributionMetrics = { actualSeconds: number; actualMinutes: number; completionEventCount: number; closedSegmentCount: number };
export type GrowthContributionTrend = GrowthContributionMetrics & { from: string; to: string };
export type GrowthCategoryContribution = GrowthContributionMetrics & {
  categoryRef: string; categoryId: number | null; attribution: "CATEGORY" | "UNASSIGNED" | "UNKNOWN";
  availability: "AVAILABLE" | "UNAVAILABLE" | "NOT_APPLICABLE";
  name: string | null; color: string | null; icon: string | null; enabled: number | null;
  dimensionKey: string | null; resolvedDimensionKey: string | null;
  unmappedReason: "NO_CATEGORY" | "UNKNOWN_ATTRIBUTION" | "CATEGORY_UNAVAILABLE" | "NO_MAPPING" | "DIMENSION_DISABLED" | "DIMENSION_UNAVAILABLE" | null;
  lastActivityDate: string | null; trend: GrowthContributionTrend[];
};
export type GrowthOverview = {
  period: { days: 7 | 30 | 90; from: string; to: string; timezone: string };
  hero: { level: number; xpTotal: number; coins: number; xpInLevel: number; xpForNextLevel: number };
  summary: GrowthContributionMetrics & { mappedActualSeconds: number; mappedActualMinutes: number; completedTaskCount: number; habitCompletedCount: number };
  dimensions: Array<Omit<GrowthDimension, "enabled" | "version"> & GrowthContributionMetrics & { share: number; completedTaskCount: number; lastActivityDate: string | null }>;
  trend: Array<GrowthContributionTrend & { completedTaskCount: number; habitCompletedCount: number }>;
  unmapped: GrowthContributionMetrics & { completedTaskCount: number; lastActivityDate: string | null };
  categoryBreakdown: GrowthCategoryContribution[];
  recent: Array<{ id: number; kind: "TASK_COMPLETION"; businessDate: string; title: string; dimensionName: string | null; xpDelta: number }>;
};
export type GrowthConfig = { dimensions: GrowthDimension[]; categories: GrowthCategory[] };
