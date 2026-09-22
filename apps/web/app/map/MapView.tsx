"use client";

import { RAINFALL_SCENARIOS, type FacilityExposure, type RiskFeatures, type RiskResult, type RoadSegmentExposure } from "@flood-ai/shared";
import { aggregateExposure, estimatedAccessDisruptionScore } from "@flood-ai/risk-runtime";
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
const DATA_VERSION = "feature-grid-v2-100m-mamaroneck-pilot";
const GRID_SOURCE_ID = "risk-grid";
const GRID_FILL_LAYER_ID = "risk-grid-fill";
const GRID_LINE_LAYER_ID = "risk-grid-outline";
const ROADS_SOURCE_ID = "road-segments";
const ROADS_LAYER_ID = "road-segments-line";
const FACILITIES_SOURCE_ID = "facilities";
const FACILITIES_LAYER_ID = "facilities-circle";
const INTERSECTIONS_SOURCE_ID = "intersections";
const INTERSECTIONS_LAYER_ID = "intersections-circle";

type FeatureGridGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, RiskFeatures>;
type RoadRawProps = { segmentId: string; highwayClass: string; isMajor: boolean; name: string | null; lengthM: number; nearCellIds: string[] };
type FacilityRawProps = { facilityId: string; facilityType: string; name: string; nearCellIds: string[] };
type RoadsGeoJSON = GeoJSON.FeatureCollection<GeoJSON.LineString, RoadRawProps>;
type FacilitiesGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point, FacilityRawProps>;

type SelectedExposure =
  | { kind: "road"; name: string; exposure: RoadSegmentExposure }
  | { kind: "facility"; name: string; exposure: FacilityExposure };

