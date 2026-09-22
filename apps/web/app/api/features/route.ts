import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/** Serves the real pilot feature grid (see scripts/data_pipeline/build_feature_grid.py).
 * This is a single bundled feature tile for the Phase 1 vertical slice; Phase 4
 * replaces this with real viewport-driven {z}/{x}/{y} tiling. */
export async function GET() {
  const filePath = path.join(process.cwd(), "..", "..", "data", "demo", "feature_grid.geojson");
  try {
    const raw = await readFile(filePath, "utf-8");
    return new NextResponse(raw, {
      headers: { "content-type": "application/geo+json" },
    });
  } catch {
    return NextResponse.json(
      { error: "Feature grid not found. Run scripts/data_pipeline/build_feature_grid.py first." },
      { status: 503 },
    );
  }
}
