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

/** Conceptual factor from spec section 6.3 that this pipeline does not yet
 * compute from real data (no wired-up hydrologic-soil-group source).
 * Counted against confidence, never faked. */
const STRUCTURALLY_MISSING_FACTORS = ["soilInfiltration"] as const;
const AVAILABLE_CONCEPTUAL_FACTOR_COUNT = 7; // elevation, slope, flowAccumulation, TWI, water, fema, impervious
const TOTAL_CONCEPTUAL_FACTOR_COUNT =
  AVAILABLE_CONCEPTUAL_FACTOR_COUNT + STRUCTURALLY_MISSING_FACTORS.length;

/** Reference scale for log-normalizing flow accumulation (a cell count, so
 * heavily right-skewed). Tile-scale local drainage concentration, not a
 * full watershed value — chosen so a cell with ~50 contributing upstream
 * cells (a real, locally meaningful drainage line at this grid resolution)
 * reads as a strong signal without saturating on larger real channels. */
const FLOW_ACCUMULATION_LOG_REFERENCE = Math.log1p(50);

/** Real-world TWI at this tile scale typically falls roughly in [2, 10] for
 * this grid resolution (see services/risk/features.py); linearly normalized
 * across that documented range rather than an arbitrary scale. */
const TWI_MIN = 2;
const TWI_MAX = 10;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// `!= null` (loose) deliberately catches both `null` and `undefined`: these
// values cross a network boundary (worker postMessage, JSON fetch), and a
// strict `=== null` check lets an `undefined` field (a key silently missing
// from a payload) slip through as if it were a real number -- either
// crashing later (calling a method on undefined) or silently propagating
// NaN through the math. A real bug of this exact shape was caught live via
// Playwright: `!== null` on topographicWetnessIndex let an undefined value
// reach `.toFixed()`.
function elevationFactor(z: number | null): number | null {
  if (z == null) return null;
  return clamp01(1 - (z + 3) / 6); // lower relative elevation -> higher factor
}

function slopeFactor(deg: number | null): number | null {
  if (deg == null) return null;
  return clamp01(1 - deg / 15); // flatter land -> higher factor (pooling)
}

function flowAccumulationFactor(count: number | null): number | null {
  if (count == null) return null;
  return clamp01(Math.log1p(Math.max(0, count)) / FLOW_ACCUMULATION_LOG_REFERENCE);
}

function twiFactor(twi: number | null): number | null {
  if (twi == null) return null;
  return clamp01((twi - TWI_MIN) / (TWI_MAX - TWI_MIN));
}

function waterProximityFactor(distM: number | null): number | null {
  if (distM == null) return null;
  return clamp01(1 - distM / 300);
}

function imperviousFactor(pct: number | null): number | null {
  if (pct == null) return null;
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
      dataCompleteness: { present: [], missing: ["all — cell is outside New York State, FloodAI's declared coverage area"] },
    };
  }

  const amplification = rainfallAmplification(options.rainfallTotalInches);

  const factorValues: Record<BaselineFactorKey, number | null> = {
    lowElevation: elevationFactor(features.relativeElevationZ),
    lowSlope: slopeFactor(features.slopeDegrees),
    flowAccumulation: (() => {
      const f = flowAccumulationFactor(features.flowAccumulation);
      return f === null ? null : clamp01(f * (1 + amplification));
    })(),
    topographicWetnessIndex: (() => {
      const f = twiFactor(features.topographicWetnessIndex);
      return f === null ? null : clamp01(f * (1 + amplification));
    })(),
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
    case "flowAccumulation":
      return features.flowAccumulation != null
        ? `High modeled flow accumulation (${Math.round(features.flowAccumulation)} contributing cells)`
        : "Modeled flow accumulation";
    case "topographicWetnessIndex":
      return features.topographicWetnessIndex != null
        ? `High topographic wetness index (${features.topographicWetnessIndex.toFixed(1)})`
        : "Topographic wetness index";
    case "waterProximity":
      return features.distanceToWaterM != null
        ? `Near mapped surface water (${Math.round(features.distanceToWaterM)} m)`
        : "Proximity to mapped surface water";
    case "femaZone":
      return features.femaSfha
        ? "Within FEMA Special Flood Hazard Area"
        : "Outside FEMA Special Flood Hazard Area";
    case "impervious":
      return features.imperviousPct != null
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
    case "flowAccumulation":
      return features.flowAccumulation;
    case "topographicWetnessIndex":
      return features.topographicWetnessIndex;
    case "waterProximity":
      return features.distanceToWaterM;
    case "femaZone":
      return features.femaSfha;
    case "impervious":
      return features.imperviousPct;
  }
}
