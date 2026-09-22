"""Pull real roads, public facilities, and surface-water features for the
pilot AOI from OpenStreetMap via the Overpass API (public, no API key).
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
AOI_PATH = REPO_ROOT / "data" / "metadata" / "pilot_aoi.geojson"
RAW_DIR = REPO_ROOT / "data" / "raw"
METADATA_PATH = REPO_ROOT / "data" / "metadata" / "sources.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "FloodAI-CongressionalAppChallenge/0.1 (student project; contact via github.com/shahaklt/flood-ai)"
RETRIEVED_AT = datetime.now(timezone.utc).isoformat()

QUERIES = {
    "osm_roads.json": """
        [out:json][timeout:60];
        way["highway"]({{bbox}});
        out geom;
    """,
    "osm_facilities.json": """
        [out:json][timeout:60];
        (
          node["amenity"~"^(school|hospital|fire_station|police)$"]({{bbox}});
          way["amenity"~"^(school|hospital|fire_station|police)$"]({{bbox}});
          node["emergency"="shelter"]({{bbox}});
          way["emergency"="shelter"]({{bbox}});
          node["railway"="station"]({{bbox}});
          way["railway"="station"]({{bbox}});
        );
        out center;
    """,
    "osm_water.json": """
        [out:json][timeout:60];
        (
          way["waterway"]({{bbox}});
          way["natural"="water"]({{bbox}});
          relation["natural"="water"]({{bbox}});
          way["natural"="coastline"]({{bbox}});
        );
        out geom;
    """,
}


def load_bbox_padded(pad: float = 0.01) -> tuple[float, float, float, float]:
    aoi = json.loads(AOI_PATH.read_text())
    south, north, west, east = aoi["features"][0]["properties"]["boundingBoxSWNE"]
    return south - pad, west - pad, north + pad, east + pad  # Overpass bbox order: s,w,n,e


def run_query(name: str, template: str, bbox_str: str, retries: int = 3) -> int:
    query = template.replace("{{bbox}}", bbox_str)
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.post(
                OVERPASS_URL,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
                timeout=180,
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except (requests.exceptions.HTTPError, requests.exceptions.Timeout) as exc:
            last_exc = exc
            print(f"Attempt {attempt}/{retries} for {name} failed: {exc}. Retrying...")
            time.sleep(10 * attempt)
    else:
        raise RuntimeError(f"Overpass query for {name} failed after {retries} attempts") from last_exc
    out_path = RAW_DIR / name
    out_path.write_text(json.dumps(data))
    n = len(data.get("elements", []))
    print(f"Wrote {n} real OSM elements to {out_path}")
    return n


def record_provenance(bbox_str: str, counts: dict[str, int]) -> None:
    entries = []
    if METADATA_PATH.exists():
        entries = json.loads(METADATA_PATH.read_text())
    entries = [e for e in entries if e["id"] != "osm-overpass-pilot"]
    entries.append({
        "id": "osm-overpass-pilot",
        "title": "OpenStreetMap roads, public facilities, and surface water (pilot AOI)",
        "provider": "OpenStreetMap contributors, via Overpass API",
        "sourceUrl": "https://overpass-api.de/",
        "retrievedAt": RETRIEVED_AT,
        "dataDate": RETRIEVED_AT,
        "coverage": f"bbox (s,w,n,e) {bbox_str} around Village of Mamaroneck, NY",
        "resolution": "Vector, as-mapped geometry",
        "license": "Open Database License (ODbL) 1.0",
        "usedFor": ["roadGeometry", "intersectionDensity", "publicFacilities", "surfaceWaterProximity"],
        "limitations": [
            "Crowd-sourced; completeness and tagging accuracy vary by feature and area.",
            f"Element counts at retrieval: {counts}",
        ],
        "isSynthetic": False,
    })
    METADATA_PATH.write_text(json.dumps(entries, indent=2))


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    s, w, n, e = load_bbox_padded()
    bbox_str = f"{s},{w},{n},{e}"
    counts = {}
    for name, template in QUERIES.items():
        counts[name] = run_query(name, template, bbox_str)
    record_provenance(bbox_str, counts)


if __name__ == "__main__":
    main()
