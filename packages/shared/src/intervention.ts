import type { RiskFeatures } from "./types";

/** Spec section 8: MVP intervention types. Point/line geometry only for
 * this build (no polygon drawing tool yet) — a documented simplification,
 * not a silent gap. */
export type InterventionType =
  | "proposed_drain"
  | "drain_repair"
  | "flood_barrier"
  | "road_repair"
  | "permeable_surface";

export interface InterventionGeometry {
  type: "Point" | "LineString";
  coordinates: [number, number] | [number, number][];
}

export interface Intervention {
  id: string;
  type: InterventionType;
  geometry: InterventionGeometry;
  /** Meters — how far the effect reaches from the geometry. */
  influenceRadiusM: number;
  /** 0-1 documented planning assumption of how much the intervention reduces
   * the relevant runoff/flow factor within its influence area. Never a
   * guarantee of performance — spec section 8.1. */
  effectStrength: number;
  label: string;
  assumptionSource: string;
}

/** Spec section 8.1: bounded, documented per-cell feature transform, applied
 * before re-running the same baseline engine — never a raw score subtraction. */
export interface CellDelta {
  cellId: string;
  beforeRiskScore: number;
  afterRiskScore: number;
  scoreDelta: number;
  modifiedFeatures: (keyof RiskFeatures)[];
}

export interface ScenarioDelta {
  scenarioId: string;
  intervention: Intervention;
  rainfallScenarioId: string;
  cellDeltas: CellDelta[];
  summary: {
    cellsImproved: number;
    cellsWorsened: number;
    cellsUnchanged: number;
    meanScoreDelta: number;
    maxScoreIncrease: number; // largest single-cell WORSENING, for displacement visibility
  };
  assumptions: string[];
  dataGaps: string[];
  modelVersion: string;
  dataVersion: string;
  generatedAt: string;
}

/** Spec section 6.10: Jev's typed, confidence-gated assessment. Never blended
 * with or allowed to overwrite the trained/deterministic risk score. */
export interface JevInterventionAssessment {
  interventionFit: { score: number; confidence: number; legend: Record<string, string> };
  residualRisk: { score: number; confidence: number; legend: Record<string, string> };
  evidenceStrength: { score: number; confidence: number; legend: Record<string, string> };
  priorityForEngineeringReview: { score: number; confidence: number; legend: Record<string, string> };
  riskDisplacementConcern: { probability: number };
  needsHumanReview: { probability: number };
  mostRelevantIntervention: { choice: string; confidence: number; probabilities: Record<string, number> };
  model: string;
  generatedAt: string;
}

export type JevResponse =
  | { status: "ok"; assessment: JevInterventionAssessment }
  | { status: "unavailable"; reason: string };
