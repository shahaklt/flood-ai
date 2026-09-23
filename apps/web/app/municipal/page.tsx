import type { Metadata } from "next";
import MunicipalView from "./MunicipalView";

export const metadata: Metadata = {
  title: "FloodAI — Municipal Dashboard",
  description: "Aggregate, real, computed flood-risk statistics for a New York State town or county.",
};

export default function MunicipalPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 text-ink">
      <p className="font-mono text-xs text-accent">MUNICIPAL</p>
      <h1 className="mt-1 text-2xl font-medium">Area risk summary</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Pick a town, city, or county in New York State to compute a real, aggregate risk profile across every
        analysis cell FloodAI can score there — for prioritizing where to look first, not a substitute for a
        site survey.
      </p>
      <MunicipalView />
    </main>
  );
}
