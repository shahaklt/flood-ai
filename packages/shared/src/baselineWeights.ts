/** Versioned weights for the deterministic susceptibility baseline
 * (spec section 6.5). Every weight and threshold lives here, not scattered
 * through code, so it can be reviewed, sensitivity-tested, and cited in
 * docs/METHODOLOGY.md.
 *
 * v0.2.0 rationale:
 * - Flow accumulation is now real, computed directly from the fetched DEM
 *   via a standard D8 algorithm (services/risk/hydrology.py), not
 *   fabricated — cells where terrain concentrates upstream flow get a real,
 *   non-trivial weight. This closes one of the two structural gaps from
 *   v0.1.0 and raises the confidence ceiling accordingly (see
 *   risk-runtime/baseline.ts AVAILABLE_CONCEPTUAL_FACTOR_COUNT).
 * - Soil infiltration (hydrologic soil group) remains unwired — no
 *   authoritative source integrated yet — and its weight stays
 *   redistributed across the six factors that are real.
 * - Flow accumulation and water proximity now carry the largest weights:
 *   together with FEMA's own hazard determination, they are the strongest
 *   available real signals for where water actually concentrates, which
 *   matters both for the coastal pilot AOI and for the statewide live tile
 *   service (where flow accumulation is computed per-tile, a real but
 *   edge-truncated signal — see the tile-boundary caveat in
 *   services/risk/hydrology.py).
 */
export const BASELINE_WEIGHTS_VERSION = "baseline-weights-v0.2.0";

export const BASELINE_WEIGHTS = {
  lowElevation: 0.2,
  lowSlope: 0.1,
  flowAccumulation: 0.18,
  waterProximity: 0.2,
  femaZone: 0.18,
  impervious: 0.14,
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
