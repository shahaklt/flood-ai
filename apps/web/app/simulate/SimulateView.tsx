"use client";

import {
  RAINFALL_SCENARIOS,
  type Intervention,
  type InterventionType,
  type JevResponse,
  type RiskFeatures,
} from "@flood-ai/shared";
import { computeScenarioDelta } from "@flood-ai/risk-runtime";
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { riskColor, UNSUPPORTED_COLOR } from "@/lib/colorRamp";
import { tileKey, tilesForBounds } from "@/lib/tileMath";
import type { RiskWorkerRequest, RiskWorkerResponse } from "../map/riskWorker";

setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const BASEMAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DATA_VERSION = "risk-tiles-v1-nystate";
const FEATURE_TILE_ZOOM = 13;
const GRID_SOURCE_ID = "sim-risk-grid";
const GRID_FILL_LAYER_ID = "sim-risk-grid-fill";
const POINT_SOURCE_ID = "sim-intervention-point";
const POINT_LAYER_ID = "sim-intervention-point-circle";

const INTERVENTION_TYPES: { value: InterventionType; label: string; defaultRadius: number; defaultStrength: number }[] = [
  { value: "proposed_drain", label: "Proposed drain / catch basin", defaultRadius: 80, defaultStrength: 0.6 },
  { value: "drain_repair", label: "Drain repair / capacity restoration", defaultRadius: 80, defaultStrength: 0.5 },
  { value: "flood_barrier", label: "Flood barrier / berm", defaultRadius: 60, defaultStrength: 0.8 },
  { value: "road_repair", label: "Road / intersection regrading", defaultRadius: 50, defaultStrength: 0.4 },
  { value: "permeable_surface", label: "Permeable surface conversion", defaultRadius: 40, defaultStrength: 0.5 },
];

type CellFeature = GeoJSON.Feature<GeoJSON.Polygon, RiskFeatures>;
interface RawTileCell extends RiskFeatures {
  geometry: GeoJSON.Polygon;
}
interface TileResponse {
  coverageTier: RiskFeatures["coverageTier"];
  features: (Omit<RiskFeatures, "distanceToRoadM"> & { geometry: GeoJSON.Polygon })[];
}
type ScenarioDelta = ReturnType<typeof computeScenarioDelta>;

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function areaScores(delta: ScenarioDelta): { before: number; after: number } {
  if (delta.cellDeltas.length === 0) return { before: 0, after: 0 };
  const before = delta.cellDeltas.reduce((s, d) => s + d.beforeRiskScore, 0) / delta.cellDeltas.length;
  const after = delta.cellDeltas.reduce((s, d) => s + d.afterRiskScore, 0) / delta.cellDeltas.length;
  return { before: Math.round(before), after: Math.round(after) };
}

