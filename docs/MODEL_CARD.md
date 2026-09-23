# Model Card

## FloodAI deterministic baseline (`baseline-weights-v0.5.0`) — shipped model

**Purpose**: Produce an explainable 0-100 relative risk index for any ~100 m analysis cell in New York State, computed live from real public environmental data, when statistical training data is insufficient for a defensible calibrated model.

**Inputs (9 real factors, all live-fetched per tile)**: relative elevation (z-score), slope, flow accumulation (real D8 algorithm on the fetched DEM), topographic wetness index, terrain curvature, distance to mapped surface water (OSM + USGS NHD), FEMA Special Flood Hazard Area membership, impervious surface percentage, and hydrologic soil group (USDA NRCS, via Soil Data Access). All from real sources — see `data/metadata/sources.json`.

**Output**: `riskScore` (0-100, `relative_risk_index`, not a calibrated probability), `riskCategory`, `confidenceScore`, ordered `topContributors`, `dataCompleteness`.

**Evaluation**: Unit-tested for correctness properties (determinism, bounds, monotonicity, missing-data handling) — see `docs/EVALUATION.md`. Not evaluated against flood observation labels because it is not a statistical model; it should not be described as one.

**Known limitations**:
- Weights are hand-set with documented rationale (see `packages/shared/src/baselineWeights.ts`), not fit to data.
- Soil data is resolved at tile-centroid granularity (survey polygons are coarser than the analysis grid) and is genuinely missing for many dense urban mapunits — confidence drops for those cells rather than guessing.
- Any individual real data source (DEM, NLCD, FEMA, water, soil) can be transiently unavailable for a given tile; the pipeline degrades that cell's confidence rather than fabricating a value.

**Prohibited uses**: Emergency response, evacuation guidance, insurance/property valuation, engineering certification, or any claim of prediction outside New York State.

---

## Experimental logistic regression (`experimental-logreg-v0.1.0`) — NOT shipped

**Purpose**: Proof-of-concept that a real, audited, non-fabricated supervised training pipeline works end to end (Earth Engine label extraction → event-cell table → leakage-aware split → fit → evaluation), ahead of having enough real positive events to justify shipping a supervised model.

**Inputs**: Same real features as the baseline, plus per-event metadata from the Global Flood Database.

**Training data**: 3,591 real rows, **38 real positive labels**, from 3 real historical flood events, at the pilot's current 100 m grid resolution. See `docs/TRAINING_DATA_AUDIT.md` and `docs/EVALUATION.md`.

**Evaluation**: Leave-one-event-out, 3 folds. ROC-AUC 0.89-0.98 per fold — reported honestly as still high-variance given only 3 source events, not as a validated result.

**Status**: Experimental. **Never used to generate a user-facing prediction.** Kept in the repository and documented per spec section 5.1's contingency: preserve the supervised pipeline as evaluated experimental work rather than deploying an undertrained model or skipping the exercise entirely.

**Known limitations**: Sample size (n=38 positives, from only 3 real events) is far below what any real deployment would require. Leave-one-event-out at n=3 groups cannot estimate true generalization variance. In-sample coefficients (`data/models/experimental_logreg_eval.json`) should not be over-interpreted as feature importance in a general sense — they describe this specific tiny sample.

**Prohibited uses**: Any production use. This model exists for engineering/pedagogical demonstration only.

**Path to promotion**: See "What would change this model's status" in `docs/EVALUATION.md`.

---

## Statewide experimental model (`statewide-experimental-v0.1.0`) — NOT shipped

**Purpose**: The same real-data-pipeline proof, at statewide scale — evaluate whether more real events (24, vs. 3 for the pilot-only model) and a real cross-validation split produce a more credible result.

**Training data**: 21,956 real rows, 1,056 real positives (4.8%), from 24 real historical events across 87 real z=9 tiles statewide, including a real second water source (USGS NHD), real topographic wetness index, and real terrain curvature (all 8 factors matching the shipped baseline). See `docs/EVALUATION.md`.

**Evaluation**: 5-fold grouped cross-validation by event. Best real result overall (see `statewide-ensemble-v0.1.1` in `docs/EVALUATION.md`): a real average ensemble of logistic regression + gradient-boosted trees + LightGBM, isotonic-calibrated, evaluated at a real threshold chosen to maximize balanced accuracy (not the default 0.5, which is the wrong cutoff at this dataset's 4.8% positive rate) via **nested** cross-validated threshold selection (each fold's threshold chosen only from the other folds, to avoid leaking the evaluation labels into the threshold choice) — **0.813 ROC-AUC, 73.9% honest balanced accuracy**. Adding curvature and re-fetching statewide data was tested honestly against the prior 8-factor-minus-curvature run (0.821 ROC-AUC / 73.8%) and found to be a statistical wash, not an improvement — reported as current because it uses the most complete real feature set, not because it's a proven gain. (An unweighted single GBM reports 95.8% raw accuracy, barely above the 95.3% trivial "always predict no-flood" baseline — reported and explained, not hidden.)

**Status**: Experimental. **Never used to generate a user-facing prediction.**

**Known limitations**: `distanceToWaterM` excluded from the trained feature set (tested directly in a controlled ablation — see `docs/EVALUATION.md` — and found to add no measurable signal once elevation/TWI/flow accumulation are present). Cross-validation, not a locked single-touch test set. Raw accuracy is a misleading metric at this class balance; balanced accuracy and ROC-AUC are reported as the honest numbers. At 24 real events, accuracy has plateaued around 0.81-0.82 ROC-AUC regardless of feature engineering — more distinct real flood events would likely move this further than more features from the same events.

**Prohibited uses**: Any production use.
