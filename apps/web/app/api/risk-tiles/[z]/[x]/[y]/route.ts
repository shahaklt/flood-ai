import { NextResponse } from "next/server";

const RISK_API_BASE_URL = process.env.RISK_API_BASE_URL || "http://localhost:8000";

export async function GET(_request: Request, context: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await context.params;
  try {
    // Real environmental data for a fixed tile doesn't change on human
    // timescales, so let Next.js's own fetch cache (and the browser) skip
    // re-hitting the risk service for a tile it has already seen.
    const upstream = await fetch(`${RISK_API_BASE_URL}/api/features/${z}/${x}/${y}`, {
      signal: AbortSignal.timeout(30_000),
      next: { revalidate: 86_400 },
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
