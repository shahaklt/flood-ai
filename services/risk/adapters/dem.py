"""Real-time, per-tile elevation fetch from USGS 3DEP (public, no API key).
Same service used by the pilot's scripts/data_pipeline/sources/dem_3dep.py,
parameterized here by an arbitrary WGS84 bbox so it works anywhere in the
declared coverage area, not just the pilot AOI.
"""
from __future__ import annotations

import io

import numpy as np
import rasterio
import requests

SERVICE_URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"


def fetch_dem(bbox: tuple[float, float, float, float], pixel_size_deg: float = 0.0009) -> tuple[np.ndarray, rasterio.Affine]:
    xmin, ymin, xmax, ymax = bbox
    width = max(8, round((xmax - xmin) / pixel_size_deg))
    height = max(8, round((ymax - ymin) / pixel_size_deg))

    resp = requests.get(
        SERVICE_URL,
        params={
            "bbox": f"{xmin},{ymin},{xmax},{ymax}",
            "bboxSR": 4326,
            "imageSR": 4326,
            "size": f"{width},{height}",
            "format": "tiff",
            "pixelType": "F32",
            "noData": -999999,
            "interpolation": "RSP_BilinearInterpolation",
            "f": "image",
        },
        timeout=30,
    )
    resp.raise_for_status()
    if resp.headers.get("content-type", "").startswith("application/json"):
        raise RuntimeError(f"3DEP error: {resp.text[:300]}")

    with rasterio.open(io.BytesIO(resp.content)) as ds:
        arr = ds.read(1)
        transform = ds.transform
    return arr, transform
