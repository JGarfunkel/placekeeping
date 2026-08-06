import {
  canManageSpot,
  getCachedParcel,
  getParcelLookupResult,
  getSpotById,
  reassignSpotParcel,
} from "@placekeeping/core";
import { parcelSelectSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string }> };

// Confirms one candidate from a prior POST /parcel/lookup ("discover"), or
// declares no parcel applies (local/spot-resolution.md §4) -- the one
// mutation point for both the initial-discovery picker and the post-link
// "Change parcel" flow. See reassignSpotParcel for the site_parcels
// bookkeeping this triggers when the spot already belongs to a site.
export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const spotId = Number((await params).spotId);
    if (!Number.isInteger(spotId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const spot = await getSpotById(spotId);
    if (!spot) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canManageSpot(authContext, spot)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = parcelSelectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if ("noParcel" in parsed.data) {
      await reassignSpotParcel(spotId, null);
    } else {
      const { swisSblId, rollYr } = parsed.data;
      // Must already be cached from a prior POST /parcel/lookup call --
      // this route never hits ArcGIS itself.
      const cached = await getCachedParcel(swisSblId);
      if (!cached) {
        return NextResponse.json(
          { error: "Unknown parcel — re-run discovery" },
          { status: 400 },
        );
      }
      await reassignSpotParcel(spotId, { swisSblId, rollYr });
    }

    const updated = await getSpotById(spotId);
    if (!updated) {
      throw new Error("Spot disappeared during parcel reassignment");
    }
    return NextResponse.json({ result: await getParcelLookupResult(updated) });
  },
);
