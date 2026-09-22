import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import type { CellDelta, Intervention, JevInterventionAssessment, RiskFeatures } from "@flood-ai/shared";

/** Server-only. Never import this module from client-rendered code -- the
 * TypeSafeClient reads TYPESAFE_API_KEY from the environment and must not
 * ship to the browser bundle. */

const INTERVENTION_CHOICES = {
  proposed_drain: "A new drain or catch basin",
  drain_repair: "Repairing/restoring an existing drain",
  drainage_capacity_improvement: "Widening or upgrading a drainage line/culvert",
  flood_barrier: "A flood barrier or berm",
  road_repair: "Road or intersection regrading/repair",
  rain_garden: "A rain garden or bioswale",
  permeable_surface: "Converting to permeable surface",
  detention_area: "A detention/retention area",
  insufficient_evidence: "Insufficient evidence to recommend a specific intervention",
} as const;

// ScoreCriteria is a positional tuple (index 0..n), not an object keyed by
// number strings -- descriptions are read off by array index.
const FIT_SCORE_LEGEND = [
  "Poor fit for the local factors",
  "Weak fit",
  "Moderate fit",
  "Good fit",
  "Strong fit for the local factors",
] as const;

const RESIDUAL_RISK_LEGEND = [
  "Minimal residual risk after the intervention",
  "Low residual risk",
  "Moderate residual risk",
  "High residual risk",
  "Very high residual risk remains after the intervention",
] as const;

const EVIDENCE_LEGEND = [
  "Insufficient evidence in the provided state",
  "Weak evidence",
  "Moderate evidence",
  "Good evidence",
  "Strong evidence supporting the assessment",
] as const;

const PRIORITY_LEGEND = [
  "Low priority for engineering review",
  "Some priority",
  "Moderate priority",
  "High priority",
  "Urgent priority for engineering review",
] as const;

/** Compact structured state per spec section 6.10 -- only verified model
 * output and user inputs, nothing invented. */
export interface JevRequestState {
  location: { lat: number; lon: number };
  coverageTier: RiskFeatures["coverageTier"];
  rainfallScenarioId: string;
  interventionType: Intervention["type"];
  interventionParameters: { influenceRadiusM: number; effectStrength: number; assumptionSource: string };
  baselineRiskDistribution: { meanBefore: number; meanAfter: number; sampledCells: number };
  topPhysicalContributors: string[];
  cellsWorsened: number;
  cellsImproved: number;
  dataGaps: string[];
}

export function buildJevState(
  intervention: Intervention,
  rainfallScenarioId: string,
  cellDeltas: CellDelta[],
  topContributorLabels: string[],
  dataGaps: string[],
  location: { lat: number; lon: number },
  coverageTier: RiskFeatures["coverageTier"],
): JevRequestState {
  const meanBefore = cellDeltas.reduce((s, d) => s + d.beforeRiskScore, 0) / (cellDeltas.length || 1);
  const meanAfter = cellDeltas.reduce((s, d) => s + d.afterRiskScore, 0) / (cellDeltas.length || 1);
  return {
    location,
    coverageTier,
    rainfallScenarioId,
    interventionType: intervention.type,
    interventionParameters: {
      influenceRadiusM: intervention.influenceRadiusM,
      effectStrength: intervention.effectStrength,
      assumptionSource: intervention.assumptionSource,
    },
    baselineRiskDistribution: {
      meanBefore: Math.round(meanBefore * 10) / 10,
      meanAfter: Math.round(meanAfter * 10) / 10,
      sampledCells: cellDeltas.length,
    },
    topPhysicalContributors: topContributorLabels,
    cellsWorsened: cellDeltas.filter((d) => d.scoreDelta > 0).length,
    cellsImproved: cellDeltas.filter((d) => d.scoreDelta < 0).length,
    dataGaps,
  };
}

let cachedClient: TypeSafeClient | null = null;
function getClient(): TypeSafeClient {
  if (!process.env.TYPESAFE_API_KEY) {
    throw new Error("TYPESAFE_API_KEY is not set");
  }
  if (!cachedClient) cachedClient = new TypeSafeClient({ timeout: 15_000 });
  return cachedClient;
}

/** Single batched call -- every question evaluated in parallel against the
 * same state, per spec section 6.10 ("one Jev request, ask atomic parallel
 * questions"). */
export async function requestJevAssessment(state: JevRequestState): Promise<JevInterventionAssessment> {
  const client = getClient();

  const response = await client.systemOne({
    // JevRequestState is a plain, fully JSON-serializable interface; round
    // tripping it satisfies the SDK's structural EntryType (a JSON object
    // with an index signature) without changing any value.
    state: JSON.parse(JSON.stringify(state)),
    questions: {
      interventionFit: score(
        "Given the local physical factors and the proposed intervention type/parameters, how well does this intervention fit the situation?",
        FIT_SCORE_LEGEND,
      ),
      residualRisk: score(
        "After this intervention, how much flood risk remains for the affected cells?",
        RESIDUAL_RISK_LEGEND,
      ),
      evidenceStrength: score(
        "How strong is the evidence in this state for the intervention's claimed effect?",
        EVIDENCE_LEGEND,
      ),
      priorityForEngineeringReview: score(
        "How urgently should a human engineer review this proposed intervention before it is acted on?",
        PRIORITY_LEGEND,
      ),
      riskDisplacementConcern: noul(
        "Does this intervention appear to shift modeled flood exposure to neighboring or downstream cells rather than reducing it overall?",
      ),
      needsHumanReview: noul(
        "Given the data gaps, coverage tier, and uncertainty described in this state, does this assessment need human review before being acted on?",
      ),
      mostRelevantIntervention: choice(
        "Given the local physical factors described, which intervention type is most relevant? Choose insufficient_evidence if the state does not support a confident recommendation.",
        INTERVENTION_CHOICES,
      ),
    },
  });

  const a = response.answers;
  const toLegendRecord = (legend: readonly string[]): Record<string, string> =>
    Object.fromEntries(legend.map((v, i) => [String(i), v]));

  return {
    interventionFit: { score: a.interventionFit.score, confidence: a.interventionFit.confidence, legend: toLegendRecord(FIT_SCORE_LEGEND) },
    residualRisk: { score: a.residualRisk.score, confidence: a.residualRisk.confidence, legend: toLegendRecord(RESIDUAL_RISK_LEGEND) },
    evidenceStrength: { score: a.evidenceStrength.score, confidence: a.evidenceStrength.confidence, legend: toLegendRecord(EVIDENCE_LEGEND) },
    priorityForEngineeringReview: { score: a.priorityForEngineeringReview.score, confidence: a.priorityForEngineeringReview.confidence, legend: toLegendRecord(PRIORITY_LEGEND) },
    riskDisplacementConcern: { probability: a.riskDisplacementConcern.noul },
    needsHumanReview: { probability: a.needsHumanReview.noul },
    mostRelevantIntervention: { choice: a.mostRelevantIntervention.choice, confidence: a.mostRelevantIntervention.confidence, probabilities: a.mostRelevantIntervention.probabilities as Record<string, number> },
    model: response.model,
    generatedAt: new Date().toISOString(),
  };
}
