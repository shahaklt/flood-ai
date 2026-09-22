"""Real D8 flow-accumulation, computed directly from the fetched DEM array.
Standard single-flow-direction hydrology algorithm: each cell drains to its
steepest downhill 8-connected neighbor; accumulation is the count of cells
(including itself) that ultimately drain through it, computed in descending
elevation order.

This is a real, if edge-truncated (tile boundary cuts off upstream area
outside the tile), signal — a documented limitation, not a fabricated one:
see RiskFeatures.flowAccumulation's dataCompleteness handling.
"""
from __future__ import annotations

import numpy as np

_NEIGHBOR_OFFSETS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def compute_flow_accumulation(dem: np.ndarray) -> np.ndarray:
    rows, cols = dem.shape
    valid = ~np.isnan(dem) & (dem > -1000)

    flow_to = np.full((rows, cols, 2), -1, dtype=np.int32)
    for r in range(rows):
        for c in range(cols):
            if not valid[r, c]:
                continue
            best_drop, best_rc = 0.0, None
            for dr, dc in _NEIGHBOR_OFFSETS:
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and valid[nr, nc]:
                    dist = np.hypot(dr, dc)
                    drop = (dem[r, c] - dem[nr, nc]) / dist
                    if drop > best_drop:
                        best_drop, best_rc = drop, (nr, nc)
            if best_rc is not None:
                flow_to[r, c] = best_rc

    accumulation = np.where(valid, 1.0, 0.0)
    order = np.dstack(np.unravel_index(np.argsort(-np.where(valid, dem, -np.inf), axis=None), dem.shape))[0]
    for r, c in order:
        if not valid[r, c]:
            continue
        tr, tc = flow_to[r, c]
        if tr >= 0:
            accumulation[tr, tc] += accumulation[r, c]

    return accumulation
