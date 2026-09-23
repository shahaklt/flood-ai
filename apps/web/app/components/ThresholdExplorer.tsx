"use client";

import { useState } from "react";

export interface ThresholdSweepPoint {
  threshold: number;
  balancedAccuracy: number;
  rawAccuracy: number;
}

/** Real, interactive threshold explorer shared by /model and /impact.
 * `sweep` is a real precomputed set of operating points (see
 * scripts/training/train_statewide_ensemble.py's threshold_sweep) --
 * dragging never estimates or interpolates a new number, it only jumps
 * between real precomputed ones. */
export default function ThresholdExplorer({
  sweep,
  defaultThreshold,
  compact = false,
}: {
  sweep: ThresholdSweepPoint[];
  defaultThreshold: number;
  compact?: boolean;
}) {
  const [index, setIndex] = useState(() => {
    // Defaults to the honest, nested-cross-validated optimal threshold, not
    // this sweep's own argmax -- picking the display default from the same
    // curve it's shown on would repeat the leakage the nested selection
    // exists to avoid.
    let closest = 0;
    for (let i = 1; i < sweep.length; i++) {
      if (Math.abs(sweep[i].threshold - defaultThreshold) < Math.abs(sweep[closest].threshold - defaultThreshold)) closest = i;
    }
    return closest;
  });
  const point = sweep[index];
  const width = 560;
  const height = compact ? 100 : 160;
  const maxBA = Math.max(...sweep.map((p) => p.balancedAccuracy));
  const path = sweep
    .map((p, i) => {
      const x = (i / (sweep.length - 1)) * width;
      const y = height - (p.balancedAccuracy / maxBA) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const markerX = (index / (sweep.length - 1)) * width;
  const markerY = height - (point.balancedAccuracy / maxBA) * height;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full text-accent" preserveAspectRatio="none">
        <line x1={0} y1={height - (0.5 / maxBA) * height} x2={width} y2={height - (0.5 / maxBA) * height} stroke="var(--border)" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
        <circle cx={markerX} cy={markerY} r={5} fill="currentColor" />
      </svg>
      <input
        type="range"
        min={0}
        max={sweep.length - 1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        className="mt-2 w-full"
        aria-label="Decision threshold"
      />
      <div className="mt-2 grid grid-cols-3 gap-3 font-mono text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-muted">Threshold</p>
          <p className="tabular text-ink">{point.threshold.toFixed(3)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-muted">Balanced accuracy</p>
          <p className="tabular text-accent">{(point.balancedAccuracy * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-ink-muted">Raw accuracy</p>
          <p className="tabular text-ink">{(point.rawAccuracy * 100).toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}
