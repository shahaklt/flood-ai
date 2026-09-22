"""Statewide coverage mask: the real New York State boundary (see
scripts/data_pipeline/sources/ny_state_boundary.py). A tile is in FloodAI's
declared coverage only if it intersects this real polygon."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from shapely.geometry import box, shape
from shapely.ops import unary_union

REPO_ROOT = Path(__file__).resolve().parents[3]
BOUNDARY_PATH = REPO_ROOT / "data" / "metadata" / "ny_state_boundary.geojson"


@lru_cache(maxsize=1)
def ny_state_geometry():
    fc = json.loads(BOUNDARY_PATH.read_text())
    geoms = [shape(f["geometry"]) for f in fc["features"]]
    return unary_union(geoms)


def tile_in_coverage(bbox: tuple[float, float, float, float]) -> bool:
    xmin, ymin, xmax, ymax = bbox
    return ny_state_geometry().intersects(box(xmin, ymin, xmax, ymax))
