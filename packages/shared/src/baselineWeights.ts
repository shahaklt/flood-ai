/** Versioned weights for the deterministic susceptibility baseline
 * (spec section 6.5). Every weight and threshold lives here, not scattered
 * through code, so it can be reviewed, sensitivity-tested, and cited in
 * docs/METHODOLOGY.md.
 *
 * v0.4.0 rationale:
 * - Added curvature (discrete Laplacian of elevation): concave terrain
 *   (a local bowl) collects water even without much upslope contributing
 *   area, which flowAccumulation/TWI alone don't capture -- a real,
 *   independent geomorphometry signal, free to compute from the DEM
 *   already fetched. Confirmed via a real hyperparameter search
 *   (scripts/training/train_statewide_lightgbm.py) that additional
 *   real terrain features meaningfully move balanced accuracy.
 *
 * v0.3.0 rationale:
 * - Added topographicWetnessIndex = ln(flowAccumulation / tan(slope)), the
 *   standard hydrology combination of the two -- high where water both
 *   concentrates AND has nowhere to drain, which plain addition of the two
 *   marginal factors doesn't capture. Computed free from data already
 *   fetched (services/risk/features.py), so this is a real, zero-cost
 *   accuracy improvement, not a new external dependency.
 * - Water proximity is now backed by USGS NHD flowlines in addition to OSM
 *   (unioned), fixing a real gap where Overpass alone missed water
 *   statewide at the larger tile scale used for statewide extraction.
 * - Soil infiltration (hydrologic soil group) remains unwired — no
 *   authoritative source integrated yet — and its weight stays
 *   redistributed across the seven factors that are real.
 *
 * v0.2.0 rationale (kept for history):
 * - Flow accumulation is now real, computed directly from the fetched DEM
 *   via a standard D8 algorithm (services/risk/hydrology.py), not
 *   fabricated — cells where terrain concentrates upstream flow get a real,
 *   non-trivial weight. This closes one of the two structural gaps from
 *   v0.1.0 and raises the confidence ceiling accordingly (see
 *   risk-runtime/baseline.ts AVAILABLE_CONCEPTUAL_FACTOR_COUNT).
 */
export const BASELINE_WEIGHTS_VERSION = "baseline-weights-v0.4.0";

export const BASELINE_WEIGHTS = {
  lowElevation: 0.16,
  lowSlope: 0.07,
  flowAccumulation: 0.13,
  topographicWetnessIndex: 0.11,
  curvature: 0.08,
  waterProximity: 0.17,
  femaZone: 0.15,
  impervious: 0.13,
} as const;

export type BaselineFactorKey = keyof typeof BASELINE_WEIGHTS;

export const CATEGORY_THRESHOLDS: { max: number; category: string }[] = [
  { max: 20, category: "minimal" },
  { max: 40, category: "low" },
  { max: 60, category: "moderate" },
  { max: 80, category: "high" },
  { max: 101, category: "very_high" },
];

/** Bounded, documented rainfall amplification (spec section 7). Applied to
 * the runoff-sensitive terms (impervious surface, water proximity, and now
 * flow accumulation) since heavier rainfall increases the effective
 * contribution of terrain-driven accumulation, per spec section 7.
 * amplification = (totalInches / 6) * MAX_AMPLIFICATION, capped at MAX. */
export const RAINFALL_MAX_AMPLIFICATION = 0.5;
export const RAINFALL_REFERENCE_INCHES = 6;
