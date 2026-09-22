/** Shared schemas for FloodAI. Kept dependency-free (no Zod here) so both the
 * Next.js app and the browser risk-runtime can import plain types; runtime
 * validation (Zod) lives at the API boundary in apps/web.
 */

export type CoverageTier =
  | "validated"
  | "experimental_transfer"
  | "deterministic_fallback"
  | "partial_data"
  | "unsupported";

export type ScoreMeaning = "calibrated_probability" | "relative_risk_index";

export type RiskCategory = "minimal" | "low" | "moderate" | "high" | "very_high";

/** Real, per-cell environmental inputs. `null` means the value is genuinely
 * unavailable for this cell — never coerced to a fabricated default. */
export interface RiskFeatures {
  cellId: string;
  centroid: [number, number];
  coverageTier: CoverageTier;
  elevationM: number | null;
  slopeDegrees: number | null;
  landCoverClass: number | null;
  imperviousPct: number | null;
  distanceToWaterM: number | null;
  distanceToRoadM: number | null;
  femaSfha: boolean;
  relativeElevationZ: number | null;
}

export interface FactorContribution {
  factor: string;
  label: string;
  contribution: number; // signed points on the 0-100 scale
  rawValue: number | string | boolean | null;
}

export interface RainfallScenario {
  id: string;
  label: string;
  totalInches: number;
  durationHours: number;
  isCustom: boolean;
}

export interface RiskResult {
  cellId: string;
  riskScore: number; // 0-100
  scoreMeaning: ScoreMeaning;
  riskCategory: RiskCategory;
  coverageTier: CoverageTier;
  confidenceScore: number; // 0-100, data completeness/freshness/resolution
  uncertaintyBand: [number, number] | null;
  modelVersion: string;
  dataVersion: string;
  rainfallScenarioId: string;
  topContributors: FactorContribution[];
  dataCompleteness: {
    present: string[];
    missing: string[];
  };
}

export interface DataSource {
  id: string;
  title: string;
  provider: string;
  sourceUrl: string;
  retrievedAt: string;
  dataDate: string;
  coverage: string;
  resolution: string;
  license: string;
  usedFor: string[];
  limitations: string[];
  isSynthetic: boolean;
}

export interface ExposureStats {
  maxRiskScore: number;
  meanRiskScore: number;
  p90RiskScore: number;
  sampledCellCount: number;
  coverageTier: CoverageTier;
}

export interface RoadSegmentExposure extends ExposureStats {
  segmentId: string;
  highwayClass: string;
  isMajor: boolean;
  name: string | null;
  lengthM: number;
  estimatedAccessDisruptionScore: number;
}

export interface FacilityExposure extends ExposureStats {
  facilityId: string;
  facilityType: string;
  name: string;
  estimatedAccessDisruptionScore: number;
}

export const RAINFALL_SCENARIOS: RainfallScenario[] = [
  { id: "1in-6h", label: "1 in over 6 hr", totalInches: 1, durationHours: 6, isCustom: false },
  { id: "2in-6h", label: "2 in over 6 hr", totalInches: 2, durationHours: 6, isCustom: false },
  { id: "4in-12h", label: "4 in over 12 hr", totalInches: 4, durationHours: 12, isCustom: false },
  { id: "6in-24h", label: "6 in over 24 hr", totalInches: 6, durationHours: 24, isCustom: false },
];
