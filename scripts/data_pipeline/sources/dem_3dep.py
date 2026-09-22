"""Pull real elevation data for the pilot AOI from USGS 3DEP.

Source: USGS 3D Elevation Program (3DEP) Bare Earth DEM dynamic ImageServer.
Public, no API key required. We request a clipped GeoTIFF for the pilot
bounding box only (never the statewide/national raster) to keep disk usage
bounded, at ~10m/pixel (the service's native seamless resolution class for
the northeastern US).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
AOI_PATH = REPO_ROOT / "data" / "metadata" / "pilot_aoi.geojson"
RAW_DIR = REPO_ROOT / "data" / "raw"
OUT_TIF = RAW_DIR / "dem_3dep.tif"
METADATA_PATH = REPO_ROOT / "data" / "metadata" / "sources.json"

SERVICE_URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
PIXEL_SIZE_DEG = 0.00009  # ~10 m at this latitude
RETRIEVED_AT = datetime.now(timezone.utc).isoformat()


def load_bbox() -> tuple[float, float, float, float]:
    aoi = json.loads(AOI_PATH.read_text())
    south, north, west, east = aoi["features"][0]["properties"]["boundingBoxSWNE"]
    return west, south, east, north  # xmin, ymin, xmax, ymax (WGS84)


def fetch_dem() -> None:
    xmin, ymin, xmax, ymax = load_bbox()
    # small buffer so slope/flow-accumulation derivatives aren't edge-starved
    pad = 0.01
    xmin, ymin, xmax, ymax = xmin - pad, ymin - pad, xmax + pad, ymax + pad

    width = max(1, round((xmax - xmin) / PIXEL_SIZE_DEG))
    height = max(1, round((ymax - ymin) / PIXEL_SIZE_DEG))

    params = {
        "bbox": f"{xmin},{ymin},{xmax},{ymax}",
        "bboxSR": 4326,
        "imageSR": 4326,
        "size": f"{width},{height}",
        "format": "tiff",
        "pixelType": "F32",
        "noData": -999999,
        "interpolation": "RSP_BilinearInterpolation",
        "f": "image",
    }

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    resp = requests.get(SERVICE_URL, params=params, timeout=120)
    resp.raise_for_status()
    if resp.headers.get("content-type", "").startswith("application/json"):
        raise RuntimeError(f"3DEP service returned an error, not an image: {resp.text[:500]}")
    OUT_TIF.write_bytes(resp.content)
    print(f"Wrote real 3DEP DEM clip ({len(resp.content)/1024:.0f} KB) to {OUT_TIF}")

    record_provenance(xmin, ymin, xmax, ymax)


def record_provenance(xmin: float, ymin: float, xmax: float, ymax: float) -> None:
    entries = []
    if METADATA_PATH.exists():
        entries = json.loads(METADATA_PATH.read_text())
    entries = [e for e in entries if e["id"] != "usgs-3dep-dem-pilot"]
    entries.append({
        "id": "usgs-3dep-dem-pilot",
        "title": "USGS 3DEP Bare Earth DEM (pilot AOI clip)",
        "provider": "U.S. Geological Survey, 3D Elevation Program",
        "sourceUrl": "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
        "retrievedAt": RETRIEVED_AT,
        "dataDate": "seamless (see service serviceDescription; compiled as of the service's latest publish date)",
        "coverage": f"Clipped to bbox [{xmin:.5f}, {ymin:.5f}, {xmax:.5f}, {ymax:.5f}] (WGS84) around Village of Mamaroneck, NY",
        "resolution": "~10 m/pixel (requested), F32 elevation in meters",
        "license": "U.S. Government work, public domain",
        "usedFor": ["relativeElevation", "slope", "flowAccumulationProxy"],
        "limitations": [
            "Bare-earth DEM; does not resolve sub-pixel drainage infrastructure.",
            "Exported at 10 m via bilinear resampling from the service's native seamless resolution, not raw LiDAR point density.",
        ],
        "isSynthetic": False,
    })
    METADATA_PATH.write_text(json.dumps(entries, indent=2))


if __name__ == "__main__":
    fetch_dem()
