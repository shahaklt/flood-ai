import type { Metadata } from "next";
import ReportsView from "./ReportsView";

export const metadata: Metadata = {
  title: "FloodAI — Community Reports",
  description: "Submit and browse real, community-reported flood observations across New York State.",
};

export default function ReportsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 text-ink">
      <p className="font-mono text-xs text-accent">COMMUNITY REPORTS</p>
      <h1 className="mt-1 text-2xl font-medium">What people are actually seeing</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
        The model is built entirely from public environmental data — it has never seen a flood happen in real
        time. This page collects real, first-hand observations to fill that gap: street flooding, backed-up
        storm drains, closed roads. No account required; only what you choose to share is stored.
      </p>
      <ReportsView />
    </main>
  );
}
