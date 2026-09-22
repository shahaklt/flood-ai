import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-8 px-6 py-24">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">FloodAI</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
            An explainable flood-risk map for planning, not panic.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            FloodAI generates an interactive, continuously updating flood-risk heatmap with
            explainable 0–100 risk scores for a piloted area of Westchester County, NY, then lets
            you test possible prevention interventions before recommending closer engineering
            review.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/map"
            className="rounded-full bg-cyan-500 px-6 py-3 text-center font-medium text-slate-950 transition hover:bg-cyan-400"
          >
            Explore the map
          </Link>
          <Link
            href="/methodology"
            className="rounded-full border border-slate-600 px-6 py-3 text-center font-medium text-slate-100 transition hover:border-slate-400"
          >
            How it works
          </Link>
        </div>

        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-cyan-400">1. Predict</p>
            <p className="mt-1 text-sm text-slate-300">
              A deterministic, versioned risk engine scores real environmental data on a 250 m
              grid — no fabricated numbers.
            </p>
          </li>
          <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-cyan-400">2. Inspect</p>
            <p className="mt-1 text-sm text-slate-300">
              Click any cell for the exact contributing factors, data sources, and confidence
              behind its score.
            </p>
          </li>
          <li className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-cyan-400">3. Plan</p>
            <p className="mt-1 text-sm text-slate-300">
              Test a proposed drain, barrier, or repair and see the modeled before/after
              difference.
            </p>
          </li>
        </ol>

        <p className="mt-6 max-w-2xl rounded-lg border border-amber-700/40 bg-amber-950/30 p-4 text-sm text-amber-200">
          FloodAI provides planning estimates based on available public data. It does not replace
          official flood maps, emergency alerts, engineering studies, or instructions from public
          authorities.
        </p>
      </main>
    </div>
  );
}
