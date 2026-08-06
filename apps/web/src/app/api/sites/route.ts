import { listSites } from "@placekeeping/core";
import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";

// Minimal scaffolding alongside local/spot-resolution.md's flow -- there's
// no standalone "create a bare site" endpoint; sites are only created via
// the /api/spots/:spotId/site cascade.
export const GET = withApiErrorHandling(async () => {
  const sites = await listSites();
  return NextResponse.json({ sites });
});
