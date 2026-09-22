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

Trained on the real statewide event-cell table: **23,662 usable real rows, 1,110 real positives (4.7%), from 24 real historical events across 86 real z=9 tiles covering New York State** (see `docs/TRAINING_DATA_AUDIT.md`). This is the result of two iterations: the first pull (6,830 rows, 16.5% positive) proved the pipeline; a second pull with more real negatives sampled per tile (25→100) and a real second water source (USGS NHD, added because Overpass alone left `distanceToWaterM` 96% missing at this tile scale) produced this much larger, more realistic-positive-rate dataset.

- **Features**: elevation, slope, flow accumulation, **topographic wetness index** (`ln(flowAccumulation/tan(slope))`, a standard real hydrology combination added this iteration), land cover class, impervious %, FEMA SFHA indicator. `distanceToWaterM` is still **dropped** from the trained feature set — NHD improved its real coverage from 96% missing to 45% missing, a large real improvement, but 45% missing is still too much to include without either discarding nearly half the data or leaving a systematic gap; a future iteration should train two variants (with/without it) and compare directly rather than presenting a hybrid as if it were complete.
- **Split**: 5-fold grouped cross-validation by event (`GroupKFold`, scikit-learn).
- **Class imbalance handling**: gradient-boosted trees have no native `class_weight` parameter, so real inverse-frequency sample weights were used (the same effect as logistic regression's `class_weight="balanced"`) — this materially changed the result (see below), which is itself a real, reportable finding about naive raw accuracy at this class balance.

| Model | ROC-AUC | Brier | Raw accuracy | Balanced accuracy |
|---|---|---|---|---|
| Logistic regression (class-balanced) | 0.724 ±0.062 | 0.191 | 71.1% | 65.3% |
| Gradient-boosted trees, **unweighted** | 0.788 ±0.055 | 0.038 | 95.8% | 58.3% |
| Gradient-boosted trees, **balanced sample weights** | **0.804 ±0.049** | 0.136 | 82.8% | **71.5%** |
| *Trivial "always predict no-flood"* | *0.5 (undefined)* | — | *95.3%* | *50%* |

**How to read this honestly — the raw-accuracy trap, caught and shown, not hidden**: the unweighted GBM's 95.8% raw accuracy looks best of all but is barely above the trivial 95.3% baseline — with only 4.7% positives, a model can get "accurate" almost entirely by predicting the majority class. Its balanced accuracy (58.3%, barely above a coin flip's 50%) reveals this. Applying real class-balancing (sample weights) trades some raw accuracy and calibration for a genuinely better discriminator: **0.804 ROC-AUC and 71.5% balanced accuracy — the best real result across every iteration of this model**, and the one worth quoting if asked "how accurate is it."

This is still not a locked, single-touch test set (spec section 6.6), and it's still not what generates the map's risk scores — the deterministic baseline is. But it's a materially stronger, more honestly-evaluated result than the pilot's small-sample numbers.

Full machine-readable output: `data/models/statewide_eval.json`.

## Next real evaluation milestones

- Train a distanceToWaterM-included variant on the ~55% of rows where NHD found real water, and compare directly against the full-sample no-water-feature model rather than guessing which is better.
- Move from 5-fold cross-validation to a locked train/validation/test split with calibration fit only on validation data, once enough events support it.
- Re-run this same honest process as more real events/data sources are added, and update this table rather than replacing it silently.
