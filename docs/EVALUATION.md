# Evaluation

This document reports real, computed results only — no placeholder metrics. It currently covers the Phase 1/3 pilot work (Village of Mamaroneck, NY); it is extended as the pipeline and models grow.

## Deterministic baseline (shipped model)

The baseline (`packages/shared/src/baselineWeights.ts`, `packages/risk-runtime/src/baseline.ts`) is not a statistical model and has no accuracy metric in the ROC-AUC/precision-recall sense — it is a documented, versioned formula over real features. Its correctness is checked with unit tests (`packages/risk-runtime/src/baseline.test.ts`): determinism, 0-100 bounds, category-threshold consistency, monotonicity (increasing a harmful factor never decreases score), and confidence correctly dropping when real data is missing.

## Experimental supervised model (NOT shipped)

**Status: experimental only. This model does not generate any user-facing prediction.** See `docs/TRAINING_DATA_AUDIT.md` for why.

- **Data**: 3,591 real event-cell rows from 3 real Global Flood Database events (a March 2010 nor'easter, a late-March 2010 event, and Hurricane Irene, August 2011) intersecting the pilot AOI at its current 100 m grid resolution, after excluding permanent water and low satellite-observation-quality cells. **38 real positive observations total.**
- **Split**: Leave-one-event-out (3 folds — the only grouping available at n=3 events that avoids training and testing on the same event).
- **Model**: Logistic regression, class-balanced, on 8 real features (elevation, slope, land cover class, impervious %, distance to water, distance to road, relative elevation z-score, FEMA SFHA indicator).

| Held-out event | Test rows | Test positives | ROC-AUC | Brier score |
|---|---|---|---|---|
| DFO_3625 (Mar 2010 nor'easter) | 1,197 | 22 | 0.880 | 0.066 |
| DFO_3629 (late Mar 2010) | 1,197 | 10 | 0.958 | 0.106 |
| DFO_3861 (Hurricane Irene, 2011) | 1,197 | 6 | 0.948 | 0.105 |

*(Updated after fixing a real bug where the OSM water query excluded `natural=coastline` — ocean-adjacent cells were missing their water-proximity feature entirely. This pilot AOI is coastal, so the fix changed real feature values for many cells; see `docs/STUDENT_CHECKPOINTS.md`.)*

**How to read this table honestly**: these ROC-AUC values look strong, and the underlying physical signal (flooded cells really do skew toward low elevation and water proximity, which the in-sample coefficients confirm) is real — but with 6-22 positive examples per held-out fold (all drawn from just 3 real events, at a small pilot AOI), each number still carries real variance and would likely look different with a different set of events. This is not a validated model. It is reported to show the pipeline and method work end to end on entirely real data, and to give the student a concrete, honest number to reason about rather than an abstract placeholder.

Full machine-readable output: `data/models/experimental_logreg_eval.json`.

**What would change this model's status**: enough additional real positive events (from expanding the pilot AOI, adding NYC's Stormwater/311 layers if the AOI grows to include NYC, or waiting for more GFD events to accumulate) to support a real train/validation/test split with double-digit positives per split, calibration fit only on validation data, and a locked test set touched once — per spec section 6.6.

## Statewide experimental model (`statewide-experimental-v0.1.0`) — NOT shipped

Trained on the real statewide event-cell table: **6,830 real rows, 1,130 real positives (16.5%), from 24 real historical events across 81 real z=9 tiles covering all of New York State** (see `docs/TRAINING_DATA_AUDIT.md` for how these were pulled). This is a substantial upgrade over the pilot-only model: 24 events instead of 3, and a much more balanced positive rate.

- **Features**: elevation, slope, flow accumulation, relative elevation z-score, land cover class, impervious %, FEMA SFHA indicator. `distanceToWaterM` was **dropped** — it's missing for 96% of statewide rows because Overpass reliably times out on the larger z=9 tile bounding boxes used here (a real, measured limitation, not a choice).
- **Split**: 5-fold grouped cross-validation by event (`GroupKFold`, scikit-learn) — a real improvement over the pilot's 3-event leave-one-out, though still not a single locked test set per spec section 6.6.

| Model | Mean ROC-AUC | Std | Mean Brier |
|---|---|---|---|
| Logistic regression (class-balanced) | 0.722 | ±0.052 | 0.197 |
| Gradient-boosted trees (100 est., depth 3) | 0.799 | ±0.055 | 0.102 |

**How to read this honestly**: these numbers are more believable than the pilot's 0.88-0.98 (which came from only 3 events and 6-22 positives per fold) precisely because they're lower and more consistent across 5 folds of 24 real events — this is what a real, larger, still-imperfect sample looks like. Gradient-boosted trees meaningfully outperform logistic regression, consistent with the spec's expectation that a calibrated tree model should beat the interpretable baseline once there's enough data to support one. This is still not a locked, single-touch test set, and `distanceToWaterM`'s exclusion removes a physically important predictor — so this remains experimental, not shipped.

Full machine-readable output: `data/models/statewide_eval.json`.

## Next real evaluation milestones

- Fix or replace the statewide water-proximity source (Overpass times out at z=9 tile scale) so `distanceToWaterM` can rejoin the statewide feature set — likely via USGS NHD flowlines, which don't depend on Overpass.
- Move from 5-fold cross-validation to a locked train/validation/test split with calibration fit only on validation data, once enough events support it.
- Re-run this same honest process as more real events/data sources are added, and update this table rather than replacing it silently.
