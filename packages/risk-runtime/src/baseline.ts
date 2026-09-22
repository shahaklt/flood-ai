import {
  BASELINE_WEIGHTS,
  BASELINE_WEIGHTS_VERSION,
  CATEGORY_THRESHOLDS,
  RAINFALL_MAX_AMPLIFICATION,
  RAINFALL_REFERENCE_INCHES,
  type BaselineFactorKey,
  type FactorContribution,
  type RiskCategory,
  type RiskFeatures,
  type RiskResult,
} from "@flood-ai/shared";

/** Conceptual factors from spec section 6.3 that this pilot pipeline does not
 * yet compute from real data (no filled-DEM flow accumulation, no wired-up
 * hydrologic-soil-group source). Counted against confidence, never faked. */
const STRUCTURALLY_MISSING_FACTORS = ["flowAccumulation", "soilInfiltration"] as const;
const AVAILABLE_CONCEPTUAL_FACTOR_COUNT = 5; // elevation, slope, water, fema, impervious
const TOTAL_CONCEPTUAL_FACTOR_COUNT =
  AVAILABLE_CONCEPTUAL_FACTOR_COUNT + STRUCTURALLY_MISSING_FACTORS.length;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function elevationFactor(z: number | null): number | null {
  if (z === null) return null;
  return clamp01(1 - (z + 3) / 6); // lower relative elevation -> higher factor
}

function slopeFactor(deg: number | null): number | null {
  if (deg === null) return null;
  return clamp01(1 - deg / 15); // flatter land -> higher factor (pooling)
}

function waterProximityFactor(distM: number | null): number | null {
  if (distM === null) return null;
  return clamp01(1 - distM / 300);
}

function imperviousFactor(pct: number | null): number | null {
  if (pct === null) return null;
  return clamp01(pct / 100);
}

function femaFactor(sfha: boolean): number {
  return sfha ? 1 : 0;
}

function rainfallAmplification(totalInches: number): number {
  const ratio = clamp01(totalInches / RAINFALL_REFERENCE_INCHES);
  return ratio * RAINFALL_MAX_AMPLIFICATION;
}

function categoryFor(score: number): RiskCategory {
  const entry = CATEGORY_THRESHOLDS.find((t) => score < t.max);
  return (entry?.category ?? "very_high") as RiskCategory;
}

export interface BaselineOptions {
  rainfallTotalInches: number;
  rainfallScenarioId: string;
  modelVersion?: string;
  dataVersion: string;
}

/** Deterministic, versioned susceptibility engine (spec 6.5). Pure function:
 * identical features + options always produce identical output. */
export function computeBaselineRisk(features: RiskFeatures, options: BaselineOptions): RiskResult {
  if (features.coverageTier === "unsupported") {
    return {
      cellId: features.cellId,
      riskScore: 0,
      scoreMeaning: "relative_risk_index",
      riskCategory: "minimal",
      coverageTier: "unsupported",
      confidenceScore: 0,
      uncertaintyBand: null,
      modelVersion: options.modelVersion ?? BASELINE_WEIGHTS_VERSION,
      dataVersion: options.dataVersion,
      rainfallScenarioId: options.rainfallScenarioId,
      topContributors: [],
      dataCompleteness: { present: [], missing: ["all — cell is outside the supported pilot AOI"] },
    };
  }

  const amplification = rainfallAmplification(options.rainfallTotalInches);

  const factorValues: Record<BaselineFactorKey, number | null> = {
    lowElevation: elevationFactor(features.relativeElevationZ),
    lowSlope: slopeFactor(features.slopeDegrees),
    waterProximity: (() => {
      const f = waterProximityFactor(features.distanceToWaterM);
      return f === null ? null : clamp01(f * (1 + amplification));
    })(),
    femaZone: femaFactor(features.femaSfha),
    impervious: (() => {
      const f = imperviousFactor(features.imperviousPct);
      return f === null ? null : clamp01(f * (1 + amplification));
    })(),
  };

  const presentKeys = (Object.keys(factorValues) as BaselineFactorKey[]).filter(
    (k) => factorValues[k] !== null,
  );
  const missingKeys = (Object.keys(factorValues) as BaselineFactorKey[]).filter(
    (k) => factorValues[k] === null,
  );

  const presentWeightSum = presentKeys.reduce((sum, k) => sum + BASELINE_WEIGHTS[k], 0);

  const contributions: FactorContribution[] = [];
  let rawScore = 0;
  for (const key of presentKeys) {
    const value = factorValues[key] as number;
    const renormalizedWeight = presentWeightSum > 0 ? BASELINE_WEIGHTS[key] / presentWeightSum : 0;
    const points = value * renormalizedWeight * 100;
    rawScore += points;
    contributions.push({
      factor: key,
      label: factorLabel(key, features),
      contribution: Math.round(points * 10) / 10,
      rawValue: rawValueFor(key, features),
    });
  }

  contributions.sort((a, b) => b.contribution - a.contribution);

  const riskScore = Math.round(clamp01(rawScore / 100) * 100);

  const cellCompletenessFraction = presentKeys.length / AVAILABLE_CONCEPTUAL_FACTOR_COUNT;
  const confidenceScore = Math.round(
    (AVAILABLE_CONCEPTUAL_FACTOR_COUNT / TOTAL_CONCEPTUAL_FACTOR_COUNT) *
      cellCompletenessFraction *
      100,
  );

  return {
    cellId: features.cellId,
    riskScore,
    scoreMeaning: "relative_risk_index",
    riskCategory: categoryFor(riskScore),
    coverageTier: features.coverageTier,
    confidenceScore,
    uncertaintyBand: null,
    modelVersion: options.modelVersion ?? BASELINE_WEIGHTS_VERSION,
    dataVersion: options.dataVersion,
    rainfallScenarioId: options.rainfallScenarioId,
    topContributors: contributions,
    dataCompleteness: {
      present: presentKeys,
      missing: [...missingKeys, ...STRUCTURALLY_MISSING_FACTORS],
    },
  };
}

function factorLabel(key: BaselineFactorKey, features: RiskFeatures): string {
  switch (key) {
    case "lowElevation":
      return "Low relative elevation";
    case "lowSlope":
      return "Flat terrain (low slope)";
    case "waterProximity":
      return features.distanceToWaterM !== null
        ? `Near mapped surface water (${Math.round(features.distanceToWaterM)} m)`
        : "Proximity to mapped surface water";
    case "femaZone":
      return features.femaSfha
        ? "Within FEMA Special Flood Hazard Area"
        : "Outside FEMA Special Flood Hazard Area";
    case "impervious":
      return features.imperviousPct !== null
        ? `${features.imperviousPct}% estimated impervious surface`
        : "Impervious surface coverage";
  }
}

function rawValueFor(key: BaselineFactorKey, features: RiskFeatures): number | string | boolean | null {
  switch (key) {
    case "lowElevation":
      return features.relativeElevationZ;
    case "lowSlope":
      return features.slopeDegrees;
    case "waterProximity":
      return features.distanceToWaterM;
    case "femaZone":
      return features.femaSfha;
    case "impervious":
      return features.imperviousPct;
  }
}
