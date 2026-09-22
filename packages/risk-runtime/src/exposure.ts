import type { ExposureStats, RiskResult } from "@flood-ai/shared";

/** Aggregates real, already-computed cell risk results over a set of nearby
 * cellIds (spec 6.8: max/mean/90th percentile along a road segment or around
 * a facility). Cells with no computed result, or an unsupported coverage
 * tier, are excluded — never coerced to zero. */
export function aggregateExposure(nearCellIds: string[], results: Map<string, RiskResult>): ExposureStats {
  const scores = nearCellIds
    .map((id) => results.get(id))
    .filter((r): r is RiskResult => !!r && r.coverageTier !== "unsupported")
    .map((r) => r.riskScore);

  if (scores.length === 0) {
    return { maxRiskScore: 0, meanRiskScore: 0, p90RiskScore: 0, sampledCellCount: 0, coverageTier: "unsupported" };
  }

  const sorted = [...scores].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const p90Index = Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1);
  const p90 = sorted[p90Index];

  return {
    maxRiskScore: Math.round(max),
    meanRiskScore: Math.round(mean * 10) / 10,
    p90RiskScore: Math.round(p90),
    sampledCellCount: scores.length,
    coverageTier: "validated",
  };
}

/** Estimated access-disruption score: dominated by the worst point along the
 * corridor/around the facility (a single flooded low point can cut access
 * even if the average segment risk is low), per spec 6.8. */
export function estimatedAccessDisruptionScore(stats: ExposureStats): number {
  if (stats.sampledCellCount === 0) return 0;
  return Math.round(0.7 * stats.maxRiskScore + 0.3 * stats.p90RiskScore);
}
