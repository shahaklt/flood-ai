"""Real hydrologic soil group fetch, per tile, from USDA's Soil Data Access
(SDA) service (public REST, no API key). Closes the one conceptual factor
the baseline model previously listed as structurally missing (see
packages/risk-runtime/src/baseline.ts's former STRUCTURALLY_MISSING_FACTORS).

Soil survey mapunits are far coarser than the ~100 m analysis grid, and SDA
has no efficient way to bulk-sample many points in one call, so this
queries the tile's centroid once and applies that single real value to
every cell in the tile -- the same tile-scale simplification already used
for other factors in this pipeline (documented, not hidden).
"""
from __future__ import annotations

import requests

SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"
VALID_GROUPS = {"A", "B", "C", "D"}


def fetch_hydrologic_soil_group(bbox: tuple[float, float, float, float]) -> str | None:
    """Returns the dominant real hydrologic soil group ("A"-"D") at the
    tile's centroid, or None if SDA has no classified soil there (common in
    dense urban/built-up areas, where the dominant real mapunit is often
    unclassified). Never fabricated -- a missing real answer stays None."""
    xmin, ymin, xmax, ymax = bbox
    lon, lat = (xmin + xmax) / 2, (ymin + ymax) / 2
    query = (
        "SELECT c.hydgrp, c.comppct_r FROM component c "
        "WHERE c.mukey IN (SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84("
        f"'point({lon} {lat})')) ORDER BY c.comppct_r DESC"
    )
    resp = requests.post(SDA_URL, json={"format": "JSON", "query": query}, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    rows = data.get("Table") or []
    for hydgrp, _pct in rows:
        if not hydgrp:
            continue
        # Dual classes (e.g. "A/D") describe drained/undrained condition --
        # the second letter is the natural, undrained state, the
        # conservative (higher-runoff) real choice for a pluvial-flood risk
        # model that doesn't know this cell's actual drainage status.
        group = hydgrp.split("/")[-1].strip().upper()
        if group in VALID_GROUPS:
            return group
    return None
