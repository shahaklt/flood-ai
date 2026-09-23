"use client";

import { computeBaselineRisk } from "@flood-ai/risk-runtime";
import { RAINFALL_SCENARIOS, type RiskCategory, type RiskFeatures, type RiskResult } from "@flood-ai/shared";
import { useMemo, useState } from "react";
import { riskColor } from "@/lib/colorRamp";
import { suggestBestIntervention } from "@/lib/interventionTypes";
import { DATA_VERSION, FEATURE_TILE_ZOOM, rawCellToFeatures, type TileResponse } from "@/lib/riskTile";
import { tilesForBounds, type TileId } from "@/lib/tileMath";

const MAX_TILES = 36; // guard against a huge county triggering hundreds of cold-tile live fetches
const TILE_CONCURRENCY = 6;
const CATEGORY_ORDER: RiskCategory[] = ["minimal", "low", "moderate", "high", "very_high"];
const CATEGORY_LABELS: Record<RiskCategory, string> = {
  minimal: "Minimal",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  very_high: "Very high",
};

interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  boundingBox: { south: number; north: number; west: number; east: number };
}

interface CellResult extends RiskResult {
  lat: number;
  lon: number;
  feature: RiskFeatures;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export default function MunicipalView() {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);
  const [picked, setPicked] = useState<GeocodeResult | null>(null);
  const [rainfallScenarioId, setRainfallScenarioId] = useState(RAINFALL_SCENARIOS[1].id);
  const [status, setStatus] = useState<"idle" | "searching" | "loading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [truncated, setTruncated] = useState(false);
  const [cells, setCells] = useState<CellResult[]>([]);

