import { computeBaselineRisk, applyInterventionToFeatures, type BaselineOptions } from "@flood-ai/risk-runtime";
import type { Intervention, InterventionType, RiskFeatures } from "@flood-ai/shared";

/** Shared intervention catalog (spec section 8), used by both /simulate and
 * any other page that wants a quick "what would help here" suggestion
 * without re-deriving the same defaults. */
export const INTERVENTION_TYPES: { value: InterventionType; label: string; defaultRadius: number; defaultStrength: number }[] = [
  { value: "proposed_drain", label: "Proposed drain / catch basin", defaultRadius: 80, defaultStrength: 0.6 },
  { value: "drain_repair", label: "Drain repair / capacity restoration", defaultRadius: 80, defaultStrength: 0.5 },
  { value: "flood_barrier", label: "Flood barrier / berm", defaultRadius: 60, defaultStrength: 0.8 },
  { value: "road_repair", label: "Road / intersection regrading", defaultRadius: 50, defaultStrength: 0.4 },
  { value: "permeable_surface", label: "Permeable surface conversion", defaultRadius: 40, defaultStrength: 0.5 },
];

/** For a single cell (distance 0 from the intervention geometry, i.e. "built
 * right here"), test every real intervention type at its default
 * radius/strength and return whichever one the SAME deterministic engine
 * scores as reducing risk the most. Real computation, not a lookup table --
 * mirrors /simulate's own auto-suggest logic at map-click granularity. */
export function suggestBestIntervention(
  features: RiskFeatures,
  options: BaselineOptions,
): { type: InterventionType; label: string; beforeScore: number; afterScore: number } | null {
  const before = computeBaselineRisk(features, options);
  let best: { type: InterventionType; label: string; afterScore: number } | null = null;

  for (const t of INTERVENTION_TYPES) {
    const intervention: Intervention = {
      id: `suggest-${t.value}`,
      type: t.value,
      geometry: { type: "Point", coordinates: features.centroid },
      influenceRadiusM: t.defaultRadius,
      effectStrength: t.defaultStrength,
      label: t.label,
      assumptionSource: "default planning assumption (see docs/METHODOLOGY.md)",
    };
    const { features: modified, modified: changedKeys } = applyInterventionToFeatures(features, intervention, 0);
    if (changedKeys.length === 0) continue;
    const after = computeBaselineRisk(modified, options);
    if (!best || after.riskScore < best.afterScore) {
      best = { type: t.value, label: t.label, afterScore: after.riskScore };
    }
  }

  return best ? { ...best, beforeScore: before.riskScore } : null;
}
