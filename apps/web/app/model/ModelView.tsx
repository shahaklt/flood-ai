"use client";

import { useMemo, useState } from "react";
import CountUp from "../components/CountUp";
import RevealOnScroll from "../components/RevealOnScroll";
import ThresholdExplorer from "../components/ThresholdExplorer";

interface ModelResult {
  model: string;
  threshold: number;
  rocAuc: number;
  brierScore: number;
  rawAccuracy: number;
  balancedAccuracy: number;
}

export interface EnsembleEval {
  trainingRows: number;
  positiveRows: number;
  positiveRate: number;
  events: number;
  results: ModelResult[];
  calibrationCurve: { meanPredicted: number[]; fractionPositive: number[] };
  thresholdSweep: { threshold: number; balancedAccuracy: number; rawAccuracy: number }[];
  nestedOptimalThreshold: number;
  thresholdObjectiveComparison: {
    objective: string;
    meanThreshold: number;
    nestedBalancedAccuracy: number;
    nestedF1: number;
    nestedMcc: number;
  }[];
}

export interface LightgbmEval {
  gridSearchResults: {
    params: { n_estimators: number; num_leaves: number; learning_rate: number; max_depth: number };
    meanRocAuc: number;
    stdRocAuc: number;
    meanBalancedAccuracy: number;
    meanBrier: number;
  }[];
}

const MODEL_LABELS: Record<string, string> = {
  logistic_regression: "Logistic regression",
  gradient_boosted_trees_balanced: "GBM (balanced)",
  lightgbm_tuned: "LightGBM (tuned)",
  ensemble_average: "Ensemble average",
  "ensemble_isotonic_calibrated (threshold=0.5)": "Calibrated @ 0.5",
  "ensemble_isotonic_calibrated (nested optimal threshold)": "Calibrated @ nested-optimal",
};

function Bar({ label, value, max, format, color }: { label: string; value: number; max: number; format: (v: number) => string; color: string }) {
  const [hover, setHover] = useState(false);
  const pct = (value / max) * 100;
  return (
    <div
      className="group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className={`font-mono tabular ${hover ? "text-ink" : "text-ink-muted"}`}>{format(value)}</span>
      </div>
      <div className="mt-1 h-2 w-full bg-surface-2">
        <div
          className="h-2 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function CalibrationChart({ curve }: { curve: EnsembleEval["calibrationCurve"] }) {
  const size = 280;
  const points = curve.meanPredicted.map((mp, i) => ({ x: mp, y: curve.fractionPositive[i] }));
  const toPx = (v: number) => v * size;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px]">
      <line x1={0} y1={size} x2={size} y2={0} stroke="var(--border)" strokeDasharray="4 4" />
      <polyline
        points={points.map((p) => `${toPx(p.x)},${size - toPx(p.y)}`).join(" ")}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
      />
      {points.map((p, i) => (
        <circle key={i} cx={toPx(p.x)} cy={size - toPx(p.y)} r={3.5} fill="var(--color-accent)" />
      ))}
      <text x={4} y={size - 6} className="fill-current text-ink-muted" fontSize={9}>
        predicted →
      </text>
    </svg>
  );
}

