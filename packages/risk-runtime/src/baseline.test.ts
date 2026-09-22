import { describe, expect, it } from "vitest";
import { computeBaselineRisk } from "./baseline";
import type { RiskFeatures } from "@flood-ai/shared";

const baseFeatures: RiskFeatures = {
  cellId: "cell-test-1",
  centroid: [-73.73, 40.95],
  coverageTier: "validated",
  elevationM: 5,
  slopeDegrees: 2,
  landCoverClass: 22,
  imperviousPct: 40,
  distanceToWaterM: 50,
  distanceToRoadM: 20,
  femaSfha: true,
  relativeElevationZ: -1.5,
};

const opts = { rainfallTotalInches: 2, rainfallScenarioId: "2in-6h", dataVersion: "test-v1" };

describe("computeBaselineRisk", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeBaselineRisk(baseFeatures, opts);
    const b = computeBaselineRisk(baseFeatures, opts);
    expect(a).toEqual(b);
  });

  it("keeps riskScore within 0-100", () => {
    const r = computeBaselineRisk(baseFeatures, opts);
    expect(r.riskScore).toBeGreaterThanOrEqual(0);
    expect(r.riskScore).toBeLessThanOrEqual(100);
  });

  it("keeps confidenceScore within 0-100", () => {
    const r = computeBaselineRisk(baseFeatures, opts);
    expect(r.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(r.confidenceScore).toBeLessThanOrEqual(100);
  });

  it("never predicts for unsupported cells", () => {
    const r = computeBaselineRisk({ ...baseFeatures, coverageTier: "unsupported" }, opts);
    expect(r.coverageTier).toBe("unsupported");
    expect(r.riskScore).toBe(0);
    expect(r.topContributors).toHaveLength(0);
  });

  it("increasing rainfall cannot decrease risk score", () => {
    const low = computeBaselineRisk(baseFeatures, { ...opts, rainfallTotalInches: 1 });
    const high = computeBaselineRisk(baseFeatures, { ...opts, rainfallTotalInches: 6 });
    expect(high.riskScore).toBeGreaterThanOrEqual(low.riskScore);
  });

  it("moving closer to water cannot decrease risk score", () => {
    const far = computeBaselineRisk({ ...baseFeatures, distanceToWaterM: 500 }, opts);
    const near = computeBaselineRisk({ ...baseFeatures, distanceToWaterM: 0 }, opts);
    expect(near.riskScore).toBeGreaterThanOrEqual(far.riskScore);
  });

  it("reduces confidence rather than fabricating a score when a factor is missing", () => {
    const full = computeBaselineRisk(baseFeatures, opts);
    const missingSlope = computeBaselineRisk({ ...baseFeatures, slopeDegrees: null }, opts);
    expect(missingSlope.confidenceScore).toBeLessThan(full.confidenceScore);
    expect(missingSlope.dataCompleteness.missing).toContain("lowSlope");
    expect(missingSlope.riskScore).toBeGreaterThanOrEqual(0);
  });

  it("always reports the two structurally-missing factors", () => {
    const r = computeBaselineRisk(baseFeatures, opts);
    expect(r.dataCompleteness.missing).toEqual(
      expect.arrayContaining(["flowAccumulation", "soilInfiltration"]),
    );
  });

  it("assigns category thresholds consistently with the score", () => {
    const r = computeBaselineRisk(baseFeatures, opts);
    if (r.riskScore < 20) expect(r.riskCategory).toBe("minimal");
    else if (r.riskScore < 40) expect(r.riskCategory).toBe("low");
    else if (r.riskScore < 60) expect(r.riskCategory).toBe("moderate");
    else if (r.riskScore < 80) expect(r.riskCategory).toBe("high");
    else expect(r.riskCategory).toBe("very_high");
  });
});
