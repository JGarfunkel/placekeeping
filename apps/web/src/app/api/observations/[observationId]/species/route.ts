import {
  canIdentifyObservation,
  getObservationById,
  listIdentifications,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ observationId: string }> };

// Everyone sees confirmed species; suggestions (and rejected rows, kept for
// the record) are the observer's working state and only go to them.
export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const { observationId } = await params;
    const observation = await getObservationById(observationId);
    if (!observation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const authContext = await getAuthContext();
    const canReview = !!authContext && canIdentifyObservation(authContext, observation);

    const all = await listIdentifications(observationId);
    const identifications = canReview
      ? all
      : all
          .map((i) => ({ ...i, plants: i.plants.filter((p) => p.status === "verified") }))
          .filter((i) => i.plants.length > 0);
    return NextResponse.json({ identifications, canReview });
  },
);
