import { describe, expect, it } from "vitest";
import { applyInterventionToFeatures, computeScenarioDelta } from "./intervention";
import type { Intervention, RiskFeatures } from "@flood-ai/shared";

const cell = (overrides: Partial<RiskFeatures> = {}): RiskFeatures => ({
  cellId: "c1",
  centroid: [-73.73, 40.95],
  coverageTier: "validated",
  elevationM: 5,
  slopeDegrees: 1,
  flowAccumulation: 40,
  landCoverClass: 22,
  imperviousPct: 70,
  distanceToWaterM: 20,
  distanceToRoadM: null,
  femaSfha: true,
  relativeElevationZ: -1.5,
  ...overrides,
});

const opts = { rainfallTotalInches: 2, rainfallScenarioId: "2in-6h", dataVersion: "test-v1" };

const drain: Intervention = {
  id: "int-1",
  type: "proposed_drain",
  geometry: { type: "Point", coordinates: [-73.73, 40.95] },
  influenceRadiusM: 100,
  effectStrength: 0.6,
  label: "Proposed drain",
  assumptionSource: "test",
};

describe("applyInterventionToFeatures", () => {
  it("a drain reduces flow accumulation within radius, never below zero", () => {
    const { features, modified } = applyInterventionToFeatures(cell(), drain, 10);
    expect(modified).toContain("flowAccumulation");
    expect(features.flowAccumulation!).toBeLessThan(cell().flowAccumulation!);
    expect(features.flowAccumulation!).toBeGreaterThanOrEqual(0);
  });

  it("permeable surface cannot increase imperviousPct (its own modified factor)", () => {
    const permeable: Intervention = { ...drain, type: "permeable_surface", effectStrength: 0.5 };
    const { features } = applyInterventionToFeatures(cell({ imperviousPct: 80 }), permeable, 5);
    expect(features.imperviousPct!).toBeLessThanOrEqual(80);
  });

  it("has no effect outside 1.5x the influence radius", () => {
    const { modified } = applyInterventionToFeatures(cell(), drain, 200);
    expect(modified).toHaveLength(0);
  });

  it("a barrier's downstream shadow ring can increase flow accumulation (displacement is visible, not hidden)", () => {
    const barrier: Intervention = { ...drain, type: "flood_barrier", influenceRadiusM: 50, effectStrength: 0.8 };
    const { features, modified } = applyInterventionToFeatures(cell(), barrier, 60); // just outside core radius
    expect(modified).toContain("flowAccumulation");
    expect(features.flowAccumulation!).toBeGreaterThan(cell().flowAccumulation!);
  });
});

describe("computeScenarioDelta", () => {
  it("reports both improved and worsened cells for a barrier (never hides displacement)", () => {
    const barrier: Intervention = {
      id: "b1",
      type: "flood_barrier",
      geometry: { type: "LineString", coordinates: [[-73.73, 40.95], [-73.731, 40.951]] },
      influenceRadiusM: 50,
      effectStrength: 0.8,
      label: "Barrier",
      assumptionSource: "test",
    };
    const cells = [
      { features: cell({ cellId: "protected" }), distanceM: 10 },
      { features: cell({ cellId: "shadow", flowAccumulation: 5 }), distanceM: 60 },
    ];
    const delta = computeScenarioDelta("scenario-1", barrier, cells, opts);
    expect(delta.cellDeltas.length).toBe(2);
    expect(delta.summary.cellsImproved).toBeGreaterThan(0);
    expect(delta.summary.cellsWorsened).toBeGreaterThan(0);
    expect(delta.dataGaps.length).toBeGreaterThan(0);
  });
});
