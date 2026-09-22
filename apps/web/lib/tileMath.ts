/** Standard slippy-map tile math, mirroring services/risk/tiles.py so the
 * client and the live tile service agree on tile boundaries. */

export interface TileId {
  z: number;
  x: number;
  y: number;
}

export function tileKey(t: TileId): string {
  return `${t.z}/${t.x}/${t.y}`;
}

export function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return [x, y];
}

/** Returns every tile at `z` intersecting the given [west, south, east, north] bounds. */
export function tilesForBounds(bounds: [number, number, number, number], z: number): TileId[] {
  const [west, south, east, north] = bounds;
  const [xMin, yMin] = lonLatToTile(west, north, z); // north-west corner -> smaller y
  const [xMax, yMax] = lonLatToTile(east, south, z); // south-east corner -> larger y
  const tiles: TileId[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}
