import { computeBaselineRisk } from "@flood-ai/risk-runtime";
import { RAINFALL_SCENARIOS } from "@flood-ai/shared";
import Link from "next/link";
import HomeLiveScores, { type LiveScoreExample } from "./HomeLiveScores";
import { DATA_VERSION, FEATURE_TILE_ZOOM, rawCellToFeatures, type TileResponse } from "@/lib/riskTile";
import { lonLatToTile } from "@/lib/tileMath";

const RISK_API_BASE_URL = process.env.RISK_API_BASE_URL || "http://localhost:8000";

const EXAMPLE_PLACES: { label: string; lon: number; lat: number }[] = [
  { label: "Mamaroneck, NY", lon: -73.7331, lat: 40.9487 },
  { label: "Buffalo, NY", lon: -78.8784, lat: 42.8864 },
  { label: "Albany, NY", lon: -73.7562, lat: 42.6526 },
  { label: "Lower Manhattan, NYC", lon: -74.006, lat: 40.7128 },
];

function nearestCell(cells: TileResponse["features"], lon: number, lat: number) {
  let best = cells[0];
  let bestDist = Infinity;
  for (const c of cells) {
    const dx = c.centroid[0] - lon;
    const dy = c.centroid[1] - lat;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

async function fetchLiveExamples(): Promise<LiveScoreExample[]> {
  const results = await Promise.allSettled(
    EXAMPLE_PLACES.map(async (place) => {
      const [x, y] = lonLatToTile(place.lon, place.lat, FEATURE_TILE_ZOOM);
      const res = await fetch(`${RISK_API_BASE_URL}/api/features/${FEATURE_TILE_ZOOM}/${x}/${y}`, {
        // Cold tiles pull real DEM/NLCD/FEMA/water data on first request and
        // can take a while; once cached (see services/risk/cache.py) this is
        // near-instant, so a generous one-time timeout doesn't slow anyone
        // down after the first visitor per tile.
        signal: AbortSignal.timeout(25_000),
        next: { revalidate: 86_400 },
      });
      const tile = (await res.json()) as TileResponse;
      if (tile.coverageTier !== "validated" || !tile.features?.length) throw new Error("no coverage");
      const cell = nearestCell(tile.features, place.lon, place.lat);
      const feature = rawCellToFeatures(cell);
      const result = computeBaselineRisk(feature, {
        rainfallTotalInches: RAINFALL_SCENARIOS[1].totalInches,
        rainfallScenarioId: RAINFALL_SCENARIOS[1].id,
        dataVersion: DATA_VERSION,
      });
      return { label: place.label, score: result.riskScore, category: result.riskCategory };
    }),
  );
  return results.filter((r): r is PromiseFulfilledResult<LiveScoreExample> => r.status === "fulfilled").map((r) => r.value);
}

export default async function Home() {
  const liveExamples = await fetchLiveExamples();
  return (
    <div className="flex flex-1 flex-col bg-bg text-ink">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-24">
        <div>
          <p className="font-mono text-xs tracking-wide text-accent">FLOODAI — NEW YORK STATE</p>
          <h1 className="mt-3 text-3xl font-medium leading-tight text-ink sm:text-4xl">
            An explainable flood-risk instrument, not a forecast.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">
            FloodAI computes a live 0-100 flood-risk index for any location in New York State,
            entirely from real public environmental data — elevation, terrain hydrology, land
            cover, FEMA flood zones, road and facility geometry. Every score traces back to the
            exact factors that produced it. Compare locations, summarize a whole town, or test a
            proposed drain or barrier before it&apos;s built.
          </p>
        </div>

        <HomeLiveScores examples={liveExamples} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/map"
            className="rounded bg-accent px-5 py-2.5 text-center text-sm font-medium text-accent-ink transition-colors hover:brightness-110"
          >
            Open the map
          </Link>
          <Link
            href="/methodology"
            className="rounded border border-border px-5 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-ink-muted"
          >
            Methodology & data sources
          </Link>
          <Link
            href="/impact"
            className="rounded border border-border px-5 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-ink-muted"
          >
            Why this matters
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/compare" className="text-accent underline underline-offset-2 hover:brightness-110">
            Compare locations
          </Link>
          <Link href="/municipal" className="text-accent underline underline-offset-2 hover:brightness-110">
            Municipal dashboard
          </Link>
          <Link href="/model" className="text-accent underline underline-offset-2 hover:brightness-110">
            Model internals
          </Link>
        </div>

        <div className="grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3">
          <div className="bg-surface p-5 transition-colors hover:bg-surface-2">
            <p className="font-mono text-xs text-accent">01 PREDICT</p>
            <p className="mt-2 text-sm text-ink-muted">
              A versioned, deterministic risk engine scores real environmental features live,
              anywhere in New York State. No fabricated numbers, no synthetic fallback data.
            </p>
          </div>
          <div className="bg-surface p-5 transition-colors hover:bg-surface-2">
            <p className="font-mono text-xs text-accent">02 INSPECT</p>
            <p className="mt-2 text-sm text-ink-muted">
              Click any cell, road, or facility for its exact contributing factors, data sources,
              coverage tier, and confidence.
            </p>
          </div>
          <div className="bg-surface p-5 transition-colors hover:bg-surface-2">
            <p className="font-mono text-xs text-accent">03 PLAN</p>
            <p className="mt-2 text-sm text-ink-muted">
              Model a proposed drain, barrier, or repair and compare before/after risk, including
              displaced or increased exposure.
            </p>
          </div>
        </div>

        <div className="rounded border border-warn/40 bg-warn-surface p-4 text-sm text-ink">
          <span className="mr-1.5 font-mono text-xs text-warn">[PLANNING TOOL]</span>
          FloodAI provides planning estimates based on available public data. It does not replace
          official flood maps, emergency alerts, engineering studies, or instructions from public
          authorities.
        </div>
      </main>
    </div>
  );
}
