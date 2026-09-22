"""Real-time, per-tile FEMA flood hazard zone fetch (public ArcGIS REST, no
API key). Parameterized by bbox, same service as the pilot's
scripts/data_pipeline/sources/fema_nfhl.py.
"""
from __future__ import annotations

import requests
from shapely.geometry import shape
from shapely.ops import unary_union

LAYER_URL = "https://msc.fema.gov/arcgis/rest/services/NFHL_Print/NFHL/MapServer/14/query"


def fetch_fema_sfha_union(bbox: tuple[float, float, float, float]):
    """Returns a shapely geometry (union of Special Flood Hazard Area zones)
    or None if FEMA has no mapped SFHA in this bbox. Never raises for "no
    data" — only for a genuine request failure."""
    xmin, ymin, xmax, ymax = bbox
    resp = requests.get(
        LAYER_URL,
        params={
            "geometry": f"{xmin},{ymin},{xmax},{ymax}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": 4326,
            "outSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "SFHA_TF",
            "f": "geojson",
        },
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"FEMA NFHL error: {data['error']}")
    sfha_geoms = [shape(f["geometry"]) for f in data.get("features", []) if f["properties"].get("SFHA_TF") == "T"]
    if not sfha_geoms:
        return None
    return unary_union(sfha_geoms)
