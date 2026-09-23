"use client";

import type { RiskCategory } from "@flood-ai/shared";
import { riskColor } from "@/lib/colorRamp";
import CountUp from "./components/CountUp";
import RevealOnScroll from "./components/RevealOnScroll";

export interface LiveScoreExample {
  label: string;
  score: number;
  category: RiskCategory;
}

/** Real live-computed scores for a few well-known NY places, fetched
 * server-side (see page.tsx) through the exact same risk-tiles API and
 * baseline engine the map uses -- not illustrative placeholders. */
export default function HomeLiveScores({ examples }: { examples: LiveScoreExample[] }) {
  if (examples.length === 0) return null;
  return (
    <RevealOnScroll>
      <div className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-4">
        {examples.map((ex) => (
          <div key={ex.label} className="group bg-surface p-4 transition-colors hover:bg-surface-2">
            <p className="truncate text-xs text-ink-muted" title={ex.label}>
              {ex.label}
            </p>
            <p className="mt-1 font-mono text-2xl tabular transition-transform group-hover:scale-105" style={{ color: riskColor(ex.score) }}>
              <CountUp value={ex.score} />
            </p>
            <p className="mt-0.5 text-[10px] capitalize text-ink-muted">{ex.category.replace("_", " ")}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        Real scores, computed live just now from real public data — refresh this page and watch them update.
      </p>
    </RevealOnScroll>
  );
}
