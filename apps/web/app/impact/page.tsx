import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BASELINE_WEIGHTS_VERSION } from "@flood-ai/shared";
import CountUp from "../components/CountUp";
import RevealOnScroll from "../components/RevealOnScroll";
import ThresholdExplorer, { type ThresholdSweepPoint } from "../components/ThresholdExplorer";

export const metadata: Metadata = {
  title: "FloodAI — Impact",
  description: "Why flood risk needs a real, explainable tool: real damage, death, and displacement data, and how FloodAI's model actually performs.",
};

interface EnsembleEvalSummary {
  thresholdSweep: ThresholdSweepPoint[];
  nestedOptimalThreshold: number;
}

async function loadEnsembleEval(): Promise<EnsembleEvalSummary | null> {
  try {
    const filePath = path.join(process.cwd(), "..", "..", "data", "models", "statewide_ensemble_eval.json");
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as EnsembleEvalSummary;
  } catch {
    return null;
  }
}

function Stat({
  value,
  countTo,
  decimals = 0,
  prefix = "",
  suffix = "",
  label,
  source,
}: {
  value?: string;
  countTo?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  source: string;
}) {
  return (
    <div className="border border-border bg-surface p-4 transition-colors hover:bg-surface-2">
      <p className="font-mono text-2xl tabular text-ink sm:text-3xl">
        {countTo !== undefined ? <CountUp value={countTo} decimals={decimals} prefix={prefix} suffix={suffix} /> : value}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{label}</p>
      <p className="mt-2 text-[10px] text-ink-muted/70">{source}</p>
    </div>
  );
}

