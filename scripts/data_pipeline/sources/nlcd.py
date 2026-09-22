"""Pull real land-cover and impervious-surface data for the pilot AOI.

Source: Multi-Resolution Land Characteristics (MRLC) Consortium, NLCD 2021,
served via the MRLC GeoServer WCS 2.0 (public, no API key). We request raw
class-code / percentage coverages (not styled WMS imagery) clipped to the
pilot bounding box.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[3]
AOI_PATH = REPO_ROOT / "data" / "metadata" / "pilot_aoi.geojson"
RAW_DIR = REPO_ROOT / "data" / "raw"
METADATA_PATH = REPO_ROOT / "data" / "metadata" / "sources.json"
WCS_URL = "https://www.mrlc.gov/geoserver/mrlc_display/wcs"
RETRIEVED_AT = datetime.now(timezone.utc).isoformat()

COVERAGES = {
    "nlcd_land_cover.tif": "mrlc_display__NLCD_2021_Land_Cover_L48",
    "nlcd_impervious.tif": "mrlc_display__NLCD_2021_Impervious_L48",
}


def load_bbox_padded(pad: float = 0.01) -> tuple[float, float, float, float]:
    aoi = json.loads(AOI_PATH.read_text())
    south, north, west, east = aoi["features"][0]["properties"]["boundingBoxSWNE"]
    return west - pad, south - pad, east + pad, north + pad


def fetch_coverage(filename: str, coverage_id: str, xmin: float, ymin: float, xmax: float, ymax: float) -> None:
    params = {
        "service": "WCS",
        "version": "2.0.1",
        "request": "GetCoverage",
        "coverageId": coverage_id,
        "subset": [f"Long({xmin},{xmax})", f"Lat({ymin},{ymax})"],
        "subsettingCrs": "http://www.opengis.net/def/crs/EPSG/0/4326",
        "format": "image/geotiff",
    }
    resp = requests.get(WCS_URL, params=params, timeout=120)
    resp.raise_for_status()
    if b"ExceptionReport" in resp.content[:2000]:
        raise RuntimeError(f"WCS error for {coverage_id}: {resp.content[:1000]!r}")
    out_path = RAW_DIR / filename
    out_path.write_bytes(resp.content)
    print(f"Wrote real NLCD coverage ({len(resp.content)/1024:.0f} KB) to {out_path}")


def record_provenance(xmin: float, ymin: float, xmax: float, ymax: float) -> None:
    entries = []
    if METADATA_PATH.exists():
        entries = json.loads(METADATA_PATH.read_text())
    entries = [e for e in entries if e["id"] not in ("nlcd-2021-land-cover-pilot", "nlcd-2021-impervious-pilot")]
    entries.append({
        "id": "nlcd-2021-land-cover-pilot",
        "title": "NLCD 2021 Land Cover (pilot AOI clip)",
        "provider": "Multi-Resolution Land Characteristics (MRLC) Consortium / USGS",
        "sourceUrl": "https://www.mrlc.gov/data/nlcd-2021-land-cover-conus",
        "retrievedAt": RETRIEVED_AT,
        "dataDate": "2021",
        "coverage": f"Clipped to bbox [{xmin:.5f}, {ymin:.5f}, {xmax:.5f}, {ymax:.5f}] (WGS84) around Village of Mamaroneck, NY",
        "resolution": "30 m/pixel, Anderson Level II land-cover classes",
        "license": "U.S. Government work, public domain",
        "usedFor": ["landCoverClass", "developedSurfaceContext"],
        "limitations": ["30 m resolution is coarser than the 250 m analysis grid but coarser than 10 m DEM; classes generalize mixed-use parcels."],
        "isSynthetic": False,
    })
    entries.append({
        "id": "nlcd-2021-impervious-pilot",
        "title": "NLCD 2021 Percent Developed Imperviousness (pilot AOI clip)",
        "provider": "Multi-Resolution Land Characteristics (MRLC) Consortium / USGS",
        "sourceUrl": "https://www.mrlc.gov/data/nlcd-2021-percent-developed-imperviousness-conus",
        "retrievedAt": RETRIEVED_AT,
        "dataDate": "2021",
        "coverage": f"Clipped to bbox [{xmin:.5f}, {ymin:.5f}, {xmax:.5f}, {ymax:.5f}] (WGS84) around Village of Mamaroneck, NY",
        "resolution": "30 m/pixel, percent impervious surface (0-100)",
        "license": "U.S. Government work, public domain",
        "usedFor": ["imperviousSurfaceFactor"],
        "limitations": ["2021 snapshot; does not reflect construction after that date."],
        "isSynthetic": False,
    })
    METADATA_PATH.write_text(json.dumps(entries, indent=2))


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    xmin, ymin, xmax, ymax = load_bbox_padded()
    for filename, coverage_id in COVERAGES.items():
        fetch_coverage(filename, coverage_id, xmin, ymin, xmax, ymax)
    record_provenance(xmin, ymin, xmax, ymax)


if __name__ == "__main__":
    main()
