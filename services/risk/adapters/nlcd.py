"""Real-time, per-tile land-cover + impervious-surface fetch from MRLC's NLCD
2021 WCS (public, no API key). Parameterized by bbox, same service as the
pilot's scripts/data_pipeline/sources/nlcd.py.
"""
from __future__ import annotations

import io

import numpy as np
import rasterio
import requests

WCS_URL = "https://www.mrlc.gov/geoserver/mrlc_display/wcs"
LAND_COVER_ID = "mrlc_display__NLCD_2021_Land_Cover_L48"
IMPERVIOUS_ID = "mrlc_display__NLCD_2021_Impervious_L48"


def _fetch_coverage(coverage_id: str, bbox: tuple[float, float, float, float]) -> tuple[np.ndarray, rasterio.Affine]:
    xmin, ymin, xmax, ymax = bbox
    resp = requests.get(
        WCS_URL,
        params={
            "service": "WCS",
            "version": "2.0.1",
            "request": "GetCoverage",
            "coverageId": coverage_id,
            "subset": [f"Long({xmin},{xmax})", f"Lat({ymin},{ymax})"],
            "subsettingCrs": "http://www.opengis.net/def/crs/EPSG/0/4326",
            "format": "image/geotiff",
        },
        timeout=30,
    )
    resp.raise_for_status()
    if b"ExceptionReport" in resp.content[:2000]:
        raise RuntimeError(f"NLCD WCS error for {coverage_id}: {resp.content[:300]!r}")
    with rasterio.open(io.BytesIO(resp.content)) as ds:
        arr = ds.read(1)
        transform = ds.transform
    return arr, transform


def fetch_land_cover(bbox: tuple[float, float, float, float]) -> tuple[np.ndarray, rasterio.Affine]:
    return _fetch_coverage(LAND_COVER_ID, bbox)


def fetch_impervious(bbox: tuple[float, float, float, float]) -> tuple[np.ndarray, rasterio.Affine]:
    return _fetch_coverage(IMPERVIOUS_ID, bbox)
