import {
  canManageSpot,
  getSpotById,
  linkSpotToSite,
} from "@placekeeping/core";
import { linkSpotToSiteSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string }> };

// The §8 cascade save: one transaction, insert site (if new) -> insert
// site_parcels -> link the spot. No per-row endpoints, so there's no path
// to a spot pointing at a site that failed to insert.
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
    if (!spot.parcelSbl) {
      return NextResponse.json(
        { error: "No parcel resolved for this spot yet" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = linkSpotToSiteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const site = await linkSpotToSite(
      spotId,
      spot.parcelSbl,
      parsed.data,
      authContext.userId,
    );
    return NextResponse.json({ site }, { status: 201 });
  },
);
