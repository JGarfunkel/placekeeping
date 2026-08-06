import {
  canManageSpot,
  debugLog,
  deleteSpot,
  getSpotById,
  spotHasObservations,
  updateSpot,
} from "@placekeeping/core";
import { updateSpotSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string }> };

export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const spotId = Number((await params).spotId);
    if (!Number.isInteger(spotId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const spot = await getSpotById(spotId);
    if (!spot) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ spot });
  },
);

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const spotId = Number((await params).spotId);
    if (!Number.isInteger(spotId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingSpot = await getSpotById(spotId);
    if (!existingSpot) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canManageSpot(authContext, existingSpot)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    debugLog("[api/spots/:id] PATCH", spotId, "body", body);
    const parsed = updateSpotSchema.safeParse(body);
    if (!parsed.success) {
      debugLog("[api/spots/:id] PATCH validation failed", parsed.error.flatten());
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const spot = await updateSpot(spotId, parsed.data);
    debugLog("[api/spots/:id] PATCH responding stewardId", spot?.stewardId);
    return NextResponse.json({ spot });
  },
);

export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const spotId = Number((await params).spotId);
    if (!Number.isInteger(spotId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingSpot = await getSpotById(spotId);
    if (!existingSpot) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canManageSpot(authContext, existingSpot)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Owner/creator can delete an untouched spot; once observations exist,
    // only an admin can remove it (they'd cascade-delete along with it).
    if (!authContext.isSystemAdmin && (await spotHasObservations(spotId))) {
      return NextResponse.json(
        { error: "Only an admin can delete a spot that has observations" },
        { status: 403 },
      );
    }

    await deleteSpot(spotId);
    return new NextResponse(null, { status: 204 });
  },
);