export default function SimulateView() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const loadedTileKeysRef = useRef<Set<string>>(new Set());
  const cellsByIdRef = useRef<Map<string, CellFeature>>(new Map());
  const handleMapClickRef = useRef<(at: [number, number]) => void>(() => {});

  const [cellsById, setCellsById] = useState<Map<string, CellFeature>>(new Map());
  const [rainfallScenarioId, setRainfallScenarioId] = useState(RAINFALL_SCENARIOS[0].id);
  const [interventionType, setInterventionType] = useState<InterventionType>("proposed_drain");
  const [radius, setRadius] = useState(80);
  const [strength, setStrength] = useState(0.6);
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [delta, setDelta] = useState<ScenarioDelta | null>(null);
  const [jev, setJev] = useState<JevResponse | null>(null);
  const [jevLoading, setJevLoading] = useState(false);
  const [recommended, setRecommended] = useState<{ label: string; meanDelta: number } | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);

  useEffect(() => {
    cellsByIdRef.current = cellsById;
  }, [cellsById]);

  useEffect(() => {
    const worker = new Worker(new URL("../map/riskWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const fetchVisibleTiles = () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const bounds: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const tiles = tilesForBounds(bounds, FEATURE_TILE_ZOOM).filter((t) => !loadedTileKeysRef.current.has(tileKey(t)));
    for (const t of tiles.slice(0, 12)) {
      loadedTileKeysRef.current.add(tileKey(t));
      fetch(`/api/risk-tiles/${t.z}/${t.x}/${t.y}`)
        .then((r) => r.json())
        .then((tile: TileResponse) => {
          if (tile.coverageTier !== "validated" || !tile.features?.length) return;
          setCellsById((prev) => {
            const next = new Map(prev);
            for (const c of tile.features as unknown as RawTileCell[]) {
              const { geometry, ...props } = c;
              next.set(props.cellId, { type: "Feature", geometry, properties: { ...props, distanceToRoadM: null } });
            }
            return next;
          });
        })
        .catch(() => loadedTileKeysRef.current.delete(tileKey(t)));
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: BASEMAP_STYLE_URL,
      center: [-73.7319, 40.9508],
      zoom: 14,
    });
    mapRef.current = map;
    map.on("moveend", fetchVisibleTiles);
    map.on("load", () => {
      fetchVisibleTiles();
      map.addSource(GRID_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: GRID_FILL_LAYER_ID,
        type: "fill",
        source: GRID_SOURCE_ID,
        paint: { "fill-color": ["get", "fillColor"], "fill-opacity": 0.5 },
      });
      map.addSource(POINT_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: POINT_LAYER_ID,
        type: "circle",
        source: POINT_SOURCE_ID,
        paint: { "circle-radius": 8, "circle-color": "#22d3ee", "circle-stroke-color": "#0f172a", "circle-stroke-width": 2 },
      });
      map.on("click", (e: MapMouseEvent) => handleMapClickRef.current([e.lngLat.lng, e.lngLat.lat]));
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render baseline heatmap using rainfall-only (no intervention) risk, for orientation.
  useEffect(() => {
    const worker = workerRef.current;
    const map = mapRef.current;
    if (!worker || !map || cellsById.size === 0) return;
    const scenario = RAINFALL_SCENARIOS.find((s) => s.id === rainfallScenarioId) ?? RAINFALL_SCENARIOS[0];
    requestIdRef.current += 1;
    const myId = requestIdRef.current;
    const req: RiskWorkerRequest = {
      requestId: myId,
      features: Array.from(cellsById.values()).map((f) => f.properties),
      rainfallTotalInches: scenario.totalInches,
      rainfallScenarioId: scenario.id,
      dataVersion: DATA_VERSION,
    };
    const handler = (event: MessageEvent<RiskWorkerResponse>) => {
      if (event.data.requestId !== myId) return;
      const apply = () => {
        const source = map.getSource(GRID_SOURCE_ID) as GeoJSONSource | undefined;
        if (!source) return;
        source.setData({
          type: "FeatureCollection",
          features: event.data.results.map((r) => {
            const f = cellsById.get(r.cellId)!;
            return {
              type: "Feature",
              geometry: f.geometry,
              properties: { fillColor: r.coverageTier === "unsupported" ? UNSUPPORTED_COLOR : riskColor(r.riskScore) },
            };
          }),
        });
      };
      if (map.isStyleLoaded()) apply();
      else map.once("load", apply);
    };
    worker.addEventListener("message", handler);
    worker.postMessage(req);
    return () => worker.removeEventListener("message", handler);
  }, [cellsById, rainfallScenarioId]);

  // Update the intervention point marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(POINT_SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: point ? [{ type: "Feature", geometry: { type: "Point", coordinates: point }, properties: {} }] : [],
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [point]);

  const buildIntervention = (type: InterventionType, r: number, s: number, at: [number, number]): Intervention => ({
    id: `sim-${Date.now()}`,
    type,
    geometry: { type: "Point", coordinates: at },
    influenceRadiusM: r,
    effectStrength: s,
    label: INTERVENTION_TYPES.find((t) => t.value === type)!.label,
    assumptionSource: "User-entered planning assumption (FloodAI /simulate)",
  });

  const computeDeltaFor = (intervention: Intervention, at: [number, number]): ScenarioDelta => {
    const scenario = RAINFALL_SCENARIOS.find((s) => s.id === rainfallScenarioId) ?? RAINFALL_SCENARIOS[0];
    const cellsWithDistance = Array.from(cellsByIdRef.current.values())
      .filter((f) => f.properties.coverageTier === "validated")
      .map((f) => ({ features: f.properties, distanceM: haversineM(at, f.properties.centroid) }))
      .filter((c) => c.distanceM <= intervention.influenceRadiusM * 1.5);
    return computeScenarioDelta(intervention.id, intervention, cellsWithDistance, {
      rainfallTotalInches: scenario.totalInches,
      rainfallScenarioId: scenario.id,
      dataVersion: DATA_VERSION,
    });
  };

  /** Tries every real intervention type at its documented default radius/
   * strength for this exact location and picks whichever produces the best
   * (lowest) mean modeled score delta -- a real comparison across the same
   * bounded-transform engine, not a guess. */
  const suggestBestIntervention = (at: [number, number]) => {
    let best: { type: InterventionType; radius: number; strength: number; delta: ScenarioDelta } | null = null;
    for (const t of INTERVENTION_TYPES) {
      const intervention = buildIntervention(t.value, t.defaultRadius, t.defaultStrength, at);
      const d = computeDeltaFor(intervention, at);
      if (d.cellDeltas.length === 0) continue;
      if (!best || d.summary.meanScoreDelta < best.delta.summary.meanScoreDelta) {
        best = { type: t.value, radius: t.defaultRadius, strength: t.defaultStrength, delta: d };
      }
    }
    return best;
  };

  const runFullSimulation = (type: InterventionType, r: number, s: number, at: [number, number]) => {
    const intervention = buildIntervention(type, r, s, at);
    const result = computeDeltaFor(intervention, at);
    setDelta(result);
    setJev(null);
    setJevLoading(true);
    fetch("/api/jev/intervention-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intervention,
        rainfallScenarioId,
        cellDeltas: result.cellDeltas,
        topContributorLabels: Array.from(cellsByIdRef.current.values())
          .slice(0, 3)
          .flatMap((f) => [`elevation ${f.properties.elevationM}`]),
        dataGaps: result.dataGaps,
        location: { lat: at[1], lon: at[0] },
        coverageTier: "validated",
      }),
    })
      .then((r2) => r2.json())
      .then((j: JevResponse) => setJev(j))
      .catch(() => setJev({ status: "unavailable", reason: "Request failed." }))
      .finally(() => setJevLoading(false));
  };

  const handleMapClick = (at: [number, number]) => {
    setPoint(at);
    setDelta(null);
    setJev(null);
    if (cellsByIdRef.current.size === 0) return;
    setAutoRunning(true);
    const best = suggestBestIntervention(at);
    if (best) {
      setInterventionType(best.type);
      setRadius(best.radius);
      setStrength(best.strength);
      setRecommended({
        label: INTERVENTION_TYPES.find((t) => t.value === best.type)!.label,
        meanDelta: best.delta.summary.meanScoreDelta,
      });
      runFullSimulation(best.type, best.radius, best.strength, at);
    } else {
      setRecommended(null);
    }
    setAutoRunning(false);
  };
  useEffect(() => {
    handleMapClickRef.current = handleMapClick;
  });

  const runSimulation = () => {
    if (!point) return;
    setRecommended(null);
    runFullSimulation(interventionType, radius, strength, point);
  };

  const scores = delta ? areaScores(delta) : null;

  return (
    <div className="relative h-full w-full bg-bg">
      <div ref={mapContainerRef} className="h-full w-full" aria-label="FloodAI intervention simulator map" />

      <div className="absolute left-3 top-3 z-10 w-72 rounded border border-border bg-surface/95 p-3 text-xs text-ink">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">Intervention simulator</p>
        <p className="mt-1 text-ink-muted">
          Click the map — FloodAI tests every intervention type at that spot and recommends the best one.
        </p>

        <label className="mt-3 block text-ink-muted">Rainfall scenario</label>
        <select
          className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1 text-sm text-ink"
          value={rainfallScenarioId}
          onChange={(e) => setRainfallScenarioId(e.target.value)}
        >
          {RAINFALL_SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        {recommended && (
          <div className="mt-3 rounded border border-accent/40 bg-accent/10 px-2 py-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Recommended</p>
            <p className="mt-0.5 text-ink">{recommended.label}</p>
            <p className="text-[10px] text-ink-muted">mean modeled delta: {recommended.meanDelta}</p>
          </div>
        )}

        <label className="mt-3 block text-ink-muted">Intervention type</label>
        <select
          className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1 text-sm text-ink"
          value={interventionType}
          onChange={(e) => {
            const t = INTERVENTION_TYPES.find((x) => x.value === (e.target.value as InterventionType))!;
            setInterventionType(t.value);
            setRadius(t.defaultRadius);
            setStrength(t.defaultStrength);
            setRecommended(null);
          }}
        >
          {INTERVENTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <label className="mt-3 block text-ink-muted">Influence radius: {radius} m</label>
        <input type="range" min={20} max={200} value={radius} onChange={(e) => { setRadius(Number(e.target.value)); setRecommended(null); }} className="w-full" />

        <label className="mt-2 block text-ink-muted">Effect strength (planning assumption): {strength.toFixed(2)}</label>
        <input type="range" min={0.1} max={1} step={0.05} value={strength} onChange={(e) => { setStrength(Number(e.target.value)); setRecommended(null); }} className="w-full" />

        <button
          onClick={runSimulation}
          disabled={!point}
          className="mt-3 w-full rounded bg-accent py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40"
        >
          Run this configuration
        </button>
        {!point && <p className="mt-1 text-[10px] text-ink-muted">Click the map to place and auto-suggest an intervention.</p>}
        {autoRunning && <p className="mt-1 text-[10px] text-accent">Evaluating every intervention type...</p>}
      </div>

      {delta && scores && (
        <aside className="absolute right-3 top-3 z-10 w-80 max-w-[90vw] rounded border border-border bg-surface text-sm text-ink shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
          <div className="border-b border-border px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">Area risk after intervention</span>
          </div>
          <div className="flex items-center gap-4 border-b border-border px-3 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">Before</p>
              <p className="font-mono text-2xl tabular" style={{ color: riskColor(scores.before) }}>{String(scores.before).padStart(3, "0")}</p>
            </div>
            <span className="text-ink-muted">→</span>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">After</p>
              <p className="font-mono text-3xl tabular" style={{ color: riskColor(scores.after) }}>{String(scores.after).padStart(3, "0")}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">Change</p>
              <p className="font-mono text-lg tabular" style={{ color: scores.after < scores.before ? "#22c55e" : "var(--warn)" }}>
                {scores.after - scores.before}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-border px-3 py-2 font-mono text-xs">
            <span className="text-ink-muted">cells improved</span>
            <span className="text-right tabular" style={{ color: "#22c55e" }}>{delta.summary.cellsImproved}</span>
            <span className="text-ink-muted">cells worsened</span>
            <span className="text-right tabular" style={{ color: delta.summary.cellsWorsened > 0 ? "var(--warn)" : "var(--ink)" }}>
              {delta.summary.cellsWorsened}
            </span>
          </div>
          {delta.dataGaps.length > 0 && (
            <div className="border-b border-border bg-warn-surface px-3 py-2 text-xs text-ink">
              {delta.dataGaps.map((g) => <p key={g}>{g}</p>)}
            </div>
          )}
          <div className="px-3 py-2 text-[10px] text-ink-muted">
            {delta.assumptions.map((a) => <p key={a}>{a}</p>)}
          </div>

          <div className="border-t border-border px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-wide text-accent">AI intervention assessment</p>
            {jevLoading && <p className="mt-1 text-xs text-ink-muted">Asking Jev...</p>}
            {!jevLoading && jev?.status === "unavailable" && (
              <p className="mt-1 text-xs text-warn">Jev unavailable: {jev.reason}</p>
            )}
            {!jevLoading && jev?.status === "ok" && (
              <div className="mt-1 space-y-1 text-xs">
                <p>Fit: {jev.assessment.interventionFit.score.toFixed(1)}/4 (conf {Math.round(jev.assessment.interventionFit.confidence * 100)}%)</p>
                <p>Residual risk: {jev.assessment.residualRisk.score.toFixed(1)}/4</p>
                <p>Evidence: {jev.assessment.evidenceStrength.score.toFixed(1)}/4</p>
                <p>Review priority: {jev.assessment.priorityForEngineeringReview.score.toFixed(1)}/4</p>
                <p>Displacement concern: {Math.round(jev.assessment.riskDisplacementConcern.probability * 100)}%</p>
                <p>Needs human review: {Math.round(jev.assessment.needsHumanReview.probability * 100)}%</p>
                <p>Most relevant type: {jev.assessment.mostRelevantIntervention.choice}</p>
                <p className="text-ink-muted">Model: {jev.assessment.model}</p>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
