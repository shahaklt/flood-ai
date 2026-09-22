"""Fetch the real New York State boundary (US Census TIGERweb, public, no
API key), used to determine map coverage statewide: any viewport tile that
intersects this polygon is in FloodAI's declared coverage area; tiles
outside it are always "unsupported", never scored.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_PATH = REPO_ROOT / "data" / "metadata" / "ny_state_boundary.geojson"
METADATA_PATH = REPO_ROOT / "data" / "metadata" / "sources.json"
QUERY_URL = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query"
RETRIEVED_AT = datetime.now(timezone.utc).isoformat()


def fetch() -> dict:
    resp = requests.get(
        QUERY_URL,
        params={
            "where": "STUSAB='NY'",
            "outFields": "STUSAB,NAME,GEOID",
            "geometryPrecision": 4,
            "maxAllowableOffset": 0.002,  # ~200m generalization, plenty for a coverage mask
            "outSR": 4326,
            "f": "geojson",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def record_provenance() -> None:
    entries = []
    if METADATA_PATH.exists():
        entries = json.loads(METADATA_PATH.read_text())
    entries = [e for e in entries if e["id"] != "census-tigerweb-ny-boundary"]
    entries.append({
        "id": "census-tigerweb-ny-boundary",
        "title": "New York State boundary (generalized)",
        "provider": "U.S. Census Bureau, TIGERweb",
        "sourceUrl": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0",
        "retrievedAt": RETRIEVED_AT,
        "dataDate": "current TIGERweb vintage",
        "coverage": "Entire State of New York",
        "resolution": "Generalized to ~200 m for use as a coverage mask, not a legal boundary",
        "license": "U.S. Government work, public domain",
        "usedFor": ["statewideCoverageMask"],
        "limitations": ["Generalized geometry — not for legal/parcel boundary determinations."],
        "isSynthetic": False,
    })
    METADATA_PATH.write_text(json.dumps(entries, indent=2))


def main() -> None:
    fc = fetch()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(fc))
    print(f"Wrote real NY State boundary ({len(json.dumps(fc))} bytes) to {OUT_PATH}")
    record_provenance()


if __name__ == "__main__":
    main()
