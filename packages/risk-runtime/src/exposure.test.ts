import { describe, expect, it } from "vitest";
import { aggregateExposure, estimatedAccessDisruptionScore } from "./exposure";
import type { RiskResult } from "@flood-ai/shared";

function makeResult(cellId: string, riskScore: number): RiskResult {
  return {
    cellId,
    riskScore,
    scoreMeaning: "relative_risk_index",
    riskCategory: "moderate",
    coverageTier: "validated",
    confidenceScore: 71,
    uncertaintyBand: null,
    modelVersion: "test",
    dataVersion: "test",
    rainfallScenarioId: "1in-6h",
    topContributors: [],
    dataCompleteness: { present: [], missing: [] },
  };
}

describe("aggregateExposure", () => {
  it("returns unsupported/zero when no cells have results", () => {
    const stats = aggregateExposure(["a", "b"], new Map());
    expect(stats.coverageTier).toBe("unsupported");
    expect(stats.sampledCellCount).toBe(0);
  });

  it("computes max/mean/p90 correctly over known scores", () => {
    const results = new Map([
      ["a", makeResult("a", 10)],
      ["b", makeResult("b", 50)],
      ["c", makeResult("c", 90)],
    ]);
    const stats = aggregateExposure(["a", "b", "c"], results);
    expect(stats.maxRiskScore).toBe(90);
    expect(stats.sampledCellCount).toBe(3);
    expect(stats.meanRiskScore).toBeCloseTo(50, 0);
  });

  it("excludes unsupported cells rather than treating them as zero", () => {
    const results = new Map([
      ["a", makeResult("a", 80)],
      ["b", { ...makeResult("b", 0), coverageTier: "unsupported" as const }],
    ]);
    const stats = aggregateExposure(["a", "b"], results);
    expect(stats.sampledCellCount).toBe(1);
    expect(stats.maxRiskScore).toBe(80);
  });

  it("access-disruption score stays within 0-100", () => {
    const stats = aggregateExposure(["a"], new Map([["a", makeResult("a", 100)]]));
    const score = estimatedAccessDisruptionScore(stats);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