export default async function ImpactPage() {
  const ensembleEval = await loadEnsembleEval();

  return (
    <main className="bg-bg text-ink">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="font-mono text-xs tracking-wide text-accent">IMPACT</p>
        <h1 className="mt-2 text-3xl font-medium leading-tight sm:text-4xl">
          Flooding is the costliest and deadliest weather disaster in the US, every year.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">
          This page states, with sources, why a real explainable risk tool matters, then shows exactly how
          accurate FloodAI&apos;s own model is right now — including where it falls short — rather than asserting
          confidence it hasn&apos;t earned.
        </p>

        {/* National scale */}
        <RevealOnScroll>
          <section className="mt-12">
            <h2 className="font-mono text-xs uppercase tracking-wide text-ink-muted">National scale</h2>
            <div className="mt-3 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
              <Stat countTo={115} prefix="$" suffix="B" label="Total US billion-dollar weather/climate disaster damage, 2025" source="Climate Central (NOAA methodology), 2025" />
              <Stat countTo={23} label="Billion-dollar weather/climate disasters in the US, 2025 — third-highest year on record" source="Climate Central, 2025" />
              <Stat countTo={276} label="Fatalities from US billion-dollar weather/climate disasters, 2025" source="Climate Central, 2025" />
              <Stat countTo={46} prefix="$" suffix="B / yr" label="Average annual direct US flood damage, last decade" source="Congressional Budget Office, 2024" />
              <Stat value="$179.8–496.0B" label="Total annual US economic burden of flooding, including indirect costs" source="US Joint Economic Committee, 2024" />
              <Stat value="106–127" label="Average US flood deaths per year" source="NOAA / FEMA flood fatality analyses" />
            </div>
          </section>
        </RevealOnScroll>

        {/* Most recent hurricane */}
        <RevealOnScroll delayMs={60}>
          <section className="mt-12">
            <h2 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Most recent major hurricane</h2>
            <div className="mt-3 border border-border bg-surface p-5">
              <p className="text-lg text-ink">Hurricane Erin — August 2025</p>
              <p className="mt-1 text-sm text-ink-muted">
                A Category 5 Atlantic hurricane (160 mph peak winds) that tracked up the US East Coast, flooding
                North Carolina&apos;s Outer Banks — including a section of the main highway — before generating
                dangerous surf, rip currents, and coastal flooding from Florida to Maine.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-3">
                <div><span className="text-ink-muted">Category</span><br />5</div>
                <div><span className="text-ink-muted">Peak winds</span><br />160 mph</div>
                <div><span className="text-ink-muted">Deaths</span><br />13 (+5 missing)</div>
                <div><span className="text-ink-muted">Damage</span><br />$25M</div>
              </div>
              <p className="mt-3 text-[10px] text-ink-muted/70">National Hurricane Center; NOAA NESDIS; NPR/CNN storm coverage, 2025</p>
            </div>
          </section>
        </RevealOnScroll>

        {/* NY / pilot relevance */}
        <RevealOnScroll delayMs={80}>
          <section className="mt-12">
            <h2 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Why this pilot area — Mamaroneck, NY</h2>
            <div className="mt-3 border border-warn/40 bg-warn-surface p-5">
              <p className="text-lg text-ink">Hurricane Ida&apos;s remnants — September 1, 2021</p>
              <p className="mt-1 text-sm text-ink">
                Record-breaking rainfall (3.5 in/hr in some areas) overwhelmed New York City&apos;s sewer capacity
                (1.75 in/hr) in a single night, flooding streets, subways, cellars, and basements — much of it{" "}
                <strong>outside FEMA&apos;s mapped 100-year floodplain</strong>, in exactly the kind of pluvial
                flooding FloodAI is built to surface.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-4">
                <div><span className="text-ink-muted">NYC deaths</span><br />18</div>
                <div><span className="text-ink-muted">In flooded basements</span><br />11</div>
                <div><span className="text-ink-muted">Westchester deaths</span><br />3</div>
                <div><span className="text-ink-muted">Northeast total</span><br />56</div>
              </div>
              <p className="mt-3 text-[10px] text-ink-muted/70">
                NYC DOHMH Environment &amp; Health Data Portal; NY Federal Reserve / NYS Climate Impacts Assessment case study; contemporary Northeast news reporting, 2021
              </p>
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              In New York City alone, <span className="font-mono text-ink">168,565</span> properties (
              <span className="font-mono text-ink">19.7%</span> of all NYC properties) are estimated to be at flood
              risk over the next 30 years — a 1-in-100-year event today would affect an estimated 83,272 properties,
              rising to 96,637 in 30 years as risk increases.
            </p>
            <p className="mt-1 text-[10px] text-ink-muted/70">First Street Foundation flood risk model, firststreet.org</p>
          </section>
        </RevealOnScroll>

        {/* Screenshots */}
        <RevealOnScroll delayMs={100}>
          <section className="mt-12">
            <h2 className="font-mono text-xs uppercase tracking-wide text-ink-muted">The tool, running on real data</h2>
            <div className="mt-3 space-y-6">
              <figure className="border border-border bg-surface p-2 transition-transform hover:-translate-y-0.5">
                <Image src="/screenshots/map-heatmap.png" alt="FloodAI live risk heatmap over the Mamaroneck, NY pilot area" width={1600} height={1000} className="w-full" />
                <figcaption className="p-2 text-xs text-ink-muted">
                  Live risk heatmap — real live-fetched elevation/land-cover/water/FEMA data, computed in the
                  browser for any location in New York State.
                </figcaption>
              </figure>
              <figure className="border border-border bg-surface p-2 transition-transform hover:-translate-y-0.5">
                <Image src="/screenshots/map-cell-detail.png" alt="FloodAI cell detail panel showing contributing factors and confidence" width={1600} height={1000} className="w-full" />
                <figcaption className="p-2 text-xs text-ink-muted">
                  Click any cell for its exact contributing factors, confidence, and honestly-flagged data gaps —
                  never a black box.
                </figcaption>
              </figure>
              <figure className="border border-border bg-surface p-2 transition-transform hover:-translate-y-0.5">
                <Image src="/screenshots/simulate-jev.png" alt="FloodAI intervention simulator with real Jev AI assessment" width={1600} height={1000} className="w-full" />
                <figcaption className="p-2 text-xs text-ink-muted">
                  Intervention simulator: a proposed drain&apos;s modeled before/after effect, plus Jev&apos;s separate,
                  confidence-gated assessment — never blended with the underlying risk score.
                </figcaption>
              </figure>
            </div>
          </section>
        </RevealOnScroll>

        {/* Live interactive embed */}
        <RevealOnScroll delayMs={120}>
          <section className="mt-12">
            <h2 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Try it live</h2>
            <div className="mt-3 border border-border bg-surface">
              <iframe src="/map" title="FloodAI live map" className="h-[520px] w-full border-0" loading="lazy" />
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              This is the real, running application — not a screenshot. <Link href="/map" className="text-accent underline">Open it full-screen →</Link>
            </p>
          </section>
        </RevealOnScroll>

        {/* Model accuracy */}
        <RevealOnScroll delayMs={140}>
          <section className="mt-12">
            <h2 className="font-mono text-xs uppercase tracking-wide text-ink-muted">How accurate is the model, really</h2>

            <div className="mt-3 border border-border bg-surface p-5">
              <p className="text-sm font-medium text-ink">Shipped model: deterministic baseline ({BASELINE_WEIGHTS_VERSION})</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                This is not a statistical model, so it has no ROC-AUC/accuracy figure — it&apos;s a documented,
                versioned formula over nine real, live-fetched features (elevation, slope, flow accumulation,
                topographic wetness, curvature, water proximity, FEMA zone, impervious surface, and hydrologic
                soil group), unit-tested for correctness properties: scores always stay within 0-100, a worse
                input can never lower a score, and missing real data reduces confidence instead of silently
                becoming a fabricated zero-risk reading.
              </p>
            </div>

            <div className="mt-4 border border-border bg-surface p-5">
              <p className="text-sm font-medium text-ink">Experimental supervised model — NOT shipped, evaluated honestly</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                A logistic regression trained on 3,591 real event-cell rows (38 real positive flood observations)
                from 3 real historical events (a March 2010 nor&apos;easter, a late-March 2010 event, and Hurricane
                Irene 2011), sourced from the Global Flood Database&apos;s real satellite-observed inundation data.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-ink-muted">
                      <th className="py-1 pr-4 font-normal">Held-out event</th>
                      <th className="py-1 pr-4 font-normal">Test rows</th>
                      <th className="py-1 pr-4 font-normal">Positives</th>
                      <th className="py-1 pr-4 font-normal">ROC-AUC</th>
                      <th className="py-1 font-normal">Brier</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink">
                    <tr className="border-b border-border/50"><td className="py-1 pr-4">Mar 2010 nor&apos;easter</td><td className="py-1 pr-4">1,197</td><td className="py-1 pr-4">22</td><td className="py-1 pr-4">0.880</td><td className="py-1">0.066</td></tr>
                    <tr className="border-b border-border/50"><td className="py-1 pr-4">Late Mar 2010</td><td className="py-1 pr-4">1,197</td><td className="py-1 pr-4">10</td><td className="py-1 pr-4">0.958</td><td className="py-1">0.106</td></tr>
                    <tr><td className="py-1 pr-4">Hurricane Irene, 2011</td><td className="py-1 pr-4">1,197</td><td className="py-1 pr-4">6</td><td className="py-1 pr-4">0.948</td><td className="py-1">0.105</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                Read honestly: these numbers look strong, and the physical signal is real (flooded cells really do
                skew toward low elevation and water proximity). But with only 6-22 positive examples per held-out
                fold from just 3 events, each number carries real variance and this is <strong>not a validated
                model</strong> — which is exactly why it is not what generates the map&apos;s risk scores. Full
                numbers: <code className="rounded bg-surface-2 px-1 py-0.5">docs/EVALUATION.md</code>.
              </p>
            </div>

            <div className="mt-4 border border-border bg-surface p-5">
              <p className="text-sm font-medium text-ink">Scaled up: statewide real training data</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                The pipeline pulls real Global Flood Database events against the entire real New York State
                boundary — 24 real historical events across 87 tiles, 21,956 usable real event-cell rows, 1,056
                real positive flood observations, all 8 real factors including terrain curvature. Best real
                result: a real ensemble (logistic regression + gradient-boosted trees + LightGBM),
                isotonic-calibrated —{" "}
                <span className="font-mono text-ink">0.813 ROC-AUC</span> and{" "}
                <span className="font-mono text-ink">73.9% balanced accuracy</span>.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                The honest catch, caught and reported rather than hidden: at this dataset&apos;s ~4.8% positive
                rate, an <em>unweighted</em> model reports 95.8% raw accuracy — which sounds better, but is barely
                above the 95.3% you&apos;d get by always guessing &quot;no flood.&quot; Its balanced accuracy is
                only 58.3%, barely above a coin flip. Worse: even the well-calibrated ensemble&apos;s balanced
                accuracy collapses to ~60% at the default 0.5 cutoff, because real calibration correctly keeps
                most probabilities below 0.5 at this base rate — the fix isn&apos;t a better model, it&apos;s the
                right decision threshold. Try it yourself below; every point on this curve is a real, precomputed
                out-of-fold operating point, not an estimate.
              </p>
              {ensembleEval && (
                <div className="mt-4 border border-border bg-bg p-4">
                  <ThresholdExplorer sweep={ensembleEval.thresholdSweep} defaultThreshold={ensembleEval.nestedOptimalThreshold} compact />
                </div>
              )}
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                Two honest findings behind this number, both caught and fixed rather than hidden: (1) the
                threshold itself was originally picked by scanning the same out-of-fold data it was scored on —
                real leakage, fixed with nested cross-validated selection (each fold&apos;s threshold chosen only
                from the other four); (2) adding curvature and re-fetching the statewide dataset was tested
                directly against the prior 8-factor run and found to be a statistical wash (0.821→0.813 ROC-AUC,
                73.8%→73.9% balanced accuracy — noise, not a real gain), reported as current only because it uses
                the most complete real feature set. Full numbers and both fixes:{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5">docs/EVALUATION.md</code> and{" "}
                <Link href="/model" className="text-accent underline">/model</Link>. Still experimental — not what
                generates the map&apos;s scores.
              </p>
            </div>
          </section>
        </RevealOnScroll>

        <RevealOnScroll delayMs={160}>
          <div className="mt-12 border border-warn/40 bg-warn-surface p-4 text-sm text-ink">
            <span className="mr-1.5 font-mono text-xs text-warn">[PLANNING TOOL]</span>
            FloodAI provides planning estimates based on available public data. It does not replace official flood
            maps, emergency alerts, engineering studies, or instructions from public authorities.
          </div>
        </RevealOnScroll>
      </div>
    </main>
  );
}
