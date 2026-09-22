import { BASELINE_WEIGHTS_VERSION, type CellDelta, type Intervention, type RiskFeatures, type ScenarioDelta } from "@flood-ai/shared";
import { computeBaselineRisk, type BaselineOptions } from "./baseline";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Spec section 8.1: intervention effects are explicit, bounded feature
 * transforms, applied before re-running the SAME risk engine — never a raw
 * score subtraction. Each transform is a pure function of (features,
 * intervention, distance) so it stays testable and auditable. */
export function applyInterventionToFeatures(
  features: RiskFeatures,
  intervention: Intervention,
  distanceM: number,
): { features: RiskFeatures; modified: (keyof RiskFeatures)[] } {
  const r = intervention.influenceRadiusM;
  if (distanceM > r * 1.5 || features.coverageTier === "unsupported") {
    return { features, modified: [] };
  }

  const strength = clamp01(intervention.effectStrength);
  // Linear falloff from full strength at the geometry to zero at 1x radius.
  const withinCore = distanceM <= r;
  const falloff = withinCore ? clamp01(1 - distanceM / r) : 0;
  const modified: (keyof RiskFeatures)[] = [];
  const next: RiskFeatures = { ...features };

  switch (intervention.type) {
    case "proposed_drain":
    case "drain_repair": {
      // A drain conveys water away -- modeled as reducing local flow
      // accumulation within the core influence radius. Never below 0.
      if (withinCore && next.flowAccumulation != null) {
        next.flowAccumulation = Math.max(0, next.flowAccumulation * (1 - strength * falloff));
        modified.push("flowAccumulation");
      }
      break;
    }
    case "flood_barrier": {
      if (withinCore && next.distanceToWaterM != null) {
        // Protected side: effectively pushes the water edge further away.
        next.distanceToWaterM = next.distanceToWaterM + strength * falloff * 200;
        modified.push("distanceToWaterM");
      } else if (!withinCore && next.flowAccumulation != null) {
        // Documented displacement shadow: water excluded from the protected
        // core has to go somewhere. Cells in the (r, 1.5r] ring get a
        // bounded flow-accumulation INCREASE -- this is what makes
        // displacement visible instead of hidden (spec invariant).
        const shadowFalloff = clamp01(1 - (distanceM - r) / (r * 0.5));
        next.flowAccumulation = next.flowAccumulation + strength * shadowFalloff * 50;
        modified.push("flowAccumulation");
      }
      break;
    }
    case "road_repair": {
      if (withinCore && next.slopeDegrees != null) {
        // Regrading/drainage repair reduces the local flat-spot/low-point
        // proxy -- modeled as a bounded slope increase (less pooling).
        next.slopeDegrees = next.slopeDegrees + strength * falloff * 3;
        modified.push("slopeDegrees");
      }
      break;
    }
    case "permeable_surface": {
      if (withinCore && next.imperviousPct != null) {
        next.imperviousPct = Math.max(0, next.imperviousPct * (1 - strength * falloff));
        modified.push("imperviousPct");
      }
      break;
    }
  }

  return { features: next, modified };
}

export function computeScenarioDelta(
  scenarioId: string,
  intervention: Intervention,
  cellsWithDistance: { features: RiskFeatures; distanceM: number }[],
  options: BaselineOptions,
): ScenarioDelta {
  const cellDeltas: CellDelta[] = [];

  for (const { features, distanceM } of cellsWithDistance) {
    if (distanceM > intervention.influenceRadiusM * 1.5) continue;
    const before = computeBaselineRisk(features, options);
    const { features: modifiedFeatures, modified } = applyInterventionToFeatures(features, intervention, distanceM);
    if (modified.length === 0) continue;
    const after = computeBaselineRisk(modifiedFeatures, options);

    cellDeltas.push({
      cellId: features.cellId,
      beforeRiskScore: before.riskScore,
      afterRiskScore: after.riskScore,
      scoreDelta: after.riskScore - before.riskScore,
      modifiedFeatures: modified,
    });
  }

  const improved = cellDeltas.filter((d) => d.scoreDelta < 0).length;
  const worsened = cellDeltas.filter((d) => d.scoreDelta > 0).length;
  const unchanged = cellDeltas.length - improved - worsened;
  const meanScoreDelta = cellDeltas.length
    ? cellDeltas.reduce((s, d) => s + d.scoreDelta, 0) / cellDeltas.length
    : 0;
  const maxScoreIncrease = cellDeltas.reduce((m, d) => Math.max(m, d.scoreDelta), 0);

  return {
    scenarioId,
    intervention,
    rainfallScenarioId: options.rainfallScenarioId,
    cellDeltas,
    summary: {
      cellsImproved: improved,
      cellsWorsened: worsened,
      cellsUnchanged: unchanged,
      meanScoreDelta: Math.round(meanScoreDelta * 10) / 10,
      maxScoreIncrease,
    },
    assumptions: [
      `Influence radius: ${intervention.influenceRadiusM} m`,
      `Effect strength: ${intervention.effectStrength} (0-1 planning assumption, source: ${intervention.assumptionSource})`,
      "Effects are bounded feature transforms re-run through the same risk engine, not a direct score edit.",
    ],
    dataGaps: worsened > 0
      ? ["Some nearby cells show increased modeled risk (possible displacement) -- reviewed, not hidden."]
      : [],
    modelVersion: options.modelVersion ?? BASELINE_WEIGHTS_VERSION,
    dataVersion: options.dataVersion,
    generatedAt: new Date().toISOString(),
  };
}
