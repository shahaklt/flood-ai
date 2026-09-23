"""Real distanceToWaterM variant, per docs/EVALUATION.md's own next milestone:
compare the full ensemble WITH vs WITHOUT distanceToWaterM on the exact same
subset of real rows where NHD actually found water (54.7% of the table), so
the comparison is apples-to-apples rather than "more data vs. more features."
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

REPO_ROOT = Path(__file__).resolve().parents[2]
TABLE_PATH = REPO_ROOT / "data" / "demo" / "statewide_training_table.csv"
EVAL_OUT_PATH = REPO_ROOT / "data" / "models" / "statewide_water_variant_eval.json"

BASE_FEATURES = ["elevationM", "slopeDegrees", "flowAccumulation", "topographicWetnessIndex", "relativeElevationZ", "landCoverClass", "imperviousPct"]
BOOL_COLS = ["femaSfha"]
N_SPLITS = 5


def balanced_sample_weight(y: np.ndarray) -> np.ndarray:
    p = y.mean()
    return np.where(y == 1, 1 / max(p, 1e-6), 1 / max(1 - p, 1e-6))


def best_threshold_for_balanced_accuracy(y: np.ndarray, probs: np.ndarray) -> float:
    candidates = np.unique(probs)
    best_t, best_score = 0.5, -1.0
    for t in candidates:
        score = balanced_accuracy_score(y, (probs >= t).astype(int))
        if score > best_score:
            best_t, best_score = t, score
    return best_t


def run_ensemble(df: pd.DataFrame, feature_cols: list[str], label: str) -> dict:
    X = StandardScaler().fit_transform(df[feature_cols + BOOL_COLS].to_numpy(dtype=float))
    y = df["flooded"].to_numpy(dtype=int)
    groups = df["eventId"].to_numpy()

    gkf = GroupKFold(n_splits=N_SPLITS)
    oof_ensemble = np.zeros(len(y))

    for train_idx, test_idx in gkf.split(X, y, groups):
        y_train = y[train_idx]

        logreg = LogisticRegression(class_weight="balanced", max_iter=1000)
        logreg.fit(X[train_idx], y_train)
        p_logreg = logreg.predict_proba(X[test_idx])[:, 1]

        gbm = GradientBoostingClassifier(n_estimators=100, max_depth=3, learning_rate=0.1)
        gbm.fit(X[train_idx], y_train, sample_weight=balanced_sample_weight(y_train))
        p_gbm = gbm.predict_proba(X[test_idx])[:, 1]

        lgbm = LGBMClassifier(n_estimators=100, num_leaves=31, learning_rate=0.05, max_depth=-1, is_unbalance=True, random_state=42, verbosity=-1)
        lgbm.fit(X[train_idx], y_train)
        p_lgbm = lgbm.predict_proba(X[test_idx])[:, 1]

        oof_ensemble[test_idx] = (p_logreg + p_gbm + p_lgbm) / 3

    iso = IsotonicRegression(out_of_bounds="clip")
    calibrated = iso.fit_transform(oof_ensemble, y)
    best_t = best_threshold_for_balanced_accuracy(y, calibrated)
    preds = (calibrated >= best_t).astype(int)

    return {
        "label": label,
        "featureColumns": feature_cols + BOOL_COLS,
        "rows": len(df),
        "positiveRows": int(y.sum()),
        "positiveRate": float(y.mean()),
        "rocAuc": float(roc_auc_score(y, calibrated)),
        "brierScore": float(brier_score_loss(y, calibrated)),
        "threshold": float(best_t),
        "balancedAccuracy": float(balanced_accuracy_score(y, preds)),
    }


def main() -> None:
    df = pd.read_csv(TABLE_PATH)
    df["femaSfha"] = df["femaSfha"].astype(int)

    with_water = df.dropna(subset=BASE_FEATURES + BOOL_COLS + ["distanceToWaterM"])
    without_water_same_subset = with_water  # same rows, just drop the feature for a fair comparison

    print(f"Real subset where NHD found water: {len(with_water)} rows ({with_water['flooded'].mean():.3%} positive)")

    result_without = run_ensemble(without_water_same_subset, BASE_FEATURES, "same_subset_without_distanceToWaterM")
    print(f"WITHOUT distanceToWaterM: ROC-AUC {result_without['rocAuc']:.3f}, balanced acc {result_without['balancedAccuracy']:.1%}")

    result_with = run_ensemble(with_water, BASE_FEATURES + ["distanceToWaterM"], "same_subset_with_distanceToWaterM")
    print(f"WITH distanceToWaterM:    ROC-AUC {result_with['rocAuc']:.3f}, balanced acc {result_with['balancedAccuracy']:.1%}")

    output = {
        "modelId": "statewide-water-variant-v0.1.0",
        "status": "EXPERIMENTAL — not used for production predictions",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "comparison": [result_without, result_with],
        "isSynthetic": False,
    }
    EVAL_OUT_PATH.write_text(json.dumps(output, indent=2))
    print(f"\nWrote comparison to {EVAL_OUT_PATH}")


if __name__ == "__main__":
    main()