  const search = async () => {
    if (!query.trim()) return;
    setStatus("searching");
    setErrorMessage(null);
    setCandidates([]);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = await res.json();
      if (!res.ok || !body.results?.length) {
        setStatus("error");
        setErrorMessage(body.error ?? "No results found in New York State.");
        return;
      }
      setCandidates(body.results);
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMessage("Geocoding request failed.");
    }
  };

  const runAnalysis = async (place: GeocodeResult, scenarioId: string) => {
    const scenario = RAINFALL_SCENARIOS.find((s) => s.id === scenarioId) ?? RAINFALL_SCENARIOS[0];
    setPicked(place);
    setCandidates([]);
    setStatus("loading");
    setErrorMessage(null);
    setCells([]);

    const { south, north, west, east } = place.boundingBox;
    const allTiles = tilesForBounds([west, south, east, north], FEATURE_TILE_ZOOM);
    const tiles = allTiles.slice(0, MAX_TILES);
    setTruncated(allTiles.length > MAX_TILES);
    setProgress({ done: 0, total: tiles.length });

    try {
      const perTile = await mapWithConcurrency(tiles, TILE_CONCURRENCY, async (t: TileId) => {
        try {
          const res = await fetch(`/api/risk-tiles/${t.z}/${t.x}/${t.y}`);
          const tile: TileResponse = await res.json();
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          if (tile.coverageTier !== "validated" || !tile.features?.length) return [] as CellResult[];
          return tile.features.map((c): CellResult => {
            const feature = rawCellToFeatures(c);
            const result = computeBaselineRisk(feature, {
              rainfallTotalInches: scenario.totalInches,
              rainfallScenarioId: scenario.id,
              dataVersion: DATA_VERSION,
            });
            return { ...result, lat: c.centroid[1], lon: c.centroid[0], feature };
          });
        } catch {
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          return [] as CellResult[];
        }
      });
      const flat = perTile.flat();
      if (flat.length === 0) {
        setStatus("error");
        setErrorMessage("No FloodAI coverage found in this area.");
        return;
      }
      setCells(flat);
      setStatus("done");
    } catch {
      setStatus("error");
      setErrorMessage("Analysis failed.");
    }
  };

  const onScenarioChange = (id: string) => {
    setRainfallScenarioId(id);
    if (picked) runAnalysis(picked, id);
  };

  const meanScore = cells.length ? cells.reduce((s, c) => s + c.riskScore, 0) / cells.length : null;
  const sortedScores = [...cells].map((c) => c.riskScore).sort((a, b) => a - b);
  const p90Score = sortedScores.length ? sortedScores[Math.floor(0.9 * (sortedScores.length - 1))] : null;
  const categoryCounts = CATEGORY_ORDER.map((cat) => ({
    cat,
    count: cells.filter((c) => c.riskCategory === cat).length,
  }));
  const topCells = [...cells].sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);
  const scenario = RAINFALL_SCENARIOS.find((s) => s.id === rainfallScenarioId) ?? RAINFALL_SCENARIOS[0];
  const suggestions = useMemo(
    () =>
      new Map(
        topCells.map((c) => [
          c.cellId,
          suggestBestIntervention(c.feature, {
            rainfallTotalInches: scenario.totalInches,
            rainfallScenarioId: scenario.id,
            dataVersion: DATA_VERSION,
          }),
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, rainfallScenarioId],
  );

  return (
    <div className="mt-8">
      <div className="flex gap-2">
        <input
          value={picked ? picked.label : query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
            setCells([]);
            setStatus("idle");
          }}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Town, city, or county in NY State"
          className="min-w-0 flex-1 border border-border bg-bg px-2 py-1.5 text-sm text-ink placeholder:text-ink-muted"
        />
        <button
          onClick={search}
          disabled={status === "searching" || status === "loading"}
          className="shrink-0 border border-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-muted disabled:opacity-50"
        >
          {status === "searching" ? "..." : "Find"}
        </button>
      </div>

      {candidates.length > 0 && (
        <ul className="mt-2 divide-y divide-border border border-border text-xs">
          {candidates.map((c) => (
            <li key={`${c.lat},${c.lon}`}>
              <button
                onClick={() => runAnalysis(c, rainfallScenarioId)}
                className="block w-full px-2 py-1.5 text-left text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === "error" && errorMessage && <p className="mt-2 text-xs text-danger">{errorMessage}</p>}

      {status === "loading" && (
        <p className="mt-4 text-sm text-ink-muted">
          Fetching real tile data: {progress.done}/{progress.total}
          {truncated && " (area truncated to the largest supported tile count)"}
        </p>
      )}

      {(status === "done" || (status === "loading" && cells.length > 0)) && picked && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">
              {picked.label}
              {truncated && (
                <span className="ml-2 text-[11px] text-warn">
                  area truncated to {MAX_TILES} tiles — results are a real sample, not full coverage
                </span>
              )}
            </p>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              Rainfall
              <select
                value={rainfallScenarioId}
                onChange={(e) => onScenarioChange(e.target.value)}
                className="border border-border bg-surface px-2 py-1 text-xs text-ink"
              >
                {RAINFALL_SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
            <div className="bg-surface p-4">
              <p className="font-mono text-2xl tabular text-ink">{cells.length}</p>
              <p className="mt-1 text-xs text-ink-muted">real analysis cells scored</p>
            </div>
            <div className="bg-surface p-4">
              <p className="font-mono text-2xl tabular text-ink">{meanScore?.toFixed(1)}</p>
              <p className="mt-1 text-xs text-ink-muted">mean risk score</p>
            </div>
            <div className="bg-surface p-4">
              <p className="font-mono text-2xl tabular text-ink">{p90Score}</p>
              <p className="mt-1 text-xs text-ink-muted">90th percentile risk score</p>
            </div>
          </div>

          <div className="mt-4 border border-border bg-surface p-4">
            <p className="text-xs text-ink-muted">Category breakdown</p>
            <div className="mt-2 flex h-4 w-full overflow-hidden">
              {categoryCounts.map(({ cat, count }) =>
                count > 0 ? (
                  <div
                    key={cat}
                    style={{ width: `${(count / cells.length) * 100}%`, backgroundColor: riskColor(CATEGORY_ORDER.indexOf(cat) * 25) }}
                    title={`${CATEGORY_LABELS[cat]}: ${count}`}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
              {categoryCounts.map(({ cat, count }) => (
                <span key={cat}>
                  {CATEGORY_LABELS[cat]}: {count} ({((count / cells.length) * 100).toFixed(0)}%)
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-ink-muted">
                  <th className="px-3 py-2 font-normal">Rank</th>
                  <th className="px-3 py-2 font-normal">Score</th>
                  <th className="px-3 py-2 font-normal">Category</th>
                  <th className="px-3 py-2 font-normal">Confidence</th>
                  <th className="px-3 py-2 font-normal">Coordinates</th>
                  <th className="px-3 py-2 font-normal">Suggested intervention</th>
                </tr>
              </thead>
              <tbody>
                {topCells.map((c, i) => {
                  const suggestion = suggestions.get(c.cellId);
                  return (
                    <tr key={c.cellId} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-ink-muted">{i + 1}</td>
                      <td className="px-3 py-2 font-mono tabular" style={{ color: riskColor(c.riskScore) }}>
                        {c.riskScore}
                      </td>
                      <td className="px-3 py-2 capitalize text-ink-muted">{c.riskCategory.replace("_", " ")}</td>
                      <td className="px-3 py-2 font-mono tabular text-ink-muted">{c.confidenceScore}%</td>
                      <td className="px-3 py-2 font-mono tabular text-ink-muted">
                        {c.lat.toFixed(4)}, {c.lon.toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">
                        {suggestion ? (
                          <>
                            {suggestion.label}{" "}
                            <span className="font-mono tabular text-accent">
                              ({suggestion.beforeScore}→{suggestion.afterScore})
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">
            Top 10 of {cells.length} scored cells, by risk score. Suggested intervention is whichever real
            intervention type this same engine scores as reducing risk most at that spot — a starting point, not
            an engineering recommendation.
          </p>
        </div>
      )}

      <p className="mt-6 text-[11px] text-ink-muted">
        Every score is FloodAI&apos;s deterministic baseline relative risk index, computed live from real public
        environmental data (see /methodology). This is a prioritization aid, not an engineering assessment.
      </p>
    </div>
  );
}
