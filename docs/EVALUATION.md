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
| DFO_3625 (Mar 2010 nor'easter) | 1,197 | 22 | 0.894 | 0.034 |
| DFO_3629 (late Mar 2010) | 1,197 | 10 | 0.973 | 0.091 |
| DFO_3861 (Hurricane Irene, 2011) | 1,197 | 6 | 0.983 | 0.092 |

**How to read this table honestly**: these ROC-AUC values look strong, and the underlying physical signal (flooded cells really do skew toward low elevation and water proximity, which the in-sample coefficients confirm) is real — but with 6-22 positive examples per held-out fold (all drawn from just 3 real events, at a small pilot AOI), each number still carries real variance and would likely look different with a different set of events. This is not a validated model. It is reported to show the pipeline and method work end to end on entirely real data, and to give the student a concrete, honest number to reason about rather than an abstract placeholder.

Full machine-readable output: `data/models/experimental_logreg_eval.json`.

**What would change this model's status**: enough additional real positive events (from expanding the pilot AOI, adding NYC's Stormwater/311 layers if the AOI grows to include NYC, or waiting for more GFD events to accumulate) to support a real train/validation/test split with double-digit positives per split, calibration fit only on validation data, and a locked test set touched once — per spec section 6.6.

## Next real evaluation milestones

- Expand feature coverage (flow accumulation, hydrologic soil group) to close the two structurally-missing baseline factors documented in `packages/risk-runtime/src/baseline.ts`.
- Re-run this same honest process if/when the pilot AOI expands, and update this table rather than replacing it silently.
