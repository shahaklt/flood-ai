"""Real-time, per-tile surface-water fetch from OpenStreetMap Overpass
(public, no API key). Parameterized by bbox. Used only for the
distance-to-water feature; road/facility exposure layers remain scoped to
the pilot AOI for now (see docs/STUDENT_CHECKPOINTS.md).
"""
from __future__ import annotations

import time

import requests
from shapely.geometry import LineString
from shapely.ops import unary_union

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "FloodAI-CongressionalAppChallenge/0.1 (student project; contact via github.com/shahaklt/flood-ai)"


def fetch_water_union(bbox: tuple[float, float, float, float], retries: int = 1):
    """Returns a shapely geometry (union of water lines/polygons) or None if
    none found or the request fails (treated as missing data, not zero risk).

    Includes `natural=coastline` explicitly — the ocean/tidal edge is tagged
    as a coastline way in OSM, not `natural=water`, so omitting it silently
    dropped every ocean-adjacent tile's water-proximity signal (a real bug
    caught by inspecting ocean-adjacent tiles that showed no elevated risk)."""
    south, west, north, east = bbox[1], bbox[0], bbox[3], bbox[2]
    query = f"""
        [out:json][timeout:15];
        (
          way["waterway"]({south},{west},{north},{east});
          way["natural"="water"]({south},{west},{north},{east});
          way["natural"="coastline"]({south},{west},{north},{east});
        );
        out geom;
    """
    data = None
    for attempt in range(retries + 1):
        try:
            resp = requests.post(OVERPASS_URL, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=20)
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.RequestException:
            if attempt < retries:
                time.sleep(1)
                continue
            return None
    if data is None:
        return None

    lines = []
    for el in data.get("elements", []):
        if el.get("type") == "way" and "geometry" in el and len(el["geometry"]) >= 2:
            lines.append(LineString([(pt["lon"], pt["lat"]) for pt in el["geometry"]]))
    if not lines:
        return None
    return unary_union(lines)
