import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import ModelView, { type EnsembleEval, type LightgbmEval } from "./ModelView";

export const metadata: Metadata = {
  title: "FloodAI — Model Internals",
  description: "The real, computed math behind FloodAI's experimental statistical model: calibration, thresholds, and hyperparameter search.",
};

async function loadJson<T>(filename: string): Promise<T | null> {
  try {
    const filePath = path.join(process.cwd(), "..", "..", "data", "models", filename);
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default async function ModelPage() {
  const [ensemble, lightgbm] = await Promise.all([
    loadJson<EnsembleEval>("statewide_ensemble_eval.json"),
    loadJson<LightgbmEval>("statewide_lightgbm_eval.json"),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16 text-ink">
      <p className="font-mono text-xs text-accent">MODEL INTERNALS</p>
      <h1 className="mt-1 text-2xl font-medium">The real math, not just the headline number</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Every chart below is rendered directly from{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">data/models/*.json</code> — the same
        files <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">docs/EVALUATION.md</code> cites.
        Nothing here is illustrative; drag the threshold slider and it recomputes from 60 real, precomputed
        operating points, not an approximation.
      </p>
      {ensemble && lightgbm ? (
        <ModelView ensemble={ensemble} lightgbm={lightgbm} />
      ) : (
        <p className="mt-8 text-sm text-danger">
          Model evaluation files not found. Run scripts/training/train_statewide_ensemble.py and
          scripts/training/train_statewide_lightgbm.py first.
        </p>
      )}
    </main>
  );
}
