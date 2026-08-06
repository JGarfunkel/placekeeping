import {
  cacheParcel,
  canManageSpot,
  fetchNearbyParcels,
  getParcelLookupResult,
  getSpotById,
  toParcelCandidate,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string }> };

// Cache-only read: renders the panel for a spot whose parcel was already
// resolved (by local containment on create, or a prior parcel/select call)
// without hitting ArcGIS again -- this is what keeps the already-resolved
// case at zero network calls, per local/spot-resolution.md §1.
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

    return NextResponse.json({ result: await getParcelLookupResult(spot) });
  },
);

// "Discover parcel" (local/spot-resolution.md §4): a buffered, owner-free
// live ArcGIS lookup around the pin. Never persists on its own -- returns
// candidates for the user to confirm via POST /parcel/select, so a
// mis-placed pin (e.g. sitting in a public road) doesn't get silently
// linked to whatever the first hit happened to be.
export const POST = withApiErrorHandling(
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

    const nearby = await fetchNearbyParcels(spot.latitude, spot.longitude);
    if (nearby.length === 0) {
      // Water / ROW / an uncovered county -- a normal outcome, not an
      // error. The spot stands alone; parcelSbl stays null.
      return NextResponse.json({ result: { status: "unparcelled" } });
    }

    // Cache every candidate up front (not just the eventual pick) -- the
    // buffered query already returns full geometry for each one at no
    // extra cost, and it means POST /parcel/select never needs a second
    // live fetch to confirm whichever candidate the user chooses.
    await Promise.all(nearby.map((candidate) => cacheParcel(candidate)));

    const candidates = nearby.map(toParcelCandidate);
    return NextResponse.json({ result: { status: "candidates", candidates } });
  },
);
