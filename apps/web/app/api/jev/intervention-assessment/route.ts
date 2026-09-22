import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { JevInterventionAssessment, JevResponse } from "@flood-ai/shared";
import { buildJevState, requestJevAssessment, type JevRequestState } from "@flood-ai/jev";

/** Server-only route. TYPESAFE_API_KEY never reaches the client -- this
 * file only runs in the Next.js server runtime. */

interface RequestBody {
  intervention: Parameters<typeof buildJevState>[0];
  rainfallScenarioId: string;
  cellDeltas: Parameters<typeof buildJevState>[2];
  topContributorLabels: string[];
  dataGaps: string[];
  location: { lat: number; lon: number };
  coverageTier: Parameters<typeof buildJevState>[6];
}

// In-memory cache keyed by a hash of the structured state, per spec 6.10
// ("cache identical structured states by cryptographic hash"). Resets on
// server restart -- acceptable for a demo-scale deployment.
const responseCache = new Map<string, JevInterventionAssessment>();

export async function POST(request: Request): Promise<Response> {
  if (!process.env.TYPESAFE_API_KEY) {
    const body: JevResponse = { status: "unavailable", reason: "TYPESAFE_API_KEY is not configured on the server." };
    return NextResponse.json(body, { status: 200 });
  }

  let payload: RequestBody;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "Invalid request body." } satisfies JevResponse, { status: 400 });
  }

  const state: JevRequestState = buildJevState(
    payload.intervention,
    payload.rainfallScenarioId,
    payload.cellDeltas,
    payload.topContributorLabels,
    payload.dataGaps,
    payload.location,
    payload.coverageTier,
  );

  const stateHash = createHash("sha256").update(JSON.stringify(state)).digest("hex");
  const cached = responseCache.get(stateHash);
  if (cached) {
    return NextResponse.json({ status: "ok", assessment: cached } satisfies JevResponse);
  }

  try {
    const assessment = await requestJevAssessment(state);
    responseCache.set(stateHash, assessment);
    return NextResponse.json({ status: "ok", assessment } satisfies JevResponse);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Jev request failed.";
    // Honest failure state -- the intervention simulator itself must remain
    // fully usable without Jev (spec 6.10). Never fabricate an assessment.
    return NextResponse.json({ status: "unavailable", reason } satisfies JevResponse, { status: 200 });
  }
}
