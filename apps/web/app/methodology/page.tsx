import type { Metadata } from "next";
import { BASELINE_WEIGHTS, BASELINE_WEIGHTS_VERSION } from "@flood-ai/shared";

export const metadata: Metadata = {
  title: "FloodAI — Methodology",
  description: "Formulas, weights, data sources, and known limitations behind FloodAI's risk scores.",
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-100">
      <h1 className="text-3xl font-semibold">Methodology</h1>
      <p className="mt-4 text-slate-300">
        This page is filled in incrementally as each phase of the build lands — see{" "}
        <code>docs/METHODOLOGY.md</code> in the repository for the always-current version.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Current model</h2>
      <p className="mt-2 text-slate-300">
        FloodAI currently ships the deterministic susceptibility baseline (
        <code>{BASELINE_WEIGHTS_VERSION}</code>) for the Mamaroneck, NY pilot area. Every risk
        score is a <strong>relative risk index</strong>, not a calibrated probability, and is
        computed only from real public data (see the Sources drawer / <code>data/metadata/sources.json</code>
        ). Two conceptually useful factors — flow accumulation and soil infiltration — are not yet
        computed for this pilot, and every score&apos;s confidence is reduced to reflect that gap
        rather than hiding it.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Baseline weights</h2>
      <ul className="mt-2 space-y-1 text-slate-300">
        {Object.entries(BASELINE_WEIGHTS).map(([key, weight]) => (
          <li key={key}>
            <code>{key}</code>: {weight}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-semibold">What this is not</h2>
      <p className="mt-2 text-slate-300">
        FloodAI is a planning, education, and prioritization prototype. It does not replace
        official flood maps, emergency alerts, engineering studies, or instructions from public
        authorities.
      </p>
    </main>
  );
}
