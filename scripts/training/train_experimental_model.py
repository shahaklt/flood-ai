"""Fit an EXPERIMENTAL logistic regression on the real event-cell training
table (see docs/TRAINING_DATA_AUDIT.md). This is not the model FloodAI
ships: with only 6 real positive observations across 3 events, no held-out
split can produce a statistically defensible generalization estimate. This
script exists to do the real, honest work anyway — fit on real data only,
report real (necessarily noisy/wide) metrics, and document the limitation
plainly in docs/EVALUATION.md and docs/MODEL_CARD.md — rather than skip
supervised modeling entirely or fabricate confidence it doesn't have.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.preprocessing import StandardScaler

REPO_ROOT = Path(__file__).resolve().parents[2]
TABLE_PATH = REPO_ROOT / "data" / "demo" / "event_cell_training_table.csv"
EVAL_OUT_PATH = REPO_ROOT / "data" / "models" / "experimental_logreg_eval.json"

FEATURE_COLS = ["elevationM", "slopeDegrees", "landCoverClass", "imperviousPct",
                 "distanceToWaterM", "distanceToRoadM", "relativeElevationZ"]
# femaSfha is boolean; handled separately since it's not continuous
BOOL_COLS = ["femaSfha"]


def main() -> None:
    df = pd.read_csv(TABLE_PATH)
    if df.empty:
        print("Training table is empty. Run build_event_cell_table.py first.")
        return

    df["femaSfha"] = df["femaSfha"].astype(int)
    X = df[FEATURE_COLS + BOOL_COLS].to_numpy(dtype=float)
    y = df["flooded"].to_numpy(dtype=int)
    groups = df["eventId"].to_numpy()

    n_pos, n_total = int(y.sum()), len(y)
    print(f"Fitting on {n_total} rows, {n_pos} positive ({n_pos/n_total:.3%}), "
          f"across {df['eventId'].nunique()} events.")

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # In-sample fit (final model, for coefficient inspection only — NOT for
    # claiming generalization).
    final_model = LogisticRegression(class_weight="balanced", max_iter=1000)
    final_model.fit(X_scaled, y)
    coefficients = dict(zip(FEATURE_COLS + BOOL_COLS, final_model.coef_[0].tolist()))

    # Leave-one-event-out evaluation: the only grouping that avoids obvious
    # leakage here, at n=3 groups. Explicitly reported as high-variance.
    logo = LeaveOneGroupOut()
    fold_results = []
    for fold_i, (train_idx, test_idx) in enumerate(logo.split(X_scaled, y, groups)):
        y_train, y_test = y[train_idx], y[test_idx]
        if y_train.sum() == 0 or y_train.sum() == len(y_train):
            fold_results.append({"fold": fold_i, "heldOutEvent": str(groups[test_idx][0]),
                                  "skipped": "training fold had no class variation"})
            continue
        model = LogisticRegression(class_weight="balanced", max_iter=1000)
        model.fit(X_scaled[train_idx], y_train)
        probs = model.predict_proba(X_scaled[test_idx])[:, 1]
        result = {
            "fold": fold_i,
            "heldOutEvent": str(groups[test_idx][0]),
            "testRows": int(len(test_idx)),
            "testPositives": int(y_test.sum()),
            "brierScore": float(brier_score_loss(y_test, probs)),
        }
        if len(set(y_test)) > 1:
            result["rocAuc"] = float(roc_auc_score(y_test, probs))
        else:
            result["rocAuc"] = None
            result["note"] = "held-out event had only one class present; ROC-AUC undefined"
        fold_results.append(result)

    output = {
        "modelId": "experimental-logreg-v0.1.0",
        "status": "EXPERIMENTAL — not used for production predictions",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "trainingRows": n_total,
        "positiveRows": n_pos,
        "positiveRate": n_pos / n_total,
        "events": sorted(df["eventId"].unique().tolist()),
        "featureColumns": FEATURE_COLS + BOOL_COLS,
        "inSampleCoefficients": coefficients,
        "leaveOneEventOutFolds": fold_results,
        "limitations": [
            "Only 6 real positive observations total across 3 events — far too few for a "
            "statistically defensible held-out estimate.",
            "Leave-one-event-out folds are reported for transparency, not as evidence of "
            "generalization; each fold's test set is a single event with very few or zero "
            "positives, so ROC-AUC/Brier values here are expected to be highly unstable.",
            "This model is NOT used to generate any user-facing risk score. The deterministic "
            "baseline (packages/shared/src/baselineWeights.ts) remains the shipped model.",
        ],
        "isSynthetic": False,
    }
    EVAL_OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVAL_OUT_PATH.write_text(json.dumps(output, indent=2))
    print(json.dumps(output, indent=2))
    print(f"\nWrote experimental evaluation to {EVAL_OUT_PATH}")


if __name__ == "__main__":
    main()
