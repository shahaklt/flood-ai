"""Pre-warm the risk service's real tile cache for the pilot area and a
handful of showcase locations, so opening the demo doesn't hit a cold
15-25s live fetch on the very first tile. Requires uvicorn services.risk.main
running locally. This is a cache warm-up, not a precompute of statewide
coverage -- every other tile in New York still fetches live on first view.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
from services.risk.tiles import lonlat_to_tile  # noqa: E402

RISK_API_BASE_URL = "http://localhost:8000"
ZOOM = 13

# (name, lon, lat) -- pilot AOI center plus a few widely-separated real
# showcase locations so a demo pan across the state feels instant too.
LOCATIONS = [
    ("Mamaroneck pilot (center)", -73.7319, 40.9508),
    ("Mamaroneck pilot (north)", -73.7319, 40.965),
    ("Mamaroneck pilot (south)", -73.7319, 40.937),
    ("Buffalo", -78.8784, 42.8864),
    ("Albany", -73.7562, 42.6526),
    ("NYC", -73.9857, 40.7484),
    ("Syracuse", -76.1474, 43.0481),
]


def main() -> None:
    tiles = {lonlat_to_tile(lon, lat, ZOOM) for _, lon, lat in LOCATIONS}
    print(f"Pre-warming {len(tiles)} real tiles...")
    for i, (x, y) in enumerate(sorted(tiles), 1):
        t0 = time.time()
        try:
            r = requests.get(f"{RISK_API_BASE_URL}/api/features/{ZOOM}/{x}/{y}", timeout=60)
            r.raise_for_status()
            tier = r.json().get("coverageTier")
            print(f"  [{i}/{len(tiles)}] {ZOOM}/{x}/{y}: {tier} ({time.time()-t0:.1f}s)")
        except Exception as exc:
            print(f"  [{i}/{len(tiles)}] {ZOOM}/{x}/{y}: FAILED ({exc})")


if __name__ == "__main__":
    main()
