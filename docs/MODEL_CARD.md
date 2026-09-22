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
