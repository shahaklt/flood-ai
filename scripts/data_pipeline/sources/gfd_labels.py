"""Pull real satellite-observed flood event labels for the pilot AOI from the
Global Flood Database (Tellman et al. 2021), via Google Earth Engine.

Source: GLOBAL_FLOOD_DB/MODIS_EVENTS/V1 (913 real mapped flood events,
2000-2018), public Earth Engine catalog. Requires a GEE service-account
credential (see .env.example GOOGLE_APPLICATION_CREDENTIALS).

For each real event whose footprint intersects the pilot AOI, downloads the
event's `flooded`, `jrc_perm_water`, and `clear_perc` bands as a small
GeoTIFF clipped to the AOI at 250 m (matching the analysis grid), via a
direct synchronous download — no batch export needed at this AOI's size.
Per spec: positives come only from valid flooded pixels; permanent water and
low-observation-quality pixels are excluded downstream, never treated as
confirmed negatives.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import ee
import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
AOI_PATH = REPO_ROOT / "data" / "metadata" / "pilot_aoi.geojson"
RAW_DIR = REPO_ROOT / "data" / "raw" / "gfd_events"
METADATA_PATH = REPO_ROOT / "data" / "metadata" / "sources.json"
DATASET_ID = "GLOBAL_FLOOD_DB/MODIS_EVENTS/V1"
SCALE_M = 250
RETRIEVED_AT = datetime.now(timezone.utc).isoformat()


def init_ee() -> None:
    key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", os.path.expanduser("~/.secrets/flood-ai-gee-key.json"))
    creds = ee.ServiceAccountCredentials("", key_path)
    ee.Initialize(creds)


def load_region(pad_deg: float = 0.05) -> ee.Geometry:
    aoi = json.loads(AOI_PATH.read_text())
    south, north, west, east = aoi["features"][0]["properties"]["boundingBoxSWNE"]
    return ee.Geometry.Rectangle([west - pad_deg, south - pad_deg, east + pad_deg, north + pad_deg])


def fetch_events(region: ee.Geometry) -> list[dict]:
    col = ee.ImageCollection(DATASET_ID).filterBounds(region)
    n = col.size().getInfo()
    print(f"Found {n} real GFD events intersecting the pilot AOI region.")

    ids = col.aggregate_array("system:index").getInfo()
    event_records = []
    for event_id in ids:
        img = col.filter(ee.Filter.eq("system:index", event_id)).first()
        props = img.toDictionary().getInfo()
        clipped = img.select(["flooded", "jrc_perm_water", "clear_perc"]).clip(region)

        url = clipped.getDownloadURL({
            "region": region,
            "scale": SCALE_M,
            "format": "GEO_TIFF",
            "crs": "EPSG:4326",
        })
        resp = requests.get(url, timeout=120)
        resp.raise_for_status()

        RAW_DIR.mkdir(parents=True, exist_ok=True)
        out_path = RAW_DIR / f"{event_id}.tif"
        out_path.write_bytes(resp.content)
        print(f"  {event_id}: wrote {len(resp.content)/1024:.0f} KB -> {out_path}")

        event_records.append({
            "eventId": event_id,
            "dfoMainCause": props.get("dfo_main_cause"),
            "dfoCountry": props.get("dfo_country"),
            "dfoSeverity": props.get("dfo_severity"),
            "dfoDead": props.get("dfo_dead"),
            "dfoDisplaced": props.get("dfo_displaced"),
            "timeStart": props.get("system:time_start"),
            "timeEnd": props.get("system:time_end"),
            "clearPercThreshold": props.get("threshold_type"),
            "rasterPath": str(out_path.relative_to(REPO_ROOT)),
        })
    return event_records


def record_provenance(event_records: list[dict], region_bounds: list[float]) -> None:
    entries = []
    if METADATA_PATH.exists():
        entries = json.loads(METADATA_PATH.read_text())
    entries = [e for e in entries if e["id"] != "global-flood-db-events-pilot"]
    entries.append({
        "id": "global-flood-db-events-pilot",
        "title": "Global Flood Database v1 — real satellite-observed flood events (pilot AOI region)",
        "provider": "Tellman et al. 2021 / Global Flood Database, via Google Earth Engine public catalog",
        "sourceUrl": "https://developers.google.com/earth-engine/datasets/catalog/GLOBAL_FLOOD_DB_MODIS_EVENTS_V1",
        "retrievedAt": RETRIEVED_AT,
        "dataDate": "2000-2018 (913 total events in the source dataset; see per-event timeStart/timeEnd)",
        "coverage": f"{len(event_records)} real events whose mapped footprint intersects the pilot AOI region (bounds {region_bounds})",
        "resolution": "~250 m/pixel (MODIS-derived), downloaded at 250 m to match the analysis grid",
        "license": "See Global Flood Database terms (research/public use); attribution required",
        "usedFor": ["floodEventLabel (supervised training candidate)"],
        "limitations": [
            "Satellite-observed inundation only — cloud/vegetation obscured cells are excluded via clear_perc, not treated as non-flooded.",
            "Permanent water (jrc_perm_water) must be excluded from both positive and negative training examples.",
            "Event footprints for this small pilot AOI may cover only part of it; per-event, per-cell completeness must be checked before training (see docs/TRAINING_DATA_AUDIT.md).",
            "MODIS-derived — coarser native resolution than the 250 m analysis grid suggests; do not oversell spatial precision.",
        ],
        "isSynthetic": False,
    })
    METADATA_PATH.write_text(json.dumps(entries, indent=2))

    events_out = REPO_ROOT / "data" / "metadata" / "gfd_events_pilot.json"
    events_out.write_text(json.dumps(event_records, indent=2))
    print(f"Wrote event manifest to {events_out}")


def main() -> None:
    init_ee()
    region = load_region()
    bounds = region.bounds().getInfo()["coordinates"][0]
    event_records = fetch_events(region)
    record_provenance(event_records, bounds)


if __name__ == "__main__":
    main()