export default function MapView() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const resultsRef = useRef<Map<string, RiskResult>>(new Map());

  const [rawGrid, setRawGrid] = useState<FeatureGridGeoJSON | null>(null);
  const [rawRoads, setRawRoads] = useState<RoadsGeoJSON | null>(null);
  const [rawFacilities, setRawFacilities] = useState<FacilitiesGeoJSON | null>(null);
  const [rainfallScenarioId, setRainfallScenarioId] = useState(RAINFALL_SCENARIOS[0].id);
  const [results, setResults] = useState<Map<string, RiskResult>>(new Map());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedCell, setSelectedCell] = useState<RiskResult | null>(null);
  const [selectedExposure, setSelectedExposure] = useState<SelectedExposure | null>(null);
  const [hoveredScore, setHoveredScore] = useState<number | null>(null);
  const [showRoads, setShowRoads] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);
  const [showIntersections, setShowIntersections] = useState(false);

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

  // Fetch the real feature grid + road/facility exposure joins once.
  useEffect(() => {
    fetch("/api/features")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("features unavailable"))))
      .then((fc: FeatureGridGeoJSON) => setRawGrid(fc))
      .catch(() => setLoadState("error"));
    fetch("/api/exposure-layers?layer=roads")
      .then((r) => (r.ok ? r.json() : null))
      .then((fc: RoadsGeoJSON | null) => fc && setRawRoads(fc));
    fetch("/api/exposure-layers?layer=facilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((fc: FacilitiesGeoJSON | null) => fc && setRawFacilities(fc));
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
      map.addSource(GRID_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: GRID_FILL_LAYER_ID,
        type: "fill",
        source: GRID_SOURCE_ID,
        paint: {
          "fill-color": ["get", "fillColor"],
          "fill-opacity": ["case", ["==", ["get", "coverageTier"], "unsupported"], 0.12, 0.65],
        },
      });
      map.addLayer({
        id: GRID_LINE_LAYER_ID,
        type: "line",
        source: GRID_SOURCE_ID,
        paint: { "line-color": "#1e293b", "line-width": 0.3, "line-opacity": 0.4 },
      });

      map.addSource(ROADS_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: ROADS_LAYER_ID,
        type: "line",
        source: ROADS_SOURCE_ID,
        layout: { visibility: "visible" },
        paint: {
          "line-color": ["get", "exposureColor"],
          "line-width": ["case", ["get", "isMajor"], 3, 1.5],
          "line-opacity": 0.85,
        },
      });

      map.addSource(FACILITIES_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: FACILITIES_LAYER_ID,
        type: "circle",
        source: FACILITIES_SOURCE_ID,
        layout: { visibility: "visible" },
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "exposureColor"],
          "circle-stroke-color": "#1e293b",
          "circle-stroke-width": 1.5,
        },
      });

      map.addSource(INTERSECTIONS_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: INTERSECTIONS_LAYER_ID,
        type: "circle",
        source: INTERSECTIONS_SOURCE_ID,
        layout: { visibility: "none" },
        paint: { "circle-radius": 2.5, "circle-color": "#64748b" },
      });

      map.on("mousemove", GRID_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (f) {
          setHoveredScore((f.properties?.riskScore as number | undefined) ?? null);
          map.getCanvas().style.cursor = "pointer";
        }
      });
      map.on("mouseleave", GRID_FILL_LAYER_ID, () => {
        setHoveredScore(null);
        map.getCanvas().style.cursor = "";
      });
      map.on("click", GRID_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const cellId = f.properties?.cellId as string;
        setSelectedExposure(null);
        setSelectedCell(resultsRef.current.get(cellId) ?? null);
      });

      map.on("click", ROADS_LAYER_ID, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        setSelectedCell(null);
        setSelectedExposure({
          kind: "road",
          name: (f.properties.name as string) || (f.properties.highwayClass as string) || "Road segment",
          exposure: JSON.parse(f.properties.exposureJson as string) as RoadSegmentExposure,
        });
      });
      map.on("click", FACILITIES_LAYER_ID, (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        setSelectedCell(null);
        setSelectedExposure({
          kind: "facility",
          name: f.properties.name as string,
          exposure: JSON.parse(f.properties.exposureJson as string) as FacilityExposure,
        });
      });
      for (const layerId of [ROADS_LAYER_ID, FACILITIES_LAYER_ID]) {
        map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push computed cell results into the risk-grid source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rawGrid || results.size === 0) return;
    const apply = () => {
      const source = map.getSource(GRID_SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: rawGrid.features.map((f) => {
          const r = results.get(f.properties.cellId);
          const fillColor = r && r.coverageTier !== "unsupported" ? riskColor(r.riskScore) : UNSUPPORTED_COLOR;
          return {
            type: "Feature",
            geometry: f.geometry,
            properties: { cellId: f.properties.cellId, coverageTier: r?.coverageTier ?? "unsupported", riskScore: r?.riskScore ?? null, fillColor },
          };
        }),
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [results, rawGrid]);

  // Push computed road exposure into the roads source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rawRoads || results.size === 0) return;
    const apply = () => {
      const source = map.getSource(ROADS_SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: rawRoads.features.map((f) => {
          const stats = aggregateExposure(f.properties.nearCellIds, results);
          const disruption = estimatedAccessDisruptionScore(stats);
          const exposure: RoadSegmentExposure = {
            ...stats,
            segmentId: f.properties.segmentId,
            highwayClass: f.properties.highwayClass,
            isMajor: f.properties.isMajor,
            name: f.properties.name,
            lengthM: f.properties.lengthM,
            estimatedAccessDisruptionScore: disruption,
          };
          return {
            type: "Feature",
            geometry: f.geometry,
            properties: {
              name: f.properties.name,
              highwayClass: f.properties.highwayClass,
              isMajor: f.properties.isMajor,
              exposureColor: stats.sampledCellCount > 0 ? riskColor(disruption) : UNSUPPORTED_COLOR,
              exposureJson: JSON.stringify(exposure),
            },
          };
        }),
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [results, rawRoads]);

  // Push computed facility exposure into the facilities source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rawFacilities || results.size === 0) return;
    const apply = () => {
      const source = map.getSource(FACILITIES_SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: rawFacilities.features.map((f) => {
          const stats = aggregateExposure(f.properties.nearCellIds, results);
          const disruption = estimatedAccessDisruptionScore(stats);
          const exposure: FacilityExposure = {
            ...stats,
            facilityId: f.properties.facilityId,
            facilityType: f.properties.facilityType,
            name: f.properties.name,
            estimatedAccessDisruptionScore: disruption,
          };
          return {
            type: "Feature",
            geometry: f.geometry,
            properties: {
              name: f.properties.name,
              facilityType: f.properties.facilityType,
              exposureColor: stats.sampledCellCount > 0 ? riskColor(disruption) : UNSUPPORTED_COLOR,
              exposureJson: JSON.stringify(exposure),
            },
          };
        }),
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [results, rawFacilities]);

  // Fetch + show intersections lazily only once the toggle is switched on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setVis = () => map.setLayoutProperty(INTERSECTIONS_LAYER_ID, "visibility", showIntersections ? "visible" : "none");
    if (map.isStyleLoaded()) setVis();
    else map.once("load", setVis);

    if (showIntersections && map.getSource(INTERSECTIONS_SOURCE_ID)) {
      const source = map.getSource(INTERSECTIONS_SOURCE_ID) as GeoJSONSource;
      fetch("/api/exposure-layers?layer=intersections")
        .then((r) => (r.ok ? r.json() : null))
        .then((fc) => fc && source.setData(fc));
    }
  }, [showIntersections]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setVis = () => map.setLayoutProperty(ROADS_LAYER_ID, "visibility", showRoads ? "visible" : "none");
    if (map.isStyleLoaded()) setVis();
    else map.once("load", setVis);
  }, [showRoads]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setVis = () => map.setLayoutProperty(FACILITIES_LAYER_ID, "visibility", showFacilities ? "visible" : "none");
    if (map.isStyleLoaded()) setVis();
    else map.once("load", setVis);
  }, [showFacilities]);

  return (
    <div className="relative h-full w-full bg-bg">
      <div ref={mapContainerRef} className="h-full w-full" aria-label="FloodAI pilot risk map" />

      <div className="absolute left-3 top-3 z-10 w-64 rounded border border-border bg-surface/95 text-ink">
        <div className="border-b border-border px-3 py-2">
          <label htmlFor="rainfall-select" className="block font-mono text-[10px] uppercase tracking-wide text-ink-muted">
            Rainfall scenario
          </label>
          <select
            id="rainfall-select"
            className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
            value={rainfallScenarioId}
            onChange={(e) => setRainfallScenarioId(e.target.value)}
          >
            {RAINFALL_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-b border-border px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">Layers</p>
          <div className="mt-1.5 flex flex-col gap-1 text-xs text-ink">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showRoads} onChange={(e) => setShowRoads(e.target.checked)} />
              Roads — access disruption
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showFacilities} onChange={(e) => setShowFacilities(e.target.checked)} />
              Public facilities
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showIntersections} onChange={(e) => setShowIntersections(e.target.checked)} />
              Intersections (candidate)
            </label>
          </div>
        </div>

        <div className="px-3 py-2 font-mono text-xs">
          {hoveredScore !== null ? (
            <p className="tabular text-ink">
              <span className="text-ink-muted">hover&nbsp;</span>
              {String(hoveredScore).padStart(3, "0")}<span className="text-ink-muted">/100</span>
            </p>
          ) : (
            <p className="text-ink-muted">hover a cell for a score</p>
          )}
          {loadState === "error" && (
            <p className="mt-1 text-danger">feature grid unavailable — run the data pipeline first</p>
          )}
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-10 rounded border border-border bg-surface/95 p-3">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">Susceptibility index</p>
        <div className="mt-2 flex h-2.5 w-56 overflow-hidden rounded-sm">
          {RISK_RAMP_LEGEND.map(([, color]) => (
            <div key={color} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] tabular text-ink-muted">
          <span>000</span>
          <span>025</span>
          <span>050</span>
          <span>075</span>
          <span>100</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-muted">
          <span className="inline-block h-2 w-2" style={{ backgroundColor: UNSUPPORTED_COLOR }} />
          unsupported / no coverage
        </div>
      </div>

      {selectedCell && selectedFeature && (
        <aside className="absolute right-3 top-3 z-10 w-80 max-w-[90vw] rounded border border-border bg-surface text-sm text-ink shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">Cell detail</span>
            <button className="text-ink-muted hover:text-ink" onClick={() => setSelectedCell(null)} aria-label="Close cell details">
              ✕
            </button>
          </div>

          <div className="border-b border-border px-3 py-3">
            <p className="font-mono text-3xl tabular text-ink">
              {String(selectedCell.riskScore).padStart(3, "0")}
              <span className="text-base text-ink-muted">/100</span>
            </p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-ink-muted">
              {selectedCell.riskCategory.replace("_", " ")} · relative risk index
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-border px-3 py-2 font-mono text-xs">
            <span className="text-ink-muted">coverage</span>
            <span className="text-right tabular text-ink">{selectedCell.coverageTier}</span>
            <span className="text-ink-muted">confidence</span>
            <span className="text-right tabular text-ink">{selectedCell.confidenceScore}/100</span>
          </div>

          <div className="border-b border-border px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">Contributing factors</p>
            <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-xs">
              {selectedCell.topContributors.map((c) => (
                <div key={c.factor} className="contents">
                  <span className="text-ink">{c.label}</span>
                  <span className="tabular text-right font-mono text-accent">+{c.contribution}</span>
                </div>
              ))}
            </div>
          </div>

          {selectedCell.dataCompleteness.missing.length > 0 && (
            <div className="border-b border-border bg-warn-surface px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wide text-warn">[data gaps]</p>
              <ul className="mt-1 space-y-0.5 text-xs text-ink">
                {selectedCell.dataCompleteness.missing.map((m) => (
                  <li key={m}>no verified data: {m}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="px-3 py-2 font-mono text-[10px] text-ink-muted">
            model {selectedCell.modelVersion} · data {selectedCell.dataVersion}
          </p>
        </aside>
      )}

      {selectedExposure && (
        <aside className="absolute right-3 top-3 z-10 w-80 max-w-[90vw] rounded border border-border bg-surface text-sm text-ink shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">
              {selectedExposure.kind === "road" ? "Road segment" : "Public facility"}
            </span>
            <button className="text-ink-muted hover:text-ink" onClick={() => setSelectedExposure(null)} aria-label="Close exposure details">
              ✕
            </button>
          </div>

          <div className="border-b border-border px-3 py-3">
            <p className="text-sm text-ink">{selectedExposure.name}</p>
            <p className="mt-2 font-mono text-3xl tabular text-ink">
              {String(selectedExposure.exposure.estimatedAccessDisruptionScore).padStart(3, "0")}
              <span className="text-base text-ink-muted">/100</span>
            </p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-ink-muted">estimated access-disruption risk</p>
          </div>

          {selectedExposure.exposure.sampledCellCount === 0 ? (
            <p className="px-3 py-3 text-xs text-warn">
              No supported analysis cells nearby yet — exposure cannot be estimated for this feature.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-border px-3 py-2 font-mono text-xs">
                <span className="text-ink-muted">max nearby</span>
                <span className="text-right tabular text-ink">{selectedExposure.exposure.maxRiskScore}/100</span>
                <span className="text-ink-muted">p90</span>
                <span className="text-right tabular text-ink">{selectedExposure.exposure.p90RiskScore}/100</span>
                <span className="text-ink-muted">mean nearby</span>
                <span className="text-right tabular text-ink">{selectedExposure.exposure.meanRiskScore}/100</span>
                <span className="text-ink-muted">sampled cells</span>
                <span className="text-right tabular text-ink">{selectedExposure.exposure.sampledCellCount}</span>
              </div>
              <p className="px-3 py-2 text-[11px] text-ink-muted">
                This is an estimated access-disruption risk, not a claim that the {selectedExposure.kind} will be
                physically inaccessible.
              </p>
            </>
          )}
        </aside>
      )}

      <p className="absolute bottom-3 right-3 z-10 max-w-64 rounded border border-border bg-surface/90 p-2 text-[10px] text-ink-muted">
        Road and facility colors use the same scale as the cell heatmap; intersections are a coarse OSM-derived
        candidate list, shown ungraded pending a dedicated exposure model.
      </p>
    </div>
  );
}
