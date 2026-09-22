"""Fetch the real administrative boundary used as FloodAI's pilot AOI.

Pilot area: Village of Mamaroneck, Westchester County, NY. Chosen because it
has a well-documented real flood history (Sheldrake River / Mamaroneck River
pluvial and riverine flooding) and a small enough footprint to keep the
real-data pipeline's disk and runtime cost bounded during development.

Source: OpenStreetMap Nominatim (public, no API key). Real boundary geometry,
not a synthetic bounding box.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_PATH = REPO_ROOT / "data" / "metadata" / "pilot_aoi.geojson"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
QUERY = "Village of Mamaroneck, Westchester County, New York, USA"
USER_AGENT = "FloodAI-CongressionalAppChallenge/0.1 (student project; contact via github.com/shahaklt/flood-ai)"


def fetch_pilot_aoi() -> dict:
    resp = requests.get(
        NOMINATIM_URL,
        params={"q": QUERY, "format": "jsonv2", "polygon_geojson": 1, "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    results = resp.json()
    if not results:
        raise RuntimeError(f"Nominatim returned no results for query: {QUERY!r}")
    result = results[0]

    feature = {
        "type": "Feature",
        "properties": {
            "name": result["display_name"],
            "osm_type": result["osm_type"],
            "osm_id": result["osm_id"],
            "source": "OpenStreetMap Nominatim",
            "sourceUrl": "https://nominatim.openstreetmap.org/",
            "retrievedAt": datetime.now(timezone.utc).isoformat(),
            "license": "ODbL 1.0 (OpenStreetMap contributors)",
            "isSynthetic": False,
            "boundingBoxSWNE": [float(x) for x in result["boundingbox"]],
        },
        "geometry": result["geojson"],
    }
    return {"type": "FeatureCollection", "features": [feature]}


def main() -> None:
    fc = fetch_pilot_aoi()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(fc, indent=2))
    bbox = fc["features"][0]["properties"]["boundingBoxSWNE"]
    print(f"Wrote real pilot AOI boundary to {OUT_PATH}")
    print(f"Bounding box [south, north, west, east]: {bbox}")


if __name__ == "__main__":
    main()
