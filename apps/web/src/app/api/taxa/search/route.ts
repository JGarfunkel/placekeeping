import { searchTaxa, stateForObservation } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

// Autocomplete over taxa already known to the app (manual species entry).
// Optional ?observationId= so results carry that spot state's invasive flag.
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = request.nextUrl.searchParams.get("q") ?? "";
  // The observation being identified fixes which state's invasive list applies.
  const observationId = request.nextUrl.searchParams.get("observationId");
  const state = observationId ? await stateForObservation(observationId) : null;
  return NextResponse.json({ taxa: await searchTaxa(q, state) });
});
