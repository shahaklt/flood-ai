"use client";

import { RAINFALL_SCENARIOS, type RiskFeatures, type RiskResult } from "@flood-ai/shared";
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { RISK_RAMP_LEGEND, UNSUPPORTED_COLOR, riskColor } from "@/lib/colorRamp";
import type { RiskWorkerRequest, RiskWorkerResponse } from "./riskWorker";

// Turbopack does not (yet) resolve maplibre-gl's own internal tile-decoding
// worker via its default `new Worker(new URL(...))` bundling, which leaves
// the map stuck with zero tile requests and a blank canvas. Point it at a
// copy of that worker bundle served as a static asset instead (kept in sync
// via the `postinstall` script in package.json).
setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const BASEMAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DATA_VERSION = "feature-grid-v1-mamaroneck-pilot";
const SOURCE_ID = "risk-grid";
const FILL_LAYER_ID = "risk-grid-fill";
const LINE_LAYER_ID = "risk-grid-outline";

type FeatureGridGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, RiskFeatures>;

export default function MapView() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const resultsRef = useRef<Map<string, RiskResult>>(new Map());

  const [rawGrid, setRawGrid] = useState<FeatureGridGeoJSON | null>(null);
  const [rainfallScenarioId, setRainfallScenarioId] = useState(RAINFALL_SCENARIOS[0].id);
  const [results, setResults] = useState<Map<string, RiskResult>>(new Map());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedCell, setSelectedCell] = useState<RiskResult | null>(null);
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);

  const selectedFeature: RiskFeatures | null =
    selectedCell && rawGrid
      ? (rawGrid.features.find((f) => f.properties.cellId === selectedCell.cellId)?.properties ?? null)
      : null;

  // Set up the inference Web Worker once.
  useEffect(() => {
    const worker = new Worker(new URL("./riskWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<RiskWorkerResponse>) => {
      if (event.data.requestId !== requestIdRef.current) return; // stale response, ignore
      const map = new Map<string, RiskResult>();
      for (const r of event.data.results) map.set(r.cellId, r);
      resultsRef.current = map;
      setResults(map);
      setLoadState("ready");
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Fetch the real feature grid once.
  useEffect(() => {
    fetch("/api/features")
      .then((r) => {
        if (!r.ok) throw new Error("features unavailable");
        return r.json();
      })
      .then((fc: FeatureGridGeoJSON) => setRawGrid(fc))
      .catch(() => setLoadState("error"));
  }, []);

  // Recompute risk whenever the grid, worker readiness, or rainfall scenario changes.
  useEffect(() => {
    const worker = workerRef.current;
    if (!rawGrid || !worker) return;
    const scenario = RAINFALL_SCENARIOS.find((s) => s.id === rainfallScenarioId) ?? RAINFALL_SCENARIOS[0];
    requestIdRef.current += 1;
    const req: RiskWorkerRequest = {
      requestId: requestIdRef.current,
      features: rawGrid.features.map((f) => f.properties),
      rainfallTotalInches: scenario.totalInches,
      rainfallScenarioId: scenario.id,
      dataVersion: DATA_VERSION,
    };
    worker.postMessage(req);
  }, [rawGrid, rainfallScenarioId]);

  // Initialize the map once.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: BASEMAP_STYLE_URL,
      center: [-73.7319, 40.9508],
      zoom: 13.5,
    });
    mapRef.current = map;
    map.on("error", (e) => console.error("MapLibre error event:", e.error));

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": ["get", "fillColor"],
          "fill-opacity": ["case", ["==", ["get", "coverageTier"], "unsupported"], 0.12, 0.65],
        },
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#1e293b", "line-width": 0.3, "line-opacity": 0.4 },
      });

      map.on("mousemove", FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (f) {
          setHoveredScore((f.properties?.riskScore as number | undefined) ?? null);
          map.getCanvas().style.cursor = "pointer";
        }
      });
      map.on("mouseleave", FILL_LAYER_ID, () => {
        setHoveredScore(null);
        map.getCanvas().style.cursor = "";
      });
      map.on("click", FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const cellId = f.properties?.cellId as string;
        const result = resultsRef.current.get(cellId) ?? null;
        setSelectedCell(result);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push computed results into the map source whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rawGrid || results.size === 0) return;

    const apply = () => {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      const enriched: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: rawGrid.features.map((f) => {
          const r = results.get(f.properties.cellId);
          const fillColor = r && r.coverageTier !== "unsupported" ? riskColor(r.riskScore) : UNSUPPORTED_COLOR;
          return {
            type: "Feature",
            geometry: f.geometry,
            properties: {
              cellId: f.properties.cellId,
              coverageTier: r?.coverageTier ?? "unsupported",
              riskScore: r?.riskScore ?? null,
              fillColor,
            },
          };
        }),
      };
      source.setData(enriched);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [results, rawGrid]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" aria-label="FloodAI pilot risk map" />

      <div className="absolute left-3 top-3 z-10 flex flex-col gap-2 rounded-lg bg-white/95 p-3 shadow-md dark:bg-slate-900/95">
        <label htmlFor="rainfall-select" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Rainfall planning scenario
        </label>
        <select
          id="rainfall-select"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:bg-slate-800 dark:text-slate-100"
          value={rainfallScenarioId}
          onChange={(e) => setRainfallScenarioId(e.target.value)}
        >
          {RAINFALL_SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {hoveredScore !== null && (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Provisional score: <strong>{hoveredScore}</strong> / 100
          </p>
        )}
        {loadState === "error" && (
          <p className="max-w-56 text-xs text-red-600">
            Feature grid unavailable. Run the data pipeline scripts first.
          </p>
        )}
      </div>

      <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-white/95 p-3 text-xs shadow-md dark:bg-slate-900/95">
        <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Estimated susceptibility (0-100)</p>
        <div className="flex h-3 w-48 overflow-hidden rounded">
          {RISK_RAMP_LEGEND.map(([, color]) => (
            <div key={color} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>0 minimal</span>
          <span>100 very high</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: UNSUPPORTED_COLOR }} />
          Unsupported / no coverage
        </div>
      </div>

      {selectedCell && selectedFeature && (
        <aside className="absolute right-3 top-3 z-10 w-80 max-w-[90vw] rounded-lg bg-white/98 p-4 text-sm shadow-lg dark:bg-slate-900/98">
          <button
            className="float-right text-slate-400 hover:text-slate-700"
            onClick={() => setSelectedCell(null)}
            aria-label="Close cell details"
          >
            ×
          </button>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            Estimated flood risk: {selectedCell.riskScore} / 100 —{" "}
            {selectedCell.riskCategory.replace("_", " ")}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Score meaning: relative risk index (deterministic baseline, not a calibrated probability)
          </p>
          <p className="text-xs text-slate-500">
            Coverage tier: {selectedCell.coverageTier} · Confidence: {selectedCell.confidenceScore}/100
          </p>
          <p className="mt-2 font-medium text-slate-700 dark:text-slate-200">Largest contributing factors:</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {selectedCell.topContributors.map((c) => (
              <li key={c.factor}>
                {c.label}: +{c.contribution}
              </li>
            ))}
          </ol>
          {selectedCell.dataCompleteness.missing.length > 0 && (
            <>
              <p className="mt-2 font-medium text-slate-700 dark:text-slate-200">Data limitations:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-500">
                {selectedCell.dataCompleteness.missing.map((m) => (
                  <li key={m}>No verified data available for: {m}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-[10px] text-slate-400">
            Model {selectedCell.modelVersion} · Data {selectedCell.dataVersion}
          </p>
        </aside>
      )}
    </div>
  );
}
