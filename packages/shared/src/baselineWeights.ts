/** Versioned weights for the deterministic susceptibility baseline
 * (spec section 6.5). Every weight and threshold lives here, not scattered
 * through code, so it can be reviewed, sensitivity-tested, and cited in
 * docs/METHODOLOGY.md.
 *
 * v0.1.0 rationale (pilot AOI, Mamaroneck NY):
 * - Two spec-suggested factors (flow accumulation, soil infiltration) are not
 *   yet computed for the pilot pipeline — real hydrologic flow-accumulation
 *   requires a filled DEM + pour-point analysis, and no authoritative
 *   hydrologic-soil-group layer has been wired up yet. Rather than fabricate
 *   either, their weight is redistributed across the five factors that ARE
 *   backed by real per-cell data, and the resulting cap on confidenceScore
 *   (see risk-runtime/baseline.ts) reflects that structural gap honestly.
 * - Water proximity and FEMA zone membership get the largest weights because,
 *   for this pilot AOI's known flood history (Sheldrake/Mamaroneck River
 *   riverine and coastal flooding), nearness to mapped surface water and
 *   FEMA's own hazard determination are the strongest available real signals.
 */
export const BASELINE_WEIGHTS_VERSION = "baseline-weights-v0.1.0";

export const BASELINE_WEIGHTS = {
  lowElevation: 0.26,
  lowSlope: 0.14,
  waterProximity: 0.24,
  femaZone: 0.2,
  impervious: 0.16,
} as const;

export type BaselineFactorKey = keyof typeof BASELINE_WEIGHTS;

export const CATEGORY_THRESHOLDS: { max: number; category: string }[] = [
  { max: 20, category: "minimal" },
  { max: 40, category: "low" },
  { max: 60, category: "moderate" },
  { max: 80, category: "high" },
  { max: 101, category: "very_high" },
];

/** Bounded, documented rainfall amplification (spec section 7). Applied only
 * to the runoff-sensitive terms (impervious surface, water proximity) since
 * flow accumulation isn't available yet to carry the rest of the effect.
 * amplification = (totalInches / 6) * MAX_AMPLIFICATION, capped at MAX. */
export const RAINFALL_MAX_AMPLIFICATION = 0.5;
export const RAINFALL_REFERENCE_INCHES = 6;
