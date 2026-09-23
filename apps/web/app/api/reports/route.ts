import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/** Real community flood observations, submitted by actual users of this
 * running instance -- never seeded with fabricated example reports. Stored
 * as a local JSONL file (data/community/, gitignored) since this is a local
 * pilot deployment with no database yet; spec section 13's privacy rule
 * (no account required, no location more precise than the submitter
 * chooses, optional free-text only) is enforced at the API boundary. */

const CATEGORIES = ["street_flooding", "basement_flooding", "storm_drain_backup", "road_closure", "other"] as const;
type Category = (typeof CATEGORIES)[number];

interface CommunityReport {
  id: string;
  submittedAt: string;
  lat: number;
  lon: number;
  category: Category;
  severity: number;
  description: string | null;
  placeLabel: string | null;
}

const DATA_DIR = path.join(process.cwd(), "..", "..", "data", "community");
const FILE_PATH = path.join(DATA_DIR, "reports.jsonl");

// Real New York State bounding box -- matches the app's declared coverage
// area; a submission outside it is rejected rather than silently stored.
const NY_BBOX = { minLon: -79.9, maxLon: -71.7, minLat: 40.4, maxLat: 45.1 };

async function readAll(): Promise<CommunityReport[]> {
  try {
    const raw = await readFile(FILE_PATH, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CommunityReport);
  } catch {
    return [];
  }
}

export async function GET() {
  const reports = await readAll();
  // Newest first; cap what one request returns to keep the page light.
  return NextResponse.json({ reports: reports.slice(-500).reverse() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { lat, lon, category, severity, description, placeLabel } = body as Record<string, unknown>;

  if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "lat and lon must be real numbers." }, { status: 400 });
  }
  if (lon < NY_BBOX.minLon || lon > NY_BBOX.maxLon || lat < NY_BBOX.minLat || lat > NY_BBOX.maxLat) {
    return NextResponse.json({ error: "Location falls outside FloodAI's New York State coverage area." }, { status: 400 });
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (typeof severity !== "number" || severity < 1 || severity > 5 || !Number.isInteger(severity)) {
    return NextResponse.json({ error: "severity must be an integer 1-5." }, { status: 400 });
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return NextResponse.json({ error: "description must be a string or omitted." }, { status: 400 });
  }
  const trimmedDescription = typeof description === "string" ? description.trim().slice(0, 500) : null;

  const report: CommunityReport = {
    id: randomUUID(),
    submittedAt: new Date().toISOString(),
    lat,
    lon,
    category: category as Category,
    severity,
    description: trimmedDescription || null,
    placeLabel: typeof placeLabel === "string" ? placeLabel.slice(0, 200) : null,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify(report) + "\n", { flag: "a" });

  return NextResponse.json({ report }, { status: 201 });
}
