"use client";

import { BASELINE_WEIGHTS, type BaselineFactorKey } from "@flood-ai/shared";
import { useState } from "react";

const FACTOR_LABELS: Record<BaselineFactorKey, string> = {
  lowElevation: "Low relative elevation",
  lowSlope: "Flat terrain (low slope)",
  flowAccumulation: "Flow accumulation",
  topographicWetnessIndex: "Topographic wetness index",
  curvature: "Terrain curvature",
  waterProximity: "Water proximity",
  femaZone: "FEMA flood zone",
  impervious: "Impervious surface",
  soilInfiltration: "Soil infiltration (USDA)",
};

/** Interactive, real breakdown of the shipped baseline's own weights (from
 * packages/shared/src/baselineWeights.ts) -- hovering a bar highlights its
 * real share of the total score, sorted by real weight, not illustrative. */
export default function WeightsBreakdown() {
  const [hovered, setHovered] = useState<string | null>(null);
  const entries = (Object.entries(BASELINE_WEIGHTS) as [BaselineFactorKey, number][]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, w]) => w));

  return (
    <div>
      {entries.map(([key, weight]) => {
        const isHovered = hovered === key;
        return (
          <div
            key={key}
            className="group cursor-default py-1"
            onMouseEnter={() => setHovered(key)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="flex items-baseline justify-between text-xs">
              <span className={isHovered ? "text-ink" : "text-ink-muted"}>{FACTOR_LABELS[key]}</span>
              <span className={`font-mono tabular ${isHovered ? "text-accent" : "text-ink-muted"}`}>
                {(weight * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full bg-surface-2">
              <div
                className="h-1.5 bg-accent transition-all duration-300 ease-out group-hover:brightness-125"
                style={{ width: `${(weight / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
