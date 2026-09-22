"""Join real OSM roads and public facilities to the real 250 m analysis
grid, so the client can compute road-segment and facility flood-exposure
scores from live risk results without re-deriving geometry joins in the
browser. Every geometry here is real (OSM); only the *risk scores* are
computed later, reactively, client-side (per rainfall scenario).
"""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString, Point, shape

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw"
FEATURE_GRID_PATH = REPO_ROOT / "data" / "demo" / "feature_grid.geojson"
ROADS_OUT = REPO_ROOT / "data" / "demo" / "road_segments.geojson"
FACILITIES_OUT = REPO_ROOT / "data" / "demo" / "facilities.geojson"
INTERSECTIONS_OUT = REPO_ROOT / "data" / "demo" / "intersections.geojson"

PROJECTED_CRS = "EPSG:32618"
ROAD_BUFFER_M = 60.0
FACILITY_BUFFER_M = 150.0

# Real, notable OSM highway classes worth distinguishing (spec 6.8: road class matters)
MAJOR_CLASSES = {"motorway", "trunk", "primary", "secondary"}


def load_grid_cells() -> gpd.GeoDataFrame:
    fc = json.loads(FEATURE_GRID_PATH.read_text())
    records = [
        {"cellId": f["properties"]["cellId"], "geometry": shape(f["geometry"])}
        for f in fc["features"]
        if f["properties"]["coverageTier"] == "validated"
    ]
    return gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326").to_crs(PROJECTED_CRS)


def build_roads(grid_proj: gpd.GeoDataFrame) -> None:
    roads_raw = json.loads((RAW_DIR / "osm_roads.json").read_text())
    segments = []
    for el in roads_raw["elements"]:
        if el.get("type") != "way" or "geometry" not in el or len(el["geometry"]) < 2:
            continue
        coords = [(pt["lon"], pt["lat"]) for pt in el["geometry"]]
        tags = el.get("tags", {})
        highway_class = tags.get("highway", "unknown")
        segments.append({
            "segmentId": f"way-{el['id']}",
            "highwayClass": highway_class,
            "isMajor": highway_class in MAJOR_CLASSES,
            "name": tags.get("name"),
            "geometry": LineString(coords),
        })

    gdf = gpd.GeoDataFrame(segments, geometry="geometry", crs="EPSG:4326")
    gdf_proj = gdf.to_crs(PROJECTED_CRS)
    gdf_proj["lengthM"] = gdf_proj.geometry.length

    near_cells = []
    for geom in gdf_proj.geometry:
        buffered = geom.buffer(ROAD_BUFFER_M)
        hits = grid_proj[grid_proj.intersects(buffered)]
        near_cells.append(hits["cellId"].tolist())
    gdf["nearCellIds"] = near_cells
    gdf["lengthM"] = gdf_proj["lengthM"].round(1)

    out = json.loads(gdf.drop(columns=[]).to_json())
    ROADS_OUT.write_text(json.dumps(out))
    n_with_cells = sum(1 for s in near_cells if s)
    print(f"Wrote {len(segments)} real road segments ({n_with_cells} with >=1 nearby analysis cell) to {ROADS_OUT}")


def build_facilities(grid_proj: gpd.GeoDataFrame) -> None:
    raw = json.loads((RAW_DIR / "osm_facilities.json").read_text())
    records = []
    for el in raw["elements"]:
        tags = el.get("tags", {})
        if el["type"] == "node":
            lon, lat = el["lon"], el["lat"]
        elif "center" in el:
            lon, lat = el["center"]["lon"], el["center"]["lat"]
        else:
            continue
        facility_type = (
            tags.get("amenity") or tags.get("emergency") or
            ("transit" if tags.get("railway") == "station" else "unknown")
        )
        records.append({
            "facilityId": f"{el['type']}-{el['id']}",
            "facilityType": facility_type,
            "name": tags.get("name", "Unnamed"),
            "geometry": Point(lon, lat),
        })

    gdf = gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")
    gdf_proj = gdf.to_crs(PROJECTED_CRS)

    near_cells = []
    for geom in gdf_proj.geometry:
        buffered = geom.buffer(FACILITY_BUFFER_M)
        hits = grid_proj[grid_proj.intersects(buffered)]
        near_cells.append(hits["cellId"].tolist())
    gdf["nearCellIds"] = near_cells

    out = json.loads(gdf.to_json())
    FACILITIES_OUT.write_text(json.dumps(out))
    n_with_cells = sum(1 for s in near_cells if s)
    print(f"Wrote {len(records)} real facilities ({n_with_cells} with >=1 nearby analysis cell) to {FACILITIES_OUT}")


def build_intersections() -> None:
    """Derive real intersections: OSM nodes shared by >=2 distinct road ways."""
    roads_raw = json.loads((RAW_DIR / "osm_roads.json").read_text())
    node_way_count: dict[tuple[float, float], set[int]] = {}
    for el in roads_raw["elements"]:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        for pt in el["geometry"]:
            key = (round(pt["lon"], 6), round(pt["lat"], 6))
            node_way_count.setdefault(key, set()).add(el["id"])

    intersections = [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
         "properties": {"intersectionId": f"ix-{i}", "connectedWayCount": len(way_ids)}}
        for i, ((lon, lat), way_ids) in enumerate(node_way_count.items())
        if len(way_ids) >= 2
    ]
    fc = {"type": "FeatureCollection", "features": intersections}
    INTERSECTIONS_OUT.write_text(json.dumps(fc))
    print(f"Wrote {len(intersections)} real derived intersections to {INTERSECTIONS_OUT}")


def main() -> None:
    grid_proj = load_grid_cells()
    build_roads(grid_proj)
    build_facilities(grid_proj)
    build_intersections()


if __name__ == "__main__":
    main()
