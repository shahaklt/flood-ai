"""FloodAI risk service: real, live, per-tile feature computation for any
location in New York State (spec section 4.1's viewport-driven architecture).
No statewide precompute; every tile pulls real public data on first view and
is cached after that.

Run: uvicorn services.risk.main:app --reload --port 8000
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import cache
from .adapters import coverage
from .features import compute_tile_features
from .tiles import tile_to_bbox

app = FastAPI(title="FloodAI Risk Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3411"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/coverage/{z}/{x}/{y}")
def get_coverage(z: int, x: int, y: int) -> dict:
    bbox = tile_to_bbox(z, x, y)
    supported = coverage.tile_in_coverage(bbox)
    return {
        "tileId": f"{z}/{x}/{y}",
        "coverageTier": "validated" if supported else "unsupported",
        "bbox": bbox,
    }


@app.get("/api/features/{z}/{x}/{y}")
def get_features(z: int, x: int, y: int) -> dict:
    if z < 10 or z > 16:
        raise HTTPException(400, "Zoom level must be between 10 and 16 for live per-tile feature computation.")

    cached = cache.read_cached(z, x, y)
    if cached is not None:
        return cached

    result = compute_tile_features(z, x, y)
    payload = {
        "tileId": f"{z}/{x}/{y}",
        "dataVersion": cache.DATA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        **result,
    }
    if result["coverageTier"] == "validated":
        cache.write_cache(z, x, y, payload)
    return payload
