"""Standard slippy-map tile math (z/x/y <-> WGS84 bbox)."""
from __future__ import annotations

import math


def tile_to_bbox(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Returns (west, south, east, north) in WGS84 degrees."""
    n = 2.0**z

    def lon(xt: float) -> float:
        return xt / n * 360.0 - 180.0

    def lat(yt: float) -> float:
        rad = math.atan(math.sinh(math.pi * (1 - 2 * yt / n)))
        return math.degrees(rad)

    west, east = lon(x), lon(x + 1)
    north, south = lat(y), lat(y + 1)
    return west, south, east, north


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2.0**z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y
