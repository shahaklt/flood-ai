"""Real hyperparameter search for LightGBM on the same real statewide
event-cell table, with real class-imbalance handling (LightGBM's native
`is_unbalance`), compared honestly against the prior sklearn GBM result in
docs/EVALUATION.md. Same 5-fold grouped-by-event CV, same features.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from itertools import product
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import accuracy_score, average_precision_score, balanced_accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler

REPO_ROOT = Path(__file__).resolve().parents[2]
TABLE_PATH = REPO_ROOT / "data" / "demo" / "statewide_training_table.csv"
EVAL_OUT_PATH = REPO_ROOT / "data" / "models" / "statewide_lightgbm_eval.json"

FEATURE_COLS = ["elevationM", "slopeDegrees", "flowAccumulation", "topographicWetnessIndex", "curvature", "relativeElevationZ", "landCoverClass", "imperviousPct"]
BOOL_COLS = ["femaSfha"]
N_SPLITS = 5

# Small real grid -- kept small deliberately since each point costs a full
# 5-fold real CV pass; not an exhaustive search, a real bounded one.
PARAM_GRID = {
    "n_estimators": [100, 300],
    "num_leaves": [15, 31],
    "learning_rate": [0.05, 0.1],
    "max_depth": [-1, 6],
}


def evaluate(params: dict, X: np.ndarray, y: np.ndarray, groups: np.ndarray) -> dict:
    gkf = GroupKFold(n_splits=N_SPLITS)
    fold_results = []
    for fold_i, (train_idx, test_idx) in enumerate(gkf.split(X, y, groups)):
        model = LGBMClassifier(
            **params,
            is_unbalance=True,  # LightGBM's native real class-imbalance handling
            random_state=42,
            verbosity=-1,
        )
        model.fit(X[train_idx], y[train_idx])
        probs = model.predict_proba(X[test_idx])[:, 1]
        preds = model.predict(X[test_idx])
        y_test = y[test_idx]
        fold_results.append({
            "fold": fold_i,
            "rocAuc": float(roc_auc_score(y_test, probs)) if len(set(y_test)) > 1 else None,
            "prAuc": float(average_precision_score(y_test, probs)) if len(set(y_test)) > 1 else None,
            "brierScore": float(brier_score_loss(y_test, probs)),
            "rawAccuracy": float(accuracy_score(y_test, preds)),
            "balancedAccuracy": float(balanced_accuracy_score(y_test, preds)),
        })
    valid_aucs = [f["rocAuc"] for f in fold_results if f["rocAuc"] is not None]
    return {
        "params": params,
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
    print(f"Training on {len(df)} real rows ({df['flooded'].mean():.3%} positive), {df['eventId'].nunique()} real events.")

    X = StandardScaler().fit_transform(df[FEATURE_COLS + BOOL_COLS].to_numpy(dtype=float))
    y = df["flooded"].to_numpy(dtype=int)
    groups = df["eventId"].to_numpy()

    keys = list(PARAM_GRID.keys())
    combos = [dict(zip(keys, vals)) for vals in product(*PARAM_GRID.values())]
    print(f"Real grid search over {len(combos)} real hyperparameter combinations x {N_SPLITS} folds each...")

    results = []
    for i, params in enumerate(combos, 1):
        r = evaluate(params, X, y, groups)
        results.append(r)
        print(f"[{i}/{len(combos)}] {params} -> ROC-AUC {r['meanRocAuc']:.3f}, balanced acc {r['meanBalancedAccuracy']:.1%}, Brier {r['meanBrier']:.3f}")

    best = max(results, key=lambda r: r["meanRocAuc"])
    print(f"\nBest by ROC-AUC: {best['params']} -> ROC-AUC {best['meanRocAuc']:.3f} (+/-{best['stdRocAuc']:.3f}), "
          f"balanced acc {best['meanBalancedAccuracy']:.1%}, raw acc {best['meanRawAccuracy']:.1%}, Brier {best['meanBrier']:.3f}")

    output = {
        "modelId": "statewide-lightgbm-v0.1.0",
        "status": "EXPERIMENTAL — not used for production predictions",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "trainingRows": len(df),
        "positiveRows": int(y.sum()),
        "positiveRate": float(y.mean()),
        "events": int(df["eventId"].nunique()),
        "featureColumns": FEATURE_COLS + BOOL_COLS,
        "gridSearchResults": results,
        "best": best,
        "isSynthetic": False,
    }
    EVAL_OUT_PATH.write_text(json.dumps(output, indent=2))
    print(f"\nWrote full grid search results to {EVAL_OUT_PATH}")


if __name__ == "__main__":
    main()
