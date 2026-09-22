"""Pull real FEMA National Flood Hazard Layer flood zones for the pilot AOI.

Source: FEMA NFHL_Print/NFHL MapServer, layer 14 (Flood Hazard Zones), public
ArcGIS REST endpoint, no API key. Used as a context/predictor layer, per the
project spec, not as the ground-truth label the model is trained to
reproduce.
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
LAYER_URL = "https://msc.fema.gov/arcgis/rest/services/NFHL_Print/NFHL/MapServer/14/query"
RETRIEVED_AT = datetime.now(timezone.utc).isoformat()


def load_bbox_padded(pad: float = 0.01) -> tuple[float, float, float, float]:
    aoi = json.loads(AOI_PATH.read_text())
    south, north, west, east = aoi["features"][0]["properties"]["boundingBoxSWNE"]
    return west - pad, south - pad, east + pad, north + pad


def fetch_flood_zones(xmin: float, ymin: float, xmax: float, ymax: float, retries: int = 4) -> dict:
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(
                LAYER_URL,
                params={
                    "geometry": f"{xmin},{ymin},{xmax},{ymax}",
                    "geometryType": "esriGeometryEnvelope",
                    "inSR": 4326,
                    "outSR": 4326,
                    "spatialRel": "esriSpatialRelIntersects",
                    "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID,SOURCE_CIT",
                    "f": "geojson",
                },
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"FEMA NFHL query error: {data['error']}")
            return data
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            last_exc = exc
            print(f"Attempt {attempt}/{retries} failed: {exc}. Retrying...")
            time.sleep(8 * attempt)
    raise RuntimeError(f"FEMA NFHL query failed after {retries} attempts") from last_exc


def record_provenance(n_features: int, xmin: float, ymin: float, xmax: float, ymax: float) -> None:
    entries = []
    if METADATA_PATH.exists():
        entries = json.loads(METADATA_PATH.read_text())
    entries = [e for e in entries if e["id"] != "fema-nfhl-flood-zones-pilot"]
    entries.append({
        "id": "fema-nfhl-flood-zones-pilot",
        "title": "FEMA National Flood Hazard Layer — Flood Hazard Zones (pilot AOI clip)",
        "provider": "Federal Emergency Management Agency (FEMA)",
        "sourceUrl": "https://msc.fema.gov/arcgis/rest/services/NFHL_Print/NFHL/MapServer/14",
        "retrievedAt": RETRIEVED_AT,
        "dataDate": "Effective DFIRM panel dates vary by zone; see per-feature DFIRM_ID/SOURCE_CIT",
        "coverage": f"Clipped to bbox [{xmin:.5f}, {ymin:.5f}, {xmax:.5f}, {ymax:.5f}] (WGS84) around Village of Mamaroneck, NY ({n_features} zone polygons)",
        "resolution": "Vector polygons, effective FEMA mapping scale",
        "license": "U.S. Government work, public domain",
        "usedFor": ["femaFloodZoneIndicator"],
        "limitations": [
            "Context/predictor layer only — never used as the training label the model reproduces (per project spec).",
            "Represents mapped riverine/coastal hazard as of the effective panel date; does not capture all local pluvial (rain-driven) flooding.",
        ],
        "isSynthetic": False,
    })
    METADATA_PATH.write_text(json.dumps(entries, indent=2))


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    xmin, ymin, xmax, ymax = load_bbox_padded()
    data = fetch_flood_zones(xmin, ymin, xmax, ymax)
    out_path = RAW_DIR / "fema_flood_zones.geojson"
    out_path.write_text(json.dumps(data))
    n = len(data.get("features", []))
    print(f"Wrote {n} real FEMA flood zone features to {out_path}")
    record_provenance(n, xmin, ymin, xmax, ymax)


if __name__ == "__main__":
    main()
