import {
  canEditObservation,
  claimObservationStewardship,
  getObservationById,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string; observationId: string }> };

// "Log stewardship activity": same ownership/edit-window gate as the general
// PATCH route (canEditObservation), plus requiring the caller to already be
// a steward -- becoming one is a separate step (POST /api/stewards/me), kept
// out of this route so the two buttons stay independent actions.
export const POST = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const { spotId, observationId } = await params;
    if (!Number.isInteger(Number(spotId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!authContext.stewardId) {
      return NextResponse.json(
        { error: "Become a steward before logging stewardship activity" },
        { status: 403 },
      );
    }

    const existing = await getObservationById(observationId);
    if (!existing || existing.spotId !== Number(spotId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canEditObservation(authContext, existing)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const observation = await claimObservationStewardship(
      observationId,
      authContext.stewardId,
    );
    return NextResponse.json({ observation });
  },
);
