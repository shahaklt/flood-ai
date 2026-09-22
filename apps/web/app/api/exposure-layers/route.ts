import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const FILES: Record<string, string> = {
  roads: "road_segments.geojson",
  facilities: "facilities.geojson",
  intersections: "intersections.geojson",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layer = searchParams.get("layer");
  const filename = layer ? FILES[layer] : undefined;
  if (!filename) {
    return NextResponse.json({ error: "Unknown layer. Use one of: roads, facilities, intersections." }, { status: 400 });
  }
  const filePath = path.join(process.cwd(), "..", "..", "data", "demo", filename);
  try {
    const raw = await readFile(filePath, "utf-8");
    return new NextResponse(raw, { headers: { "content-type": "application/geo+json" } });
  } catch {
    return NextResponse.json({ error: `${filename} not found. Run build_exposure_layers.py first.` }, { status: 503 });
  }
}
