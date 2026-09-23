import { NextResponse } from "next/server";

const RISK_API_BASE_URL = process.env.RISK_API_BASE_URL || "http://localhost:8000";

// The Python risk service already keeps its own disk cache, keyed by a real
// DATA_VERSION that gets bumped whenever the feature schema changes (see
// services/risk/cache.py) -- that's the correct place for tile caching to
// live. Layering Next's OWN fetch/route cache on top duplicated it with a
// key that knows nothing about DATA_VERSION, so a schema change (adding
// hydrologicSoilGroup) kept serving pre-change responses indefinitely, a
// real bug caught by testing the new field end-to-end. `force-dynamic` plus
// no `next.revalidate` makes this route a thin passthrough; the upstream's
// own Cache-Control header (driven by the real DATA_VERSION) still lets
// browsers cache correctly.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await context.params;
  try {
    const upstream = await fetch(`${RISK_API_BASE_URL}/api/features/${z}/${x}/${y}`, {
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const body = await upstream.text();
    const cacheControl = upstream.headers.get("cache-control") ?? "public, max-age=3600";
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": cacheControl },
    });
  } catch {
    return NextResponse.json(
      { error: "Risk service unavailable. Is services/risk running (uvicorn services.risk.main:app --port 8000)?" },
      { status: 503 },
    );
  }
}
