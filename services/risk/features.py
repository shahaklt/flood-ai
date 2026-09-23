"""Compute real RiskFeatures for one map tile, live, from real public data
sources — the statewide equivalent of scripts/data_pipeline/build_feature_grid.py,
generalized to any tile in New York State instead of one fixed pilot AOI.
"""
from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from shapely.geometry import Point, box
from shapely.ops import unary_union

from .adapters import coverage, dem, fema, nhd, nlcd, osm_water
from .hydrology import compute_curvature, compute_flow_accumulation
from .tiles import tile_to_bbox

CELL_SIZE_DEG_LAT = 0.0009  # ~100 m
DEVELOPED_UNKNOWN_LC = 0


def _meters_per_degree(lat_deg: float) -> tuple[float, float]:
    lat_rad = math.radians(lat_deg)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(lat_rad)
    return m_per_deg_lon, m_per_deg_lat


def _sample(transform, arr: np.ndarray, lon: float, lat: float) -> float | None:
    col, row = ~transform * (lon, lat)
    col, row = int(col), int(row)
    if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1]:
        val = arr[row, col]
        if np.isnan(val) or val < -1000:
            return None
        return float(val)
    return None


def compute_tile_features(z: int, x: int, y: int) -> dict:
    bbox = tile_to_bbox(z, x, y)  # west, south, east, north
    xmin, ymin, xmax, ymax = bbox
    center_lat = (ymin + ymax) / 2
    m_per_deg_lon, m_per_deg_lat = _meters_per_degree(center_lat)

    if not coverage.tile_in_coverage(bbox):
        return {"coverageTier": "unsupported", "features": []}

    warnings: list[str] = []

    # These five real external calls are independent -- run them concurrently
    # instead of sequentially. This is what takes a cold tile from ~15-25s
    # down to roughly the slowest single call (~5-10s), since network I/O
    # dominates, not CPU. Each failure degrades that one source gracefully
    # (missing feature, lower confidence) rather than failing the whole tile.
    with ThreadPoolExecutor(max_workers=5) as pool:
        dem_future = pool.submit(dem.fetch_dem, bbox)
        lc_future = pool.submit(nlcd.fetch_land_cover, bbox)
        imp_future = pool.submit(nlcd.fetch_impervious, bbox)
        fema_future = pool.submit(fema.fetch_fema_sfha_union, bbox)
        water_future = pool.submit(osm_water.fetch_water_union, bbox)
        nhd_future = pool.submit(nhd.fetch_nhd_flowlines_union, bbox)

        try:
            dem_arr, dem_transform = dem_future.result()
        except Exception as exc:  # real upstream failure -> partial/unsupported, never fabricated
            return {"coverageTier": "partial_data", "features": [], "error": f"DEM fetch failed: {exc}"}

        try:
            lc_arr, lc_transform = lc_future.result()
            imp_arr, imp_transform = imp_future.result()
        except Exception as exc:
            lc_arr = lc_transform = imp_arr = imp_transform = None
            warnings.append(f"NLCD unavailable for this tile: {exc}")

        try:
            fema_sfha = fema_future.result()
        except Exception as exc:
            fema_sfha = None
            warnings.append(f"FEMA NFHL unavailable for this tile: {exc}")

        osm_water_union = water_future.result()
        nhd_union = nhd_future.result()
        water_parts = [g for g in (osm_water_union, nhd_union) if g is not None]
        water_union = unary_union(water_parts) if water_parts else None
        if water_union is None:
            warnings.append("No surface water found from OSM or NHD, or both were unavailable for this tile")

    gy, gx = np.gradient(dem_arr)
    # gradient is in pixel units; convert to per-meter using the DEM's own pixel size
    pixel_w_deg = abs(dem_transform.a)
    pixel_h_deg = abs(dem_transform.e)
    gx_m = gx / (pixel_w_deg * m_per_deg_lon)
    gy_m = gy / (pixel_h_deg * m_per_deg_lat)
    slope_arr = np.degrees(np.arctan(np.sqrt(gx_m**2 + gy_m**2)))
    flow_acc_arr = compute_flow_accumulation(dem_arr)
    # Topographic Wetness Index: standard hydrology metric combining flow
    # accumulation and slope (ln(upslope area / tan(slope))) -- high where
    # water both concentrates AND has nowhere to drain. Free to compute from
    # data already fetched; epsilon avoids division by zero on flat cells.
    twi_arr = np.log((flow_acc_arr + 1.0) / (np.tan(np.radians(slope_arr)) + 0.01))
    pixel_size_x_m = pixel_w_deg * m_per_deg_lon
    pixel_size_y_m = pixel_h_deg * m_per_deg_lat
    curvature_arr = compute_curvature(dem_arr, pixel_size_x_m, pixel_size_y_m)

    n_cols = max(1, round((xmax - xmin) / (CELL_SIZE_DEG_LAT * m_per_deg_lat / m_per_deg_lon)))
    n_rows = max(1, round((ymax - ymin) / CELL_SIZE_DEG_LAT))
    cell_w = (xmax - xmin) / n_cols
    cell_h = (ymax - ymin) / n_rows

    raw_cells = []
    for r in range(n_rows):
        for c in range(n_cols):
            cx0, cy0 = xmin + c * cell_w, ymin + r * cell_h
            cx1, cy1 = cx0 + cell_w, cy0 + cell_h
            centroid_lon, centroid_lat = (cx0 + cx1) / 2, (cy0 + cy1) / 2

            elev = _sample(dem_transform, dem_arr, centroid_lon, centroid_lat)
            slope = _sample(dem_transform, slope_arr, centroid_lon, centroid_lat)
            flow_acc = _sample(dem_transform, flow_acc_arr, centroid_lon, centroid_lat)
            twi = _sample(dem_transform, twi_arr, centroid_lon, centroid_lat)
            curvature = _sample(dem_transform, curvature_arr, centroid_lon, centroid_lat)
            land_cover = _sample(lc_transform, lc_arr, centroid_lon, centroid_lat) if lc_arr is not None else None
            impervious = _sample(imp_transform, imp_arr, centroid_lon, centroid_lat) if imp_arr is not None else None

            cell_point = Point(centroid_lon, centroid_lat)
            dist_water_m = None
            if water_union is not None:
                # local flat-earth approx is fine at this scale; convert degree distance to meters
                deg_dist = cell_point.distance(water_union)
                dist_water_m = deg_dist * ((m_per_deg_lon + m_per_deg_lat) / 2)

            in_sfha = bool(fema_sfha is not None and cell_point.intersects(fema_sfha))

            raw_cells.append({
                "cellId": f"{z}-{x}-{y}-r{r}c{c}",
                "centroid": [round(centroid_lon, 6), round(centroid_lat, 6)],
                "geometry": {"type": "Polygon", "coordinates": [[[cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1], [cx0, cy0]]]},
                "elevationM": elev,
                "slopeDegrees": slope,
                "flowAccumulation": flow_acc,
                "topographicWetnessIndex": twi,
                "curvature": curvature,
                "landCoverClass": int(land_cover) if land_cover is not None else None,
                "imperviousPct": int(impervious) if impervious not in (None,) and impervious <= 100 else None,
                "distanceToWaterM": round(dist_water_m, 1) if dist_water_m is not None else None,
                "femaSfha": in_sfha,
            })

    elevs = [c["elevationM"] for c in raw_cells if c["elevationM"] is not None]
    mean_e = float(np.mean(elevs)) if elevs else 0.0
    std_e = float(np.std(elevs)) if elevs and np.std(elevs) > 0 else 1.0

    for c in raw_cells:
        c["relativeElevationZ"] = round((c["elevationM"] - mean_e) / std_e, 3) if c["elevationM"] is not None else None
        c["coverageTier"] = "validated"

    return {"coverageTier": "validated", "features": raw_cells, "warnings": warnings}
