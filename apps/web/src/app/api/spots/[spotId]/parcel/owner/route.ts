import {
  canManageSpot,
  getCachedParcel,
  getParcelOwnerInfo,
  getSpotById,
  isInstitutionalClass,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string }> };

// "Show owner" (local/spot-resolution.md §5): the button's presence on the
// client is one gate, but isInstitutionalClass is re-checked here against
// the *cached* parcel row before fetchParcelOwner is ever called -- a
// direct request to this route for a residential/agricultural parcel 403s.
export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
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
    if (!spot.parcelSbl) {
      return NextResponse.json(
        { error: "No parcel resolved for this spot yet" },
        { status: 400 },
      );
    }

    const parcel = await getCachedParcel(spot.parcelSbl);
    if (!parcel) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isInstitutionalClass(parcel.propClass, parcel.nysName, spot.state)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const owner = await getParcelOwnerInfo(spot.parcelSbl, spot.state);
    if (!owner) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ owner });
  },
);
