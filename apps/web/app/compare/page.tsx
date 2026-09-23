import type { Metadata } from "next";
import CompareView from "./CompareView";

export const metadata: Metadata = {
  title: "FloodAI — Compare",
  description: "Compare real, computed flood-risk scores across multiple New York State locations side by side.",
};

export default function ComparePage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 text-ink">
      <p className="font-mono text-xs text-accent">COMPARE</p>
      <h1 className="mt-1 text-2xl font-medium">Compare locations</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Look up any address or place in New York State and see its real, computed baseline risk score side by
        side with others — same live environmental data and versioned scoring engine used on the map.
      </p>
      <CompareView />
    </main>
  );
}
