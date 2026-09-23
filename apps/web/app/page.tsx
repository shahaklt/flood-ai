import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-bg text-ink">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-6 py-24">
        <div>
          <p className="font-mono text-xs tracking-wide text-accent">FLOODAI — NEW YORK STATE</p>
          <h1 className="mt-3 text-3xl font-medium leading-tight text-ink sm:text-4xl">
            An explainable flood-risk instrument, not a forecast.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">
            FloodAI computes a live 0-100 flood-risk index for any location in New York State,
            entirely from real public environmental data — elevation, terrain hydrology, land
            cover, FEMA flood zones, road and facility geometry. Every score traces back to the
            exact factors that produced it. Compare locations, summarize a whole town, test a
            proposed drain or barrier, or report what you&apos;re actually seeing on the ground.
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

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/compare" className="text-accent underline underline-offset-2 hover:brightness-110">
            Compare locations
          </Link>
          <Link href="/municipal" className="text-accent underline underline-offset-2 hover:brightness-110">
            Municipal dashboard
          </Link>
          <Link href="/reports" className="text-accent underline underline-offset-2 hover:brightness-110">
            Community reports
          </Link>
        </div>

        <div className="grid gap-px overflow-hidden rounded border border-border bg-border sm:grid-cols-3">
          <div className="bg-surface p-5">
            <p className="font-mono text-xs text-accent">01 PREDICT</p>
            <p className="mt-2 text-sm text-ink-muted">
              A versioned, deterministic risk engine scores real environmental features live,
              anywhere in New York State. No fabricated numbers, no synthetic fallback data.
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
