# Model Card

## FloodAI deterministic baseline (`baseline-weights-v0.1.0`) — shipped model

**Purpose**: Produce an explainable 0-100 relative risk index for a 250 m analysis cell in the pilot AOI (Village of Mamaroneck, NY), from real public environmental data, when statistical training data is insufficient for a defensible calibrated model.

**Inputs**: relative elevation (z-score vs. AOI distribution), slope, distance to mapped surface water, FEMA Special Flood Hazard Area membership, impervious surface percentage. All from real sources — see `data/metadata/sources.json`.

**Not used (structural gap, disclosed)**: flow accumulation, hydrologic soil group. Confidence is capped to reflect this rather than fabricating these factors.

**Output**: `riskScore` (0-100, `relative_risk_index`, not a calibrated probability), `riskCategory`, `confidenceScore`, ordered `topContributors`, `dataCompleteness`.

**Evaluation**: Unit-tested for correctness properties (determinism, bounds, monotonicity, missing-data handling) — see `docs/EVALUATION.md`. Not evaluated against flood observation labels because it is not a statistical model; it should not be described as one.

**Known limitations**:
- Only covers the Mamaroneck, NY pilot AOI.
- Two conceptually useful factors are missing from the current pipeline (see above).
- Weights are hand-set with documented rationale, not fit to data — they have not yet been reviewed/adjusted by the student (see `docs/STUDENT_CHECKPOINTS.md`).

**Prohibited uses**: Emergency response, evacuation guidance, insurance/property valuation, engineering certification, or any claim of prediction outside the pilot AOI.

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

**Training data**: 23,662 real rows, 1,110 real positives (4.7%), from 24 real historical events across 86 real z=9 tiles statewide, including a real second water source (USGS NHD) and a real hydrology feature (topographic wetness index) added after the first iteration. See `docs/EVALUATION.md`.

**Evaluation**: 5-fold grouped cross-validation by event. Best real result: gradient-boosted trees with balanced sample weights — **0.804 mean ROC-AUC (±0.049), 71.5% balanced accuracy**. (Unweighted GBM reports 95.8% raw accuracy, which is barely above the 95.3% trivial "always predict no-flood" baseline at this class balance — reported and explained in `docs/EVALUATION.md`, not hidden.)

**Status**: Experimental. **Never used to generate a user-facing prediction.**

**Known limitations**: `distanceToWaterM` dropped from the trained feature set (NHD improved real coverage from 96% to 45% missing — better, still too incomplete to include without discarding data). Cross-validation, not a locked single-touch test set. Raw accuracy is a misleading metric at this class balance; balanced accuracy and ROC-AUC are reported as the honest numbers.

**Prohibited uses**: Any production use.
