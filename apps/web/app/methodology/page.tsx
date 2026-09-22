import type { Metadata } from "next";
import { BASELINE_WEIGHTS, BASELINE_WEIGHTS_VERSION } from "@flood-ai/shared";

export const metadata: Metadata = {
  title: "FloodAI — Methodology",
  description: "Formulas, weights, data sources, and known limitations behind FloodAI's risk scores.",
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-ink">
      <p className="font-mono text-xs text-accent">METHODOLOGY</p>
      <h1 className="mt-1 text-2xl font-medium">How FloodAI computes a score</h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
        This page is filled in incrementally as each phase of the build lands — see{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">docs/METHODOLOGY.md</code> in the
        repository for the always-current version.
      </p>

      <section className="mt-10 rounded border border-border bg-surface p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Current model</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          FloodAI ships the deterministic susceptibility baseline (
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-accent">{BASELINE_WEIGHTS_VERSION}</code>
          ) for the Mamaroneck, NY pilot area. Every risk score is a{" "}
          <strong className="text-ink">relative risk index</strong>, not a calibrated probability, computed only
          from real public data (see <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs">data/metadata/sources.json</code>
          ). Two conceptually useful factors — flow accumulation and soil infiltration — are not yet computed for
          this pilot; every score&apos;s confidence is reduced to reflect that gap rather than hiding it.
        </p>
      </section>

      <section className="mt-6 rounded border border-border bg-surface p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Baseline weights</h2>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
          {Object.entries(BASELINE_WEIGHTS).map(([key, weight]) => (
            <div key={key} className="contents">
              <dt className="text-ink-muted">{key}</dt>
              <dd className="tabular text-right font-mono text-ink">{weight.toFixed(2)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 rounded border border-warn/40 bg-warn-surface p-5">
        <h2 className="font-mono text-xs text-warn">[SCOPE]</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          FloodAI is a planning, education, and prioritization prototype. It does not replace official flood maps,
          emergency alerts, engineering studies, or instructions from public authorities.
        </p>
      </section>
    </main>
  );
}
