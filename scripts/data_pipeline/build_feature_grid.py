"""Build the 100 m analysis grid and derive real per-cell features for the
pilot AOI, from the raw data pulled by scripts/data_pipeline/sources/*.py.

Output: data/demo/feature_grid.geojson — one Feature per analysis cell, with
a stable cellId and a RiskFeatures-shaped properties block. Every value here
is derived from real public data (see data/metadata/sources.json); cells
outside the AOI polygon (plus a small buffer) are marked coverageTier
"unsupported" rather than assigned a fabricated score.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from shapely.geometry import Point, Polygon, box, shape
from shapely.ops import unary_union

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw"
AOI_PATH = REPO_ROOT / "data" / "metadata" / "pilot_aoi.geojson"
OUT_PATH = REPO_ROOT / "data" / "demo" / "feature_grid.geojson"
METADATA_PATH = REPO_ROOT / "data" / "metadata" / "sources.json"

CELL_SIZE_M = 100.0
PROJECTED_CRS = "EPSG:32618"  # UTM zone 18N, appropriate for southern NY
GRID_MODEL_ID = "feature-grid-v2-100m"

# NLCD Anderson Level II codes -> whether "developed" (used for context only;
# imperviousness itself is a direct coverage, not derived from this map).
DEVELOPED_CODES = {21, 22, 23, 24}


def reproject_dem(src_path: Path, dst_crs: str) -> tuple[np.ndarray, rasterio.Affine, str]:
    with rasterio.open(src_path) as src:
        transform, width, height = calculate_default_transform(
            src.crs, dst_crs, src.width, src.height, *src.bounds
        )
        dst_array = np.empty((height, width), dtype=np.float32)
        reproject(
            source=rasterio.band(src, 1),
            destination=dst_array,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=transform,
            dst_crs=dst_crs,
            resampling=Resampling.bilinear,
        )
    return dst_array, transform, dst_crs


def compute_slope_degrees(elev: np.ndarray, pixel_size_m: float) -> np.ndarray:
    gy, gx = np.gradient(elev, pixel_size_m)
    slope_rad = np.arctan(np.sqrt(gx**2 + gy**2))
    return np.degrees(slope_rad)


def sample_at(transform: rasterio.Affine, arr: np.ndarray, x: float, y: float) -> float | None:
    col, row = ~transform * (x, y)
    col, row = int(col), int(row)
    if 0 <= row < arr.shape[0] and 0 <= col < arr.shape[1]:
        val = arr[row, col]
        if np.isnan(val) or val < -1000:
            return None
        return float(val)
    return None


def load_bbox_padded(pad: float = 0.01) -> tuple[float, float, float, float]:
    aoi = json.loads(AOI_PATH.read_text())
    south, north, west, east = aoi["features"][0]["properties"]["boundingBoxSWNE"]
    return west - pad, south - pad, east + pad, north + pad


def load_aoi_polygon_buffered_m(buffer_m: float = 400.0) -> "shapely.geometry.base.BaseGeometry":
    aoi = json.loads(AOI_PATH.read_text())
    geom_wgs84 = shape(aoi["features"][0]["geometry"])
    gser = gpd.GeoSeries([geom_wgs84], crs="EPSG:4326").to_crs(PROJECTED_CRS)
    return gser.iloc[0].buffer(buffer_m)


def build_grid_polygons_projected(xmin, ymin, xmax, ymax) -> gpd.GeoDataFrame:
    bbox_wgs84 = gpd.GeoSeries([box(xmin, ymin, xmax, ymax)], crs="EPSG:4326")
    bbox_proj = bbox_wgs84.to_crs(PROJECTED_CRS).total_bounds  # xmin,ymin,xmax,ymax in meters

    px0, py0, px1, py1 = bbox_proj
    cols = int(np.ceil((px1 - px0) / CELL_SIZE_M))
    rows = int(np.ceil((py1 - py0) / CELL_SIZE_M))

    cells = []
    ids = []
    for r in range(rows):
        for c in range(cols):
            cx0 = px0 + c * CELL_SIZE_M
            cy0 = py0 + r * CELL_SIZE_M
            cells.append(Polygon([
                (cx0, cy0), (cx0 + CELL_SIZE_M, cy0),
                (cx0 + CELL_SIZE_M, cy0 + CELL_SIZE_M), (cx0, cy0 + CELL_SIZE_M),
            ]))
            ids.append(f"cell-{r:03d}-{c:03d}")

    gdf = gpd.GeoDataFrame({"cellId": ids}, geometry=cells, crs=PROJECTED_CRS)
    return gdf


def main() -> None:
    xmin, ymin, xmax, ymax = load_bbox_padded()
    aoi_buffered = load_aoi_polygon_buffered_m()

    print("Reprojecting DEM to projected CRS for accurate slope (meters)...")
    dem_arr, dem_transform, _ = reproject_dem(RAW_DIR / "dem_3dep.tif", PROJECTED_CRS)
    # Estimate pixel size in meters from the transform
    pixel_size_m = abs(dem_transform.a)
    slope_arr = compute_slope_degrees(dem_arr, pixel_size_m)

    print("Computing real D8 flow accumulation from the DEM...")
    import sys as _sys
    _sys.path.insert(0, str(REPO_ROOT))
    from services.risk.hydrology import compute_flow_accumulation
    flow_acc_arr = compute_flow_accumulation(dem_arr)

    print("Loading NLCD land cover + impervious (kept in native CRS, sampled via lon/lat)...")
    lc_ds = rasterio.open(RAW_DIR / "nlcd_land_cover.tif")
    imp_ds = rasterio.open(RAW_DIR / "nlcd_impervious.tif")
    lc_arr = lc_ds.read(1)
    imp_arr = imp_ds.read(1)

    print("Loading OSM water, roads, and FEMA flood zones...")
    water_raw = json.loads((RAW_DIR / "osm_water.json").read_text())
    roads_raw = json.loads((RAW_DIR / "osm_roads.json").read_text())
    fema_raw = json.loads((RAW_DIR / "fema_flood_zones.geojson").read_text())

    def osm_ways_to_lines(elements):
        lines = []
        for el in elements:
            if el.get("type") == "way" and "geometry" in el and len(el["geometry"]) >= 2:
                coords = [(pt["lon"], pt["lat"]) for pt in el["geometry"]]
                lines.append(coords)
        return lines

    from shapely.geometry import LineString

    water_lines = [LineString(c) for c in osm_ways_to_lines(water_raw["elements"]) if len(c) >= 2]
    road_lines = [LineString(c) for c in osm_ways_to_lines(roads_raw["elements"]) if len(c) >= 2]

    water_gdf = gpd.GeoDataFrame(geometry=water_lines, crs="EPSG:4326").to_crs(PROJECTED_CRS)
    roads_gdf = gpd.GeoDataFrame(geometry=road_lines, crs="EPSG:4326").to_crs(PROJECTED_CRS)
    water_union = unary_union(water_gdf.geometry.values) if len(water_gdf) else None
    roads_union = unary_union(roads_gdf.geometry.values) if len(roads_gdf) else None

    fema_zones = [
        {"geom": shape(f["geometry"]), "sfha": f["properties"].get("SFHA_TF") == "T"}
        for f in fema_raw["features"] if f.get("geometry")
    ]
    fema_gdf = gpd.GeoDataFrame(
        {"sfha": [z["sfha"] for z in fema_zones]},
        geometry=[z["geom"] for z in fema_zones],
        crs="EPSG:4326",
    ).to_crs(PROJECTED_CRS)
    fema_sfha_union = unary_union(fema_gdf[fema_gdf["sfha"]].geometry.values) if fema_gdf["sfha"].any() else None

    print("Building 100 m grid...")
    grid = build_grid_polygons_projected(xmin, ymin, xmax, ymax)
    grid_wgs84 = grid.to_crs("EPSG:4326")

    # relative elevation: z-score of each cell's mean elevation vs the full AOI's
    # sampled elevation distribution (a simple, documented local-relief proxy)
    elevations = []
    features = []

    for i, row_ in grid.iterrows():
        poly_proj = row_.geometry
        centroid_proj = poly_proj.centroid
        centroid_wgs84 = grid_wgs84.iloc[i].geometry.centroid

        supported = aoi_buffered.intersects(poly_proj)

        elev = sample_at(dem_transform, dem_arr, centroid_proj.x, centroid_proj.y)
        slope = sample_at(dem_transform, slope_arr, centroid_proj.x, centroid_proj.y)
        flow_acc = sample_at(dem_transform, flow_acc_arr, centroid_proj.x, centroid_proj.y)

        lc_row, lc_col = lc_ds.index(centroid_wgs84.x, centroid_wgs84.y)
        land_cover = None
        impervious_pct = None
        if 0 <= lc_row < lc_arr.shape[0] and 0 <= lc_col < lc_arr.shape[1]:
            lc_val = int(lc_arr[lc_row, lc_col])
            land_cover = lc_val if lc_val != 0 else None
        imp_row, imp_col = imp_ds.index(centroid_wgs84.x, centroid_wgs84.y)
        if 0 <= imp_row < imp_arr.shape[0] and 0 <= imp_col < imp_arr.shape[1]:
            imp_val = int(imp_arr[imp_row, imp_col])
            impervious_pct = imp_val if imp_val <= 100 else None

        dist_water = float(poly_proj.distance(water_union)) if water_union is not None else None
        dist_road = float(poly_proj.distance(roads_union)) if roads_union is not None else None
        in_sfha = bool(fema_sfha_union is not None and poly_proj.intersects(fema_sfha_union))

        if elev is not None:
            elevations.append((i, elev))

        features.append({
            "cellId": row_.cellId,
            "centroid": [round(centroid_wgs84.x, 6), round(centroid_wgs84.y, 6)],
            "geometry": json.loads(gpd.GeoSeries([grid_wgs84.iloc[i].geometry]).to_json())["features"][0]["geometry"],
            "coverageTier": "validated" if supported else "unsupported",
            "elevationM": elev,
            "slopeDegrees": slope,
            "flowAccumulation": flow_acc,
            "landCoverClass": land_cover,
            "imperviousPct": impervious_pct,
            "distanceToWaterM": dist_water,
            "distanceToRoadM": dist_road,
            "femaSfha": in_sfha,
        })

    # relative elevation z-score across cells with valid elevation, within the pilot AOI
    valid_elevs = np.array([e for _, e in elevations])
    mean_e, std_e = float(valid_elevs.mean()), float(valid_elevs.std() or 1.0)
    elev_lookup = dict(elevations)
    for i, feat in enumerate(features):
        if i in elev_lookup:
            feat["relativeElevationZ"] = round((elev_lookup[i] - mean_e) / std_e, 3)
        else:
            feat["relativeElevationZ"] = None

    n_supported = sum(1 for f in features if f["coverageTier"] == "validated")
    n_complete = sum(
        1 for f in features
        if f["coverageTier"] == "validated"
        and f["elevationM"] is not None and f["landCoverClass"] is not None
        and f["imperviousPct"] is not None
    )
    print(f"Grid cells: {len(features)} total, {n_supported} within pilot AOI, {n_complete} with complete real features")

    out_fc = {
        "type": "FeatureCollection",
        "properties": {
            "gridModelId": GRID_MODEL_ID,
            "cellSizeMeters": CELL_SIZE_M,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "projectedCrs": PROJECTED_CRS,
            "isSynthetic": False,
        },
        "features": [
            {
                "type": "Feature",
                "geometry": f["geometry"],
                "properties": {k: v for k, v in f.items() if k != "geometry"},
            }
            for f in features
        ],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out_fc))
    print(f"Wrote {len(features)} real feature-grid cells to {OUT_PATH}")


if __name__ == "__main__":
    main()
