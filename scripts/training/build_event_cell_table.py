"""Build the real event-cell training table from the pilot AOI's feature
grid and the 3 real Global Flood Database events with positive observations
inside the AOI (see docs/TRAINING_DATA_AUDIT.md).

Row = (cellId, eventId) with static real features + a real observed label.
Cells over permanent water or without adequate satellite observation
quality are dropped entirely (not coerced into a fabricated negative).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio

REPO_ROOT = Path(__file__).resolve().parents[2]
FEATURE_GRID_PATH = REPO_ROOT / "data" / "demo" / "feature_grid.geojson"
EVENTS_MANIFEST_PATH = REPO_ROOT / "data" / "metadata" / "gfd_events_pilot.json"
RAW_EVENTS_DIR = REPO_ROOT / "data" / "raw" / "gfd_events"
OUT_PATH = REPO_ROOT / "data" / "demo" / "event_cell_training_table.csv"

# Only events confirmed (scripts/data_pipeline/sources/gfd_labels.py output)
# to have real positive pixels inside this specific pilot AOI.
POSITIVE_EVENT_IDS = [
    "DFO_3625_From_20100310_to_20100324",
    "DFO_3629_From_20100327_to_20100331",
    "DFO_3861_From_20110827_to_20110913",
]

MIN_CLEAR_PERC = 0.5  # clearPerc is a 0-1 fraction; require >=50% clear satellite observations


def load_grid() -> list[dict]:
    fc = json.loads(FEATURE_GRID_PATH.read_text())
    return [
        f["properties"] | {"lon": f["properties"]["centroid"][0], "lat": f["properties"]["centroid"][1]}
        for f in fc["features"]
        if f["properties"]["coverageTier"] == "validated"
    ]


def sample_event_raster(raster_path: Path, cells: list[dict]) -> pd.DataFrame:
    rows = []
    with rasterio.open(raster_path) as ds:
        flooded_band, water_band, clear_band = ds.read()
        for cell in cells:
            row, col = ds.index(cell["lon"], cell["lat"])
            if not (0 <= row < flooded_band.shape[0] and 0 <= col < flooded_band.shape[1]):
                continue
            rows.append({
                "cellId": cell["cellId"],
                "flooded": int(flooded_band[row, col]),
                "permWater": int(water_band[row, col]),
                "clearPerc": float(clear_band[row, col]),
            })
    return pd.DataFrame(rows)


def main() -> None:
    cells = load_grid()
    print(f"Loaded {len(cells)} real, in-AOI feature-grid cells.")
    events = {e["eventId"]: e for e in json.loads(EVENTS_MANIFEST_PATH.read_text())}

    feature_cols = ["elevationM", "slopeDegrees", "flowAccumulation", "topographicWetnessIndex", "curvature",
                     "landCoverClass", "imperviousPct", "distanceToWaterM", "distanceToRoadM",
                     "femaSfha", "relativeElevationZ"]
    cell_features = {c["cellId"]: {k: c[k] for k in feature_cols} for c in cells}

    all_rows = []
    for event_id in POSITIVE_EVENT_IDS:
        raster_path = RAW_EVENTS_DIR / f"{event_id}.tif"
        if not raster_path.exists():
            print(f"Skipping {event_id}: raster not found (run gfd_labels.py first).")
            continue
        sampled = sample_event_raster(raster_path, cells)

        valid = sampled[(sampled["permWater"] == 0) & (sampled["clearPerc"] >= MIN_CLEAR_PERC)].copy()
        dropped = len(sampled) - len(valid)
        print(f"{event_id}: {len(sampled)} sampled, {dropped} dropped (permanent water / low observation quality), "
              f"{len(valid)} kept, {int(valid['flooded'].sum())} positive")

        valid["eventId"] = event_id
        valid["dfoMainCause"] = events[event_id]["dfoMainCause"]
        valid["dfoSeverity"] = events[event_id]["dfoSeverity"]
        for col in feature_cols:
            valid[col] = valid["cellId"].map(lambda cid: cell_features.get(cid, {}).get(col))
        all_rows.append(valid)

    if not all_rows:
        print("No event rows produced. Nothing to write.")
        return

    table = pd.concat(all_rows, ignore_index=True)
    table = table.dropna(subset=feature_cols)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(OUT_PATH, index=False)
    print(f"\nWrote {len(table)} real event-cell training rows to {OUT_PATH}")
    print(f"Positive rate: {table['flooded'].mean():.3f} ({int(table['flooded'].sum())} / {len(table)})")
    print(f"Events represented: {table['eventId'].nunique()}, unique cells: {table['cellId'].nunique()}")


if __name__ == "__main__":
    main()
