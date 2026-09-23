import type { HydrologicSoilGroup, RiskFeatures } from "@flood-ai/shared";

/** Shared shape of a raw feature cell as served by services/risk's live
 * per-tile endpoint (apps/web/app/api/risk-tiles/[z]/[x]/[y]/route.ts),
 * used by any client component that fetches a tile directly (compare,
 * municipal) rather than through the map's own viewport-driven flow. */
export interface RawTileCell {
  cellId: string;
  centroid: [number, number];
  elevationM: number | null;
  slopeDegrees: number | null;
  flowAccumulation: number | null;
  topographicWetnessIndex: number | null;
  curvature: number | null;
  landCoverClass: number | null;
  imperviousPct: number | null;
  distanceToWaterM: number | null;
  femaSfha: boolean;
  hydrologicSoilGroup: HydrologicSoilGroup | null;
  relativeElevationZ: number | null;
  coverageTier: RiskFeatures["coverageTier"];
}

export interface TileResponse {
  coverageTier: RiskFeatures["coverageTier"];
  features: RawTileCell[];
  error?: string;
}

export const DATA_VERSION = "risk-tiles-v1-nystate";
export const FEATURE_TILE_ZOOM = 13;

export function rawCellToFeatures(cell: RawTileCell): RiskFeatures {
  return {
    cellId: cell.cellId,
    centroid: cell.centroid,
    coverageTier: cell.coverageTier,
    elevationM: cell.elevationM,
    slopeDegrees: cell.slopeDegrees,
    flowAccumulation: cell.flowAccumulation,
    topographicWetnessIndex: cell.topographicWetnessIndex,
    curvature: cell.curvature,
    landCoverClass: cell.landCoverClass,
    imperviousPct: cell.imperviousPct,
    distanceToWaterM: cell.distanceToWaterM,
    distanceToRoadM: null,
    femaSfha: cell.femaSfha,
    hydrologicSoilGroup: cell.hydrologicSoilGroup,
    relativeElevationZ: cell.relativeElevationZ,
  };
}
