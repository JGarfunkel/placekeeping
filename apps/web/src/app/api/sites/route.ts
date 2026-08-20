import { findNearbySites, listSites } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";

// Minimal scaffolding alongside local/spot-resolution.md's flow -- there's
// no standalone "create a bare site" endpoint; sites are only created via
// the /api/spots/:spotId/site cascade.
//
// ?nearSwisSblId=<id>[&excludeSiteId=<id>] narrows to sites with a parcel
// within a quarter mile of that parcel -- backs ReassignParcelControl's
// destination picker so it doesn't list every site in the system.
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const nearSwisSblId = searchParams.get("nearSwisSblId");
  if (nearSwisSblId) {
    const excludeSiteIdParam = searchParams.get("excludeSiteId");
    const excludeSiteId = excludeSiteIdParam ? Number(excludeSiteIdParam) : null;
    const sites = await findNearbySites(
      nearSwisSblId,
      Number.isInteger(excludeSiteId) ? excludeSiteId : null,
    );
    return NextResponse.json({ sites });
  }

  const sites = await listSites();
  return NextResponse.json({ sites });
});
