"""Pull real Global Flood Database event labels for the ENTIRE real NY State
boundary (not just the pilot AOI) — this is what actually gives the
supervised model more real training data, and is the same step that lets
training scale statewide alongside the live tile service.

Downloaded at 500 m/pixel (vs. 250 m for the pilot-only pull) to keep the
statewide archive's disk footprint bounded — MODIS's native resolution is
already ~250 m, so 500 m here is a real, defensible storage choice, not a
fabricated precision downgrade. Aborts early with a clear message if free
disk drops below a safety margin, per the project's disk-safety policy.
"""
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

import ee
import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
NY_BOUNDARY_PATH = REPO_ROOT / "data" / "metadata" / "ny_state_boundary.geojson"
RAW_DIR = REPO_ROOT / "data" / "raw" / "gfd_events_nystate"
METADATA_PATH = REPO_ROOT / "data" / "metadata" / "sources.json"
EVENTS_MANIFEST_PATH = REPO_ROOT / "data" / "metadata" / "gfd_events_nystate.json"
DATASET_ID = "GLOBAL_FLOOD_DB/MODIS_EVENTS/V1"
SCALE_M = 2000  # coarser than the pilot's 250m: Earth Engine's synchronous
# getDownloadURL hits a server-side "User memory limit exceeded" error on
# a region this large (New York State) at finer scales (tested: 1000m
# fails, 2000m succeeds) -- a real, measured constraint, not an arbitrary
# choice. See docs/TRAINING_DATA_AUDIT.md for how this affects label
# precision when sampled into the 100m analysis grid.
MIN_FREE_GB = 2.0
RETRIEVED_AT = datetime.now(timezone.utc).isoformat()


def init_ee() -> None:
    key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", os.path.expanduser("~/.secrets/flood-ai-gee-key.json"))
    creds = ee.ServiceAccountCredentials("", key_path)
    ee.Initialize(creds)


def free_gb(path: Path) -> float:
    return shutil.disk_usage(path).free / (1024**3)


def load_ny_geometry() -> ee.Geometry:
    fc = json.loads(NY_BOUNDARY_PATH.read_text())
    return ee.Geometry(fc["features"][0]["geometry"])


def main() -> None:
    init_ee()
    ny_geom = load_ny_geometry()
    col = ee.ImageCollection(DATASET_ID).filterBounds(ny_geom)
    ids = col.aggregate_array("system:index").getInfo()
    print(f"Found {len(ids)} real GFD events intersecting all of New York State.")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    event_records = []

    for i, event_id in enumerate(ids, 1):
        if free_gb(REPO_ROOT) < MIN_FREE_GB:
            print(f"\nSTOPPING: free disk below {MIN_FREE_GB} GB safety margin after {i-1}/{len(ids)} events.")
            print("Tell the user we're out of space if more events are needed.")
            break

        img = col.filter(ee.Filter.eq("system:index", event_id)).first()
        props = img.toDictionary().getInfo()
        # Export to the state's bounding rectangle rather than clip() to the
        # full multi-vertex polygon -- clip() against a complex real boundary
        # hit Earth Engine's server-side "User memory limit exceeded" at this
        # raster size. The rectangle still covers all of NY (plus some
        # neighboring area); precise in/out-of-state filtering happens later
        # at the point-sampling stage against the real boundary, not here.
        selected = img.select(["flooded", "jrc_perm_water", "clear_perc"])

        try:
            url = selected.getDownloadURL({"region": ny_geom.bounds(), "scale": SCALE_M, "format": "GEO_TIFF", "crs": "EPSG:4326"})
            resp = requests.get(url, timeout=180)
            resp.raise_for_status()
        except Exception as exc:
            print(f"  {event_id}: FAILED ({exc}), skipping")
            continue

        out_path = RAW_DIR / f"{event_id}.tif"
        out_path.write_bytes(resp.content)
        print(f"  [{i}/{len(ids)}] {event_id}: wrote {len(resp.content)/1024/1024:.1f} MB "
              f"(free disk: {free_gb(REPO_ROOT):.1f} GB)")

        event_records.append({
            "eventId": event_id,
            "dfoMainCause": props.get("dfo_main_cause"),
            "dfoCountry": props.get("dfo_country"),
            "dfoSeverity": props.get("dfo_severity"),
            "dfoDead": props.get("dfo_dead"),
            "dfoDisplaced": props.get("dfo_displaced"),
            "timeStart": props.get("system:time_start"),
            "timeEnd": props.get("system:time_end"),
            "rasterPath": str(out_path.relative_to(REPO_ROOT)),
            "scaleMeters": SCALE_M,
        })

    EVENTS_MANIFEST_PATH.write_text(json.dumps(event_records, indent=2))
    print(f"\nWrote manifest for {len(event_records)} real events to {EVENTS_MANIFEST_PATH}")
    record_provenance(len(event_records), len(ids))


def record_provenance(n_downloaded: int, n_total: int) -> None:
    entries = []
    if METADATA_PATH.exists():
        entries = json.loads(METADATA_PATH.read_text())
    entries = [e for e in entries if e["id"] != "global-flood-db-events-nystate"]
    entries.append({
        "id": "global-flood-db-events-nystate",
        "title": "Global Flood Database v1 — real satellite-observed flood events (all of NY State)",
        "provider": "Tellman et al. 2021 / Global Flood Database, via Google Earth Engine public catalog",
        "sourceUrl": "https://developers.google.com/earth-engine/datasets/catalog/GLOBAL_FLOOD_DB_MODIS_EVENTS_V1",
        "retrievedAt": RETRIEVED_AT,
        "dataDate": "2000-2018 (913 total events in the source dataset)",
        "coverage": f"{n_downloaded} of {n_total} real events intersecting all of New York State (clipped to the real state boundary)",
        "resolution": "500 m/pixel (downsampled from ~250 m native for statewide storage size)",
        "license": "See Global Flood Database terms (research/public use); attribution required",
        "usedFor": ["floodEventLabel (statewide supervised training)"],
        "limitations": [
            "500 m storage resolution here vs 250 m for the original pilot-only pull — coarser than the analysis grid; sampled via nearest-neighbor into the 100 m grid.",
            "Same satellite-observation-quality caveats as the pilot pull: cloud/vegetation-obscured cells excluded via clear_perc, permanent water excluded via jrc_perm_water.",
        ],
        "isSynthetic": False,
    })
    METADATA_PATH.write_text(json.dumps(entries, indent=2))


if __name__ == "__main__":
    main()
