"use client";

import { computeBaselineRisk } from "@flood-ai/risk-runtime";
import { RAINFALL_SCENARIOS, type RiskFeatures, type RiskResult } from "@flood-ai/shared";
import { useState } from "react";
import { riskColor } from "@/lib/colorRamp";
import { lonLatToTile } from "@/lib/tileMath";

const DATA_VERSION = "risk-tiles-v1-nystate";
const FEATURE_TILE_ZOOM = 13;
const MAX_LOCATIONS = 4;

interface RawTileCell {
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
  relativeElevationZ: number | null;
  coverageTier: RiskFeatures["coverageTier"];
}

interface TileResponse {
  coverageTier: RiskFeatures["coverageTier"];
  features: RawTileCell[];
  error?: string;
}

interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
}

interface LocationSlot {
  id: number;
  query: string;
  status: "idle" | "searching" | "picking" | "loading" | "done" | "error";
  errorMessage?: string;
  candidates: GeocodeResult[];
  picked: GeocodeResult | null;
  feature: RiskFeatures | null;
  result: RiskResult | null;
}

let nextId = 1;
const emptySlot = (): LocationSlot => ({
  id: nextId++,
  query: "",
  status: "idle",
  candidates: [],
  picked: null,
  feature: null,
  result: null,
});

