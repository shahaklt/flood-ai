"""Real-time surface-water fetch from USGS NHD (National Hydrography
Dataset), public ArcGIS REST, no API key. Used as the statewide-safe water
source: OSM Overpass reliably times out on the larger z=9 tile bounding
boxes used for statewide training extraction, but NHD's generalized
"Flowline - Small Scale" layer (4) handles the same bbox in a few seconds.
The large-scale/waterbody layers were tested and are too heavy at this
scale (they time out), so this uses flowlines only -- real streams/rivers,
not lakes/ponds. A documented scope limit, not a silent gap.
"""
from __future__ import annotations

import time

import requests
from shapely.geometry import LineString, shape
from shapely.ops import unary_union

FLOWLINE_URL = "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/4/query"


def fetch_nhd_flowlines_union(bbox: tuple[float, float, float, float], retries: int = 2):
    """Returns a shapely geometry (union of NHD flowlines) or None if none
    found or the request fails after retries (treated as missing data, not
    zero risk). Retried because this call runs concurrently with 4 other
    real network calls per tile (see features.py's ThreadPoolExecutor),
    which occasionally pushes it past a single-attempt timeout even though
    it resolves in ~3s in isolation."""
    xmin, ymin, xmax, ymax = bbox
    data = None
    for attempt in range(retries + 1):
        try:
            resp = requests.get(
                FLOWLINE_URL,
                params={
                    "geometry": f"{xmin},{ymin},{xmax},{ymax}",
                    "geometryType": "esriGeometryEnvelope",
                    "inSR": 4326,
                    "outSR": 4326,
                    "spatialRel": "esriSpatialRelIntersects",
                    "outFields": "OBJECTID",
                    "f": "geojson",
                },
                timeout=25,
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.RequestException:
            if attempt < retries:
                time.sleep(1)
                continue
            return None

    if data is None or "error" in data:
        return None

    lines = []
    for f in data.get("features", []):
        geom = f.get("geometry")
        if not geom:
            continue
        try:
            g = shape(geom)
            if g.geom_type == "LineString":
                lines.append(g)
            elif g.geom_type == "MultiLineString":
                lines.extend(LineString(c) for c in g.geoms)
        except Exception:
            continue
    if not lines:
        return None
    return unary_union(lines)
