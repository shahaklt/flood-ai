import type { Metadata } from "next";
import SimulateView from "./SimulateView";

export const metadata: Metadata = {
  title: "FloodAI — Simulate",
  description: "Model a proposed flood-mitigation intervention and see the estimated before/after difference.",
};

export default function SimulatePage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <SimulateView />
      </div>
      <p className="border-t border-border bg-surface px-3 py-1 text-center text-[11px] text-ink-muted">
        Modeled scenarios are simplified planning estimates, not engineering guarantees. Jev&apos;s assessment is a
        separate, confidence-gated opinion and never overwrites the underlying risk model.
      </p>
    </main>
  );
}
