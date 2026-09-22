import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-bg text-ink">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-24">
        <div>
          <p className="font-mono text-xs tracking-wide text-accent">FLOODAI — MAMARONECK, NY PILOT</p>
          <h1 className="mt-3 text-3xl font-medium leading-tight text-ink sm:text-4xl">
            An explainable flood-risk instrument, not a forecast.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">
            FloodAI computes a 0-100 flood-risk index for every 100 m cell in a real pilot area,
            entirely from real public environmental data — elevation, land cover, FEMA flood
            zones, road and facility geometry. Every score traces back to the exact factors that
            produced it. Then you can test a proposed drain, barrier, or repair and see the
            modeled difference.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/map"
            className="rounded bg-accent px-5 py-2.5 text-center text-sm font-medium text-accent-ink transition-colors hover:brightness-110"
          >
            Open the map
          </Link>
          <Link
            href="/methodology"
            className="rounded border border-border px-5 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-ink-muted"
          >
            Methodology & data sources
          </Link>
          <Link
            href="/impact"
            className="rounded border border-border px-5 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-ink-muted"
          >
            Why this matters
          </Link>
        </div>

        <div className="grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3">
          <div className="bg-surface p-5">
            <p className="font-mono text-xs text-accent">01 PREDICT</p>
            <p className="mt-2 text-sm text-ink-muted">
              A versioned, deterministic risk engine scores real environmental features on a
              100 m grid. No fabricated numbers, no synthetic fallback data.
            </p>
          </div>
          <div className="bg-surface p-5">
            <p className="font-mono text-xs text-accent">02 INSPECT</p>
            <p className="mt-2 text-sm text-ink-muted">
              Click any cell, road, or facility for its exact contributing factors, data sources,
              coverage tier, and confidence.
            </p>
          </div>
          <div className="bg-surface p-5">
            <p className="font-mono text-xs text-accent">03 PLAN</p>
            <p className="mt-2 text-sm text-ink-muted">
              Model a proposed drain, barrier, or repair and compare before/after risk, including
              displaced or increased exposure.
            </p>
          </div>
        </div>

        <div className="rounded border border-warn/40 bg-warn-surface p-4 text-sm text-ink">
          <span className="mr-1.5 font-mono text-xs text-warn">[PLANNING TOOL]</span>
          FloodAI provides planning estimates based on available public data. It does not replace
          official flood maps, emergency alerts, engineering studies, or instructions from public
          authorities.
        </div>
      </main>
    </div>
  );
}
