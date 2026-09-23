"use client";

import { useEffect, useState } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  street_flooding: "Street flooding",
  basement_flooding: "Basement flooding",
  storm_drain_backup: "Storm drain backup",
  road_closure: "Road closure",
  other: "Other",
};

interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
}

interface CommunityReport {
  id: string;
  submittedAt: string;
  lat: number;
  lon: number;
  category: string;
  severity: number;
  description: string | null;
  placeLabel: string | null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ReportsView() {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);
  const [picked, setPicked] = useState<GeocodeResult | null>(null);
  const [category, setCategory] = useState("street_flooding");
  const [severity, setSeverity] = useState(3);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "searching" | "submitting" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reports, setReports] = useState<CommunityReport[]>([]);

  const loadReports = () => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((body) => setReports(body.reports ?? []))
      .catch(() => {});
  };

  useEffect(loadReports, []);

  const search = async () => {
    if (!query.trim()) return;
    setStatus("searching");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const body = await res.json();
      if (!res.ok || !body.results?.length) {
        setStatus("error");
        setErrorMessage(body.error ?? "No results found in New York State.");
        return;
      }
      setCandidates(body.results);
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMessage("Geocoding request failed.");
    }
  };

  const submit = async () => {
    if (!picked) return;
    setStatus("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: picked.lat,
          lon: picked.lon,
          placeLabel: picked.label,
          category,
          severity,
          description: description || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(body.error ?? "Submission failed.");
        return;
      }
      setStatus("done");
      setPicked(null);
      setQuery("");
      setCandidates([]);
      setDescription("");
      setSeverity(3);
      loadReports();
    } catch {
      setStatus("error");
      setErrorMessage("Submission failed.");
    }
  };

  return (
    <div className="mt-8 grid gap-8 sm:grid-cols-2">
      <div className="border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Submit an observation</h2>

        <label className="mt-4 block text-xs text-ink-muted">Location</label>
        <div className="mt-1 flex gap-2">
          <input
            value={picked ? picked.label : query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Address or place in NY State"
            className="min-w-0 flex-1 border border-border bg-bg px-2 py-1.5 text-sm text-ink placeholder:text-ink-muted"
          />
          <button
            onClick={search}
            disabled={status === "searching" || !!picked}
            className="shrink-0 border border-border px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink-muted disabled:opacity-50"
          >
            {status === "searching" ? "..." : "Find"}
          </button>
        </div>
        {candidates.length > 0 && !picked && (
          <ul className="mt-2 divide-y divide-border border border-border text-xs">
            {candidates.map((c) => (
              <li key={`${c.lat},${c.lon}`}>
                <button
                  onClick={() => {
                    setPicked(c);
                    setCandidates([]);
                  }}
                  className="block w-full px-2 py-1.5 text-left text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="mt-4 block text-xs text-ink-muted">What&apos;s happening</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full border border-border bg-bg px-2 py-1.5 text-sm text-ink"
        >
          {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-xs text-ink-muted">Severity: {severity} / 5</label>
        <input
          type="range"
          min={1}
          max={5}
          value={severity}
          onChange={(e) => setSeverity(Number(e.target.value))}
          className="mt-1 w-full"
        />

        <label className="mt-4 block text-xs text-ink-muted">Details (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="What did you see? No personal information needed."
          className="mt-1 w-full resize-none border border-border bg-bg px-2 py-1.5 text-sm text-ink placeholder:text-ink-muted"
        />

        <button
          onClick={submit}
          disabled={!picked || status === "submitting"}
          className="mt-4 w-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {status === "submitting" ? "Submitting..." : "Submit observation"}
        </button>
        {status === "done" && <p className="mt-2 text-xs text-accent">Thanks — this is now visible below.</p>}
        {status === "error" && errorMessage && <p className="mt-2 text-xs text-danger">{errorMessage}</p>}
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink">Recent observations ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            No community observations yet. Every entry here comes from an actual submission — nothing is
            pre-seeded.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="border border-border bg-surface p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                  <span className="font-mono text-[10px] text-ink-muted">{timeAgo(r.submittedAt)}</span>
                </div>
                {r.placeLabel && <p className="mt-1 truncate text-xs text-ink-muted">{r.placeLabel}</p>}
                <p className="mt-1 text-xs text-ink-muted">Severity {r.severity}/5</p>
                {r.description && <p className="mt-1 text-xs text-ink">{r.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
