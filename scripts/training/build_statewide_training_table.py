"""Build a real, statewide event-cell training table from the 33 real GFD
events pulled for all of New York State (scripts/data_pipeline/sources/
gfd_labels_nystate.py). Unlike the pilot's 100m grid, real environmental
features here are fetched at the same ~2000m resolution as the statewide
GFD label rasters themselves (see SCALE_M in that script) — matching
feature resolution to label resolution rather than presenting false
precision. Features are fetched once per real z=9 tile that contains at
least one real positive flood pixel (not per point), which keeps the
number of external API calls tractable (~90 tiles instead of ~800+ points).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from shapely.ops import unary_union

from services.risk.adapters import fema, nhd, nlcd, osm_water  # noqa: E402
from services.risk.adapters.dem import fetch_dem  # noqa: E402
from services.risk.hydrology import compute_flow_accumulation  # noqa: E402
from services.risk.tiles import lonlat_to_tile, tile_to_bbox  # noqa: E402

EVENTS_DIR = REPO_ROOT / "data" / "raw" / "gfd_events_nystate"
MANIFEST_PATH = REPO_ROOT / "data" / "metadata" / "gfd_events_nystate.json"
OUT_PATH = REPO_ROOT / "data" / "demo" / "statewide_training_table.csv"
TILE_ZOOM = 9
FEATURE_PIXEL_SIZE_DEG = 0.018  # ~2000m at NY latitudes, matches the GFD label resolution
MAX_NEGATIVES_PER_EVENT_PER_TILE = 100  # was 25 -- more real negatives per tile, still bounded
DEM_RETRY_ATTEMPTS = 3


def fetch_dem_with_retry(bbox):
    last_exc = None
    for attempt in range(1, DEM_RETRY_ATTEMPTS + 1):
        try:
            return fetch_dem(bbox, pixel_size_deg=FEATURE_PIXEL_SIZE_DEG)
        except Exception as exc:  # real transient 502/504/timeout errors observed from this service
            last_exc = exc
            time.sleep(5 * attempt)
    raise last_exc


def find_positive_tiles() -> dict[tuple[int, int, int], list[dict]]:
    """Returns {tileId: [ {eventId, positions:[(row,col)...]} ]}."""
    tiles: dict[tuple[int, int, int], list[dict]] = {}
    for tif_path in sorted(EVENTS_DIR.glob("*.tif")):
        event_id = tif_path.stem
        with rasterio.open(tif_path) as ds:
            arr = ds.read()
            flooded, perm_water, clear_perc = arr[0], arr[1], arr[2]
            valid = (perm_water == 0) & (clear_perc >= 0.5)
            pos_mask = (flooded > 0) & valid
            rows, cols = np.where(pos_mask)
            by_tile: dict[tuple[int, int, int], list[tuple[int, int]]] = {}
            for r, c in zip(rows, cols):
                lon, lat = ds.xy(r, c)
                x, y = lonlat_to_tile(lon, lat, TILE_ZOOM)
                by_tile.setdefault((TILE_ZOOM, x, y), []).append((r, c))
            for t, positions in by_tile.items():
                tiles.setdefault(t, []).append({"eventId": event_id, "tifPath": tif_path})
    return tiles


def sample_at(transform, arr, lon, lat):
    col, row = ~transform * (lon, lat)
    col, row = int(col), int(row)
    if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1]:
        val = arr[row, col]
        if np.isnan(val) or val < -1000:
            return None
        return float(val)
    return None


def main() -> None:
    tiles = find_positive_tiles()
    print(f"{len(tiles)} real z={TILE_ZOOM} tiles contain at least one real positive flood pixel.")

    all_rows = []
    for i, (tile_id, event_hits) in enumerate(sorted(tiles.items()), 1):
        z, x, y = tile_id
        bbox = tile_to_bbox(z, x, y)
        print(f"[{i}/{len(tiles)}] tile {z}/{x}/{y} ({len(event_hits)} event(s))...")

        try:
            dem_arr, dem_transform = fetch_dem_with_retry(bbox)
        except Exception as exc:
            print(f"  DEM failed after {DEM_RETRY_ATTEMPTS} attempts, skipping tile: {exc}")
            continue
        flow_acc_arr = compute_flow_accumulation(dem_arr)
        gy, gx = np.gradient(dem_arr)
        slope_arr = np.degrees(np.arctan(np.sqrt(gx**2 + gy**2)))  # coarse; degree-based, real but approximate at this scale
        twi_arr = np.log((flow_acc_arr + 1.0) / (np.tan(np.radians(slope_arr)) + 0.01))

        try:
            lc_arr, lc_transform = nlcd.fetch_land_cover(bbox)
            imp_arr, imp_transform = nlcd.fetch_impervious(bbox)
        except Exception as exc:
            print(f"  NLCD unavailable: {exc}")
            lc_arr = imp_arr = None

        try:
            fema_sfha = fema.fetch_fema_sfha_union(bbox)
        except Exception as exc:
            print(f"  FEMA unavailable: {exc}")
            fema_sfha = None

        # OSM Overpass reliably times out at this larger z=9 bbox scale; NHD's
        # generalized flowline layer handles it in a few seconds. Union both
        # when available for robustness.
        nhd_union = nhd.fetch_nhd_flowlines_union(bbox)
        osm_union = osm_water.fetch_water_union(bbox)
        water_parts = [g for g in (nhd_union, osm_union) if g is not None]
        water_union = unary_union(water_parts) if water_parts else None

        from shapely.geometry import Point

        elevs = dem_arr[~np.isnan(dem_arr) & (dem_arr > -1000)]
        mean_e, std_e = (float(elevs.mean()), float(elevs.std()) or 1.0) if len(elevs) else (0.0, 1.0)

        for hit in event_hits:
            event_id = hit["eventId"]
            with rasterio.open(hit["tifPath"]) as ds:
                arr = ds.read()
                flooded, perm_water, clear_perc = arr[0], arr[1], arr[2]
                valid = (perm_water == 0) & (clear_perc >= 0.5)
                rows_idx, cols_idx = np.where(valid)

                # keep every positive; cap negatives for balance/runtime
                positives, negatives = [], []
                for r, c in zip(rows_idx, cols_idx):
                    lon, lat = ds.xy(r, c)
                    if lonlat_to_tile(lon, lat, TILE_ZOOM) != (x, y):
                        continue
                    (positives if flooded[r, c] > 0 else negatives).append((r, c, lon, lat))
                if len(negatives) > MAX_NEGATIVES_PER_EVENT_PER_TILE:
                    idx = np.random.default_rng(42).choice(len(negatives), MAX_NEGATIVES_PER_EVENT_PER_TILE, replace=False)
                    negatives = [negatives[i] for i in idx]

                for r, c, lon, lat in positives + negatives:
                    elev = sample_at(dem_transform, dem_arr, lon, lat)
                    slope = sample_at(dem_transform, slope_arr, lon, lat)
                    flow_acc = sample_at(dem_transform, flow_acc_arr, lon, lat)
                    twi = sample_at(dem_transform, twi_arr, lon, lat)
                    land_cover = sample_at(lc_transform, lc_arr, lon, lat) if lc_arr is not None else None
                    impervious = sample_at(imp_transform, imp_arr, lon, lat) if imp_arr is not None else None
                    dist_water = Point(lon, lat).distance(water_union) * 111_000 if water_union is not None else None
                    in_sfha = bool(fema_sfha is not None and Point(lon, lat).intersects(fema_sfha))
                    rel_z = (elev - mean_e) / std_e if elev is not None else None

                    all_rows.append({
                        "eventId": event_id,
                        "tileId": f"{z}/{x}/{y}",
                        "flooded": int(flooded[r, c] > 0),
                        "elevationM": elev,
                        "slopeDegrees": slope,
                        "flowAccumulation": flow_acc,
                        "topographicWetnessIndex": twi,
                        "relativeElevationZ": rel_z,
                        "landCoverClass": land_cover,
                        "imperviousPct": impervious,
                        "distanceToWaterM": dist_water,
                        "femaSfha": in_sfha,
                    })

        time.sleep(0.5)  # light courtesy delay between tiles (Overpass etiquette)

    df = pd.DataFrame(all_rows).dropna(subset=["elevationM", "slopeDegrees", "flowAccumulation", "topographicWetnessIndex"])
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT_PATH, index=False)
    print(f"\nWrote {len(df)} real statewide training rows to {OUT_PATH}")
    print(f"Positive rate: {df['flooded'].mean():.4f} ({int(df['flooded'].sum())} / {len(df)})")
    print(f"Events represented: {df['eventId'].nunique()}, tiles: {df['tileId'].nunique()}")


if __name__ == "__main__":
    main()
