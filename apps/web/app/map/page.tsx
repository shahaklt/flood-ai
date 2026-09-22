import type { Metadata } from "next";
import MapView from "./MapView";

export const metadata: Metadata = {
  title: "FloodAI — Map",
  description: "Interactive flood-risk exploration map for the FloodAI pilot area.",
};

export default function MapPage() {
  return (
    <main className="flex h-screen w-screen flex-col">
      <div className="flex-1">
        <MapView />
      </div>
      <p className="border-t border-border bg-surface px-3 py-1 text-center text-[11px] text-ink-muted">
        FloodAI provides planning estimates based on available public data. It does not replace
        official flood maps, emergency alerts, engineering studies, or instructions from public
        authorities.
      </p>
    </main>
  );
}