export default function ModelView({ ensemble, lightgbm }: { ensemble: EnsembleEval; lightgbm: LightgbmEval }) {
  const [sortKey, setSortKey] = useState<"meanRocAuc" | "meanBalancedAccuracy" | "meanBrier">("meanRocAuc");
  const sortedGrid = useMemo(
    () => [...lightgbm.gridSearchResults].sort((a, b) => (sortKey === "meanBrier" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey])),
    [lightgbm, sortKey],
  );

  return (
    <div className="mt-10 space-y-14">
      <RevealOnScroll>
        <div className="grid grid-cols-3 gap-px overflow-hidden border border-border bg-border">
          <div className="bg-surface p-5">
            <p className="font-mono text-3xl tabular text-ink">
              <CountUp value={ensemble.trainingRows} />
            </p>
            <p className="mt-1 text-xs text-ink-muted">real training rows</p>
          </div>
          <div className="bg-surface p-5">
            <p className="font-mono text-3xl tabular text-ink">
              <CountUp value={ensemble.positiveRows} />
            </p>
            <p className="mt-1 text-xs text-ink-muted">real positive flood observations</p>
          </div>
          <div className="bg-surface p-5">
            <p className="font-mono text-3xl tabular text-ink">
              <CountUp value={ensemble.events} />
            </p>
            <p className="mt-1 text-xs text-ink-muted">real historical flood events</p>
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll delayMs={80}>
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Model comparison (ROC-AUC)</h2>
          <div className="mt-4 space-y-3">
            {ensemble.results.map((r) => (
              <Bar
                key={r.model}
                label={MODEL_LABELS[r.model] ?? r.model}
                value={r.rocAuc}
                max={1}
                format={(v) => v.toFixed(3)}
                color="var(--color-accent)"
              />
            ))}
          </div>
        </section>
      </RevealOnScroll>

      <RevealOnScroll delayMs={120}>
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Model comparison (balanced accuracy)</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Real accuracy at each model&apos;s own default 0.5 threshold — this is why the calibrated model looks
            worst here before its threshold is fixed below.
          </p>
          <div className="mt-4 space-y-3">
            {ensemble.results.map((r) => (
              <Bar
                key={r.model}
                label={MODEL_LABELS[r.model] ?? r.model}
                value={r.balancedAccuracy}
                max={1}
                format={(v) => `${(v * 100).toFixed(1)}%`}
                color="#f59e0b"
              />
            ))}
          </div>
        </section>
      </RevealOnScroll>

      <RevealOnScroll delayMs={160}>
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Threshold explorer</h2>
          <p className="mt-1 text-xs text-ink-muted">
            60 real, precomputed operating points from the calibrated ensemble&apos;s actual out-of-fold
            probabilities — drag to explore, nothing here is interpolated or estimated live.
          </p>
          <div className="mt-4 border border-border bg-surface p-4">
            <ThresholdExplorer sweep={ensemble.thresholdSweep} defaultThreshold={ensemble.nestedOptimalThreshold} />
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">
            Drag it to 0.5 (the dashed line) and watch balanced accuracy collapse to ~60% — the real trap a
            well-calibrated low-base-rate model falls into if you keep the textbook default cutoff. The slider
            starts at the honest, nested-cross-validated optimum (~0.05), not this curve&apos;s own best point —
            see below for why that distinction matters.
          </p>
        </section>
      </RevealOnScroll>

      <RevealOnScroll delayMs={180}>
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Fixing a real leak: picking the threshold honestly</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            An earlier version of this evaluation picked the threshold that maximized balanced accuracy on the
            same out-of-fold data that number was then reported on — real out-of-fold probabilities, but an
            optimistic selection, since the cutoff was tuned to the exact labels it was scored against (that
            version reported 74.7%; the honest number below is a little lower). Fixed with nested selection: each
            fold&apos;s threshold is chosen using only the <em>other</em> four folds, then applied to the held-out
            one — every prediction below still comes from a threshold that never saw its own label. Three
            plausible selection objectives were tested this way, not assumed:
          </p>
          <div className="mt-3 overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-ink-muted">
                  <th className="px-3 py-2 font-normal">Threshold chosen to maximize</th>
                  <th className="px-3 py-2 font-normal">Nested balanced acc</th>
                  <th className="px-3 py-2 font-normal">Nested F1</th>
                  <th className="px-3 py-2 font-normal">Nested MCC</th>
                </tr>
              </thead>
              <tbody>
                {ensemble.thresholdObjectiveComparison.map((r) => (
                  <tr key={r.objective} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-ink-muted">{r.objective.replace(/_/g, " ")}</td>
                    <td className={`px-3 py-2 font-mono tabular ${r.nestedBalancedAccuracy === Math.max(...ensemble.thresholdObjectiveComparison.map((x) => x.nestedBalancedAccuracy)) ? "text-accent" : "text-ink"}`}>
                      {(r.nestedBalancedAccuracy * 100).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 font-mono tabular text-ink-muted">{r.nestedF1.toFixed(3)}</td>
                    <td className="px-3 py-2 font-mono tabular text-ink-muted">{r.nestedMcc.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">
            Optimizing the threshold for F1 or MCC instead trades balanced accuracy for a better precision/recall
            balance on the minority (flood) class — a real, legitimate choice for a different deployment
            priority, not a worse result. Balanced accuracy is reported here because it is the metric this whole
            evaluation has used throughout; it is also, honestly, the self-consistent winner in this table.
          </p>
        </section>
      </RevealOnScroll>

      <RevealOnScroll delayMs={200}>
        <section className="grid gap-6 sm:grid-cols-[280px_1fr]">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Calibration curve</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Real reliability diagram: 10 quantile bins of the calibrated ensemble&apos;s out-of-fold
              predictions. Points on the dashed diagonal mean predicted probability matches real observed
              frequency.
            </p>
            <CalibrationChart curve={ensemble.calibrationCurve} />
          </div>
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-ink-muted">
                  <th className="px-3 py-2 font-normal">Predicted</th>
                  <th className="px-3 py-2 font-normal">Observed frequency</th>
                </tr>
              </thead>
              <tbody>
                {ensemble.calibrationCurve.meanPredicted.map((mp, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono tabular text-ink-muted">{mp.toFixed(3)}</td>
                    <td className="px-3 py-2 font-mono tabular text-ink">{ensemble.calibrationCurve.fractionPositive[i].toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </RevealOnScroll>

      <RevealOnScroll delayMs={240}>
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">LightGBM hyperparameter search</h2>
            <div className="flex gap-2 text-xs">
              {(["meanRocAuc", "meanBalancedAccuracy", "meanBrier"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSortKey(k)}
                  className={`border border-border px-2 py-1 ${sortKey === k ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"}`}
                >
                  {k === "meanRocAuc" ? "ROC-AUC" : k === "meanBalancedAccuracy" ? "Balanced acc" : "Brier"}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            All {lightgbm.gridSearchResults.length} real combinations tried, 5-fold grouped cross-validation
            each — sort by any real metric.
          </p>
          <div className="mt-4 overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-ink-muted">
                  <th className="px-3 py-2 font-normal">n_estimators</th>
                  <th className="px-3 py-2 font-normal">num_leaves</th>
                  <th className="px-3 py-2 font-normal">learning_rate</th>
                  <th className="px-3 py-2 font-normal">max_depth</th>
                  <th className="px-3 py-2 font-normal">ROC-AUC</th>
                  <th className="px-3 py-2 font-normal">Balanced acc</th>
                  <th className="px-3 py-2 font-normal">Brier</th>
                </tr>
              </thead>
              <tbody>
                {sortedGrid.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono tabular text-ink-muted">{r.params.n_estimators}</td>
                    <td className="px-3 py-2 font-mono tabular text-ink-muted">{r.params.num_leaves}</td>
                    <td className="px-3 py-2 font-mono tabular text-ink-muted">{r.params.learning_rate}</td>
                    <td className="px-3 py-2 font-mono tabular text-ink-muted">{r.params.max_depth}</td>
                    <td className="px-3 py-2 font-mono tabular text-ink">{r.meanRocAuc.toFixed(3)}</td>
                    <td className="px-3 py-2 font-mono tabular text-ink">{(r.meanBalancedAccuracy * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 font-mono tabular text-ink">{r.meanBrier.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </RevealOnScroll>

      <p className="text-[11px] text-ink-muted">
        This experimental model is evaluated but not shipped — the live map uses the deterministic baseline (see
        /methodology). Full machine-readable output: data/models/statewide_ensemble_eval.json and
        data/models/statewide_lightgbm_eval.json.
      </p>
    </div>
  );
}
