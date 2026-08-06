import { createObservation, listObservationsForSpot } from "@placekeeping/core";
import { createObservationSchema } from "@placekeeping/shared-types";
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

    const observations = await listObservationsForSpot(spotId);
    return NextResponse.json({ observations });
  },
);

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

    const body = await request.json().catch(() => null);
    const parsed = createObservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const observation = await createObservation(
      spotId,
      parsed.data,
      authContext.userId,
    );
    return NextResponse.json({ observation }, { status: 201 });
  },
);
