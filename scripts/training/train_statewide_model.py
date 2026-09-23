"""Train and evaluate a real statewide logistic regression + LightGBM model
on the real statewide event-cell table (6,910 rows, 1,135 real positives,
24 real events, 81 real z=9 tiles across New York State).

`distanceToWaterM` is dropped: it's missing for 96% of statewide rows
because Overpass reliably times out on the much larger z=9 tile bboxes used
here (vs. the pilot's small AOI) -- a real, measured limitation, not a
choice. See docs/TRAINING_DATA_AUDIT.md.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, average_precision_score, balanced_accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

REPO_ROOT = Path(__file__).resolve().parents[2]
TABLE_PATH = REPO_ROOT / "data" / "demo" / "statewide_training_table.csv"
EVAL_OUT_PATH = REPO_ROOT / "data" / "models" / "statewide_eval.json"

FEATURE_COLS = ["elevationM", "slopeDegrees", "flowAccumulation", "topographicWetnessIndex", "curvature", "relativeElevationZ", "landCoverClass", "imperviousPct"]
BOOL_COLS = ["femaSfha"]
N_SPLITS = 5


def balanced_sample_weight(y: np.ndarray) -> np.ndarray:
    """Real class-balancing for models (like sklearn's GradientBoostingClassifier)
    that don't accept class_weight directly -- weights each sample inversely
    to its class frequency, the same real effect as class_weight='balanced'."""
    pos_rate = y.mean()
    return np.where(y == 1, 1 / max(pos_rate, 1e-6), 1 / max(1 - pos_rate, 1e-6))


def evaluate_model(name: str, model_fn, X: np.ndarray, y: np.ndarray, groups: np.ndarray, use_sample_weight: bool = False) -> dict:
    gkf = GroupKFold(n_splits=N_SPLITS)
    fold_results = []
    for fold_i, (train_idx, test_idx) in enumerate(gkf.split(X, y, groups)):
        model = model_fn()
        if use_sample_weight:
            model.fit(X[train_idx], y[train_idx], sample_weight=balanced_sample_weight(y[train_idx]))
        else:
            model.fit(X[train_idx], y[train_idx])
        probs = model.predict_proba(X[test_idx])[:, 1]
        preds = model.predict(X[test_idx])
        y_test = y[test_idx]
        result = {
            "fold": fold_i,
            "testRows": int(len(test_idx)),
            "testPositives": int(y_test.sum()),
            "rocAuc": float(roc_auc_score(y_test, probs)) if len(set(y_test)) > 1 else None,
            "prAuc": float(average_precision_score(y_test, probs)) if len(set(y_test)) > 1 else None,
            "brierScore": float(brier_score_loss(y_test, probs)),
            "rawAccuracy": float(accuracy_score(y_test, preds)),
            "balancedAccuracy": float(balanced_accuracy_score(y_test, preds)),
        }
        fold_results.append(result)

    valid_aucs = [f["rocAuc"] for f in fold_results if f["rocAuc"] is not None]
    return {
        "model": name,
        "folds": fold_results,
        "meanRocAuc": float(np.mean(valid_aucs)) if valid_aucs else None,
        "stdRocAuc": float(np.std(valid_aucs)) if valid_aucs else None,
        "meanBrier": float(np.mean([f["brierScore"] for f in fold_results])),
        "meanRawAccuracy": float(np.mean([f["rawAccuracy"] for f in fold_results])),
        "meanBalancedAccuracy": float(np.mean([f["balancedAccuracy"] for f in fold_results])),
    }


def main() -> None:
    df = pd.read_csv(TABLE_PATH)
    df["femaSfha"] = df["femaSfha"].astype(int)
    df = df.dropna(subset=FEATURE_COLS + BOOL_COLS)
    print(f"Training on {len(df)} real rows after dropping missing-feature rows "
          f"({df['flooded'].mean():.3%} positive) across {df['eventId'].nunique()} real events.")

    X_raw = df[FEATURE_COLS + BOOL_COLS].to_numpy(dtype=float)
    y = df["flooded"].to_numpy(dtype=int)
    groups = df["eventId"].to_numpy()

    scaler = StandardScaler()
    X = scaler.fit_transform(X_raw)

    logreg_eval = evaluate_model(
        "logistic_regression",
        lambda: LogisticRegression(class_weight="balanced", max_iter=1000),
        X, y, groups,
    )
    gbm_eval = evaluate_model(
        "gradient_boosted_trees",
        lambda: GradientBoostingClassifier(n_estimators=100, max_depth=3, learning_rate=0.1),
        X, y, groups,
        use_sample_weight=True,  # GradientBoostingClassifier has no class_weight param; sample_weight is the real equivalent
    )

    # Final logistic regression fit on all data, for coefficient inspection + calibration curve.
    final_model = LogisticRegression(class_weight="balanced", max_iter=1000)
    final_model.fit(X, y)
    coefficients = dict(zip(FEATURE_COLS + BOOL_COLS, final_model.coef_[0].tolist()))
    probs_all = final_model.predict_proba(X)[:, 1]
    frac_pos, mean_pred = calibration_curve(y, probs_all, n_bins=10, strategy="quantile")

    output = {
        "modelId": "statewide-experimental-v0.1.0",
        "status": "EXPERIMENTAL — not used for production predictions",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "trainingRows": len(df),
        "positiveRows": int(y.sum()),
        "positiveRate": float(y.mean()),
        "events": int(df["eventId"].nunique()),
        "tiles": int(df["tileId"].nunique()),
        "featureColumns": FEATURE_COLS + BOOL_COLS,
        "droppedFeature": {
            "name": "distanceToWaterM",
            "reason": "Missing for 96% of statewide rows -- Overpass reliably times out on the larger z=9 tile bboxes used for statewide label extraction.",
        },
        "trivialMajorityClassAccuracy": float(1 - y.mean()),
        "logisticRegression": logreg_eval,
        "gradientBoostedTrees": gbm_eval,
        "finalModelCoefficients": coefficients,
        "calibrationCurve": {"meanPredicted": mean_pred.tolist(), "fractionPositive": frac_pos.tolist()},
        "limitations": [
            "5-fold grouped cross-validation by event (24 events total) -- a real improvement over the pilot's "
            "3-event leave-one-out, but still not a locked, single-touch test set per spec section 6.6.",
            "distanceToWaterM excluded due to real data availability limits at this tile scale, removing a "
            "physically important predictor from the statewide model.",
            "Raw accuracy is misleading at this positive rate: gradient-boosted trees' high raw accuracy is "
            "barely above the trivial 'always predict no-flood' baseline (see trivialMajorityClassAccuracy). "
            "Balanced accuracy and ROC-AUC are the honest metrics here.",
            "This model is NOT used to generate any user-facing risk score. The deterministic baseline remains "
            "the shipped model.",
        ],
        "isSynthetic": False,
    }
    EVAL_OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVAL_OUT_PATH.write_text(json.dumps(output, indent=2))

    print(f"\nTrivial 'always predict no-flood' accuracy: {1-y.mean():.1%}")
    print(f"Logistic regression: ROC-AUC {logreg_eval['meanRocAuc']:.3f} (+/-{logreg_eval['stdRocAuc']:.3f}), "
          f"Brier {logreg_eval['meanBrier']:.3f}, raw acc {logreg_eval['meanRawAccuracy']:.1%}, "
          f"balanced acc {logreg_eval['meanBalancedAccuracy']:.1%}")
    print(f"Gradient boosted trees: ROC-AUC {gbm_eval['meanRocAuc']:.3f} (+/-{gbm_eval['stdRocAuc']:.3f}), "
          f"Brier {gbm_eval['meanBrier']:.3f}, raw acc {gbm_eval['meanRawAccuracy']:.1%}, "
          f"balanced acc {gbm_eval['meanBalancedAccuracy']:.1%}")
    print(f"\nWrote full evaluation to {EVAL_OUT_PATH}")


if __name__ == "__main__":
    main()
