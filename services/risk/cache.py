"""Disk cache for computed tile features, keyed by data version + z/x/y.
Grows only as real tiles are actually viewed (never precomputed in bulk) —
this is what makes statewide coverage tractable without a statewide
download. Never committed to git (data/cache/ is gitignored)."""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = REPO_ROOT / "data" / "cache" / "tiles"
DATA_VERSION = "risk-tiles-v1-nystate"


def cache_path(z: int, x: int, y: int) -> Path:
    return CACHE_DIR / DATA_VERSION / str(z) / str(x) / f"{y}.json"


def read_cached(z: int, x: int, y: int) -> dict | None:
    path = cache_path(z, x, y)
    if path.exists():
        return json.loads(path.read_text())
    return None


def write_cache(z: int, x: int, y: int, payload: dict) -> None:
    path = cache_path(z, x, y)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload))
