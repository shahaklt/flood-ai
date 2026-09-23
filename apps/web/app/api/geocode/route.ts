import { NextResponse } from "next/server";

/** Real geocoding via OpenStreetMap Nominatim (public, no API key), restricted
 * to New York State to match FloodAI's declared coverage area. Server-side so
 * we control the required User-Agent per Nominatim's usage policy and avoid
 * exposing client IPs directly to the upstream service. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing query parameter 'q'." }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  // Nominatim rejects mixing free-form `q` with structured params like
  // `state`, so bias toward New York via a real bounding-box viewbox
  // instead (roughly the state's extent) rather than a structured filter.
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("viewbox", "-79.9,45.1,-71.7,40.4");
  url.searchParams.set("bounded", "0");

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "FloodAI-CongressionalAppChallenge/0.1 (educational, non-commercial)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Geocoding service unavailable." }, { status: 502 });
    }
    const results = (await upstream.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      importance: number;
      boundingbox: [string, string, string, string]; // [south, north, west, east]
    }>;
    return NextResponse.json({
      results: results.map((r) => ({
        label: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        boundingBox: {
          south: parseFloat(r.boundingbox[0]),
          north: parseFloat(r.boundingbox[1]),
          west: parseFloat(r.boundingbox[2]),
          east: parseFloat(r.boundingbox[3]),
        },
      })),
    });
  } catch {
    return NextResponse.json({ error: "Geocoding request failed or timed out." }, { status: 502 });
  }
}