function nearestCell(cells: RawTileCell[], lon: number, lat: number): RawTileCell | null {
  let best: RawTileCell | null = null;
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

export default function CompareView() {
  const [slots, setSlots] = useState<LocationSlot[]>([emptySlot(), emptySlot()]);
  const [rainfallScenarioId, setRainfallScenarioId] = useState(RAINFALL_SCENARIOS[1].id);

  const rainfallScenario = RAINFALL_SCENARIOS.find((s) => s.id === rainfallScenarioId) ?? RAINFALL_SCENARIOS[0];

  const recompute = (feature: RiskFeatures): RiskResult =>
    computeBaselineRisk(feature, {
      rainfallTotalInches: rainfallScenario.totalInches,
      rainfallScenarioId: rainfallScenario.id,
      dataVersion: DATA_VERSION,
    });

  const updateSlot = (id: number, patch: Partial<LocationSlot>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const onScenarioChange = (id: string) => {
    setRainfallScenarioId(id);
    const scenario = RAINFALL_SCENARIOS.find((s) => s.id === id) ?? RAINFALL_SCENARIOS[0];
    setSlots((prev) =>
      prev.map((s) =>
        s.feature
          ? {
              ...s,
              result: computeBaselineRisk(s.feature, {
                rainfallTotalInches: scenario.totalInches,
                rainfallScenarioId: scenario.id,
                dataVersion: DATA_VERSION,
              }),
            }
          : s,
      ),
    );
  };

  const search = async (id: number, query: string) => {
    if (!query.trim()) return;
    updateSlot(id, { status: "searching", errorMessage: undefined, candidates: [] });
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = await res.json();
      if (!res.ok || !body.results?.length) {
        updateSlot(id, { status: "error", errorMessage: body.error ?? "No results found in New York State." });
        return;
      }
      if (body.results.length === 1) {
        await pick(id, body.results[0]);
      } else {
        updateSlot(id, { status: "picking", candidates: body.results });
      }
    } catch {
      updateSlot(id, { status: "error", errorMessage: "Geocoding request failed." });
    }
  };

  const pick = async (id: number, candidate: GeocodeResult) => {
    updateSlot(id, { status: "loading", picked: candidate, candidates: [] });
    try {
      const [x, y] = lonLatToTile(candidate.lon, candidate.lat, FEATURE_TILE_ZOOM);
      const res = await fetch(`/api/risk-tiles/${FEATURE_TILE_ZOOM}/${x}/${y}`);
      const tile: TileResponse = await res.json();
      if (!res.ok || tile.coverageTier !== "validated" || !tile.features?.length) {
        updateSlot(id, {
          status: "error",
          errorMessage: tile.error ?? "No real coverage available at this location.",
        });
        return;
      }
      const cell = nearestCell(tile.features, candidate.lon, candidate.lat);
      if (!cell) {
        updateSlot(id, { status: "error", errorMessage: "No analysis cell found near this location." });
        return;
      }
      const feature: RiskFeatures = {
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
        relativeElevationZ: cell.relativeElevationZ,
      };
      updateSlot(id, { status: "done", feature, result: recompute(feature) });
    } catch {
      updateSlot(id, { status: "error", errorMessage: "Risk lookup failed." });
    }
  };

  const addSlot = () => setSlots((prev) => (prev.length < MAX_LOCATIONS ? [...prev, emptySlot()] : prev));
  const removeSlot = (id: number) => setSlots((prev) => (prev.length > 2 ? prev.filter((s) => s.id !== id) : prev));

  const doneSlots = slots.filter((s) => s.status === "done" && s.result);
  const maxScore = doneSlots.length ? Math.max(...doneSlots.map((s) => s.result!.riskScore)) : null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          Rainfall scenario
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
        {slots.length < MAX_LOCATIONS && (
          <button
            onClick={addSlot}
            className="border border-border px-3 py-1 text-xs text-ink transition-colors hover:border-ink-muted"
          >
            + Add location
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {slots.map((slot) => (
          <div key={slot.id} className="border border-border bg-surface p-4">
            <div className="flex gap-2">
              <input
                value={slot.query}
                onChange={(e) => updateSlot(slot.id, { query: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && search(slot.id, slot.query)}
                placeholder="Address or place in NY State"
                className="min-w-0 flex-1 border border-border bg-bg px-2 py-1.5 text-sm text-ink placeholder:text-ink-muted"
              />
              <button
                onClick={() => search(slot.id, slot.query)}
                disabled={slot.status === "searching" || slot.status === "loading"}
                className="shrink-0 border border-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-muted disabled:opacity-50"
              >
                {slot.status === "searching" || slot.status === "loading" ? "..." : "Search"}
              </button>
              {slots.length > 2 && (
                <button
                  onClick={() => removeSlot(slot.id)}
                  aria-label="Remove location"
                  className="shrink-0 border border-border px-2 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
                >
                  ×
                </button>
              )}
            </div>

            {slot.status === "picking" && (
              <ul className="mt-2 divide-y divide-border border border-border text-xs">
                {slot.candidates.map((c) => (
                  <li key={`${c.lat},${c.lon}`}>
                    <button
                      onClick={() => pick(slot.id, c)}
                      className="block w-full px-2 py-1.5 text-left text-ink-muted hover:bg-surface-2 hover:text-ink"
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {slot.status === "error" && <p className="mt-2 text-xs text-danger">{slot.errorMessage}</p>}

            {slot.status === "done" && slot.result && slot.picked && (
              <div className="mt-3">
                <p className="truncate text-xs text-ink-muted" title={slot.picked.label}>
                  {slot.picked.label}
                </p>
                <div className="mt-2 flex items-baseline gap-3">
                  <span
                    className="font-mono text-3xl tabular"
                    style={{ color: riskColor(slot.result.riskScore) }}
                  >
                    {slot.result.riskScore}
                  </span>
                  <span className="text-sm capitalize text-ink-muted">
                    {slot.result.riskCategory.replace("_", " ")}
                  </span>
                  {maxScore !== null && slot.result.riskScore === maxScore && doneSlots.length > 1 && (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-danger">
                      highest
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">
                  Confidence {slot.result.confidenceScore}% · {slot.result.dataCompleteness.present.length}/
                  {slot.result.dataCompleteness.present.length + slot.result.dataCompleteness.missing.length} factors present
                </p>
                <ul className="mt-2 space-y-0.5 text-[11px] text-ink-muted">
                  {slot.result.topContributors.slice(0, 3).map((c) => (
                    <li key={c.factor} className="flex justify-between">
                      <span>{c.label}</span>
                      <span className="font-mono tabular text-ink">
                        {c.contribution > 0 ? "+" : ""}
                        {c.contribution.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {doneSlots.length >= 2 && (
        <div className="mt-8 overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-ink-muted">
                <th className="px-3 py-2 font-normal">Location</th>
                <th className="px-3 py-2 font-normal">Score</th>
                <th className="px-3 py-2 font-normal">Category</th>
                <th className="px-3 py-2 font-normal">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {[...doneSlots]
                .sort((a, b) => b.result!.riskScore - a.result!.riskScore)
                .map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="max-w-[220px] truncate px-3 py-2 text-ink-muted" title={s.picked?.label}>
                      {s.picked?.label}
                    </td>
                    <td className="px-3 py-2 font-mono tabular" style={{ color: riskColor(s.result!.riskScore) }}>
                      {s.result!.riskScore}
                    </td>
                    <td className="px-3 py-2 capitalize text-ink-muted">{s.result!.riskCategory.replace("_", " ")}</td>
                    <td className="px-3 py-2 font-mono tabular text-ink-muted">{s.result!.confidenceScore}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-[11px] text-ink-muted">
        Scores are FloodAI&apos;s deterministic baseline relative risk index (not a probability), computed live from
        real public environmental data. Geocoding via OpenStreetMap Nominatim.
      </p>
    </div>
  );
}
