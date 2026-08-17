import { createSpot, findNearbySpots } from "@placekeeping/core";
import { createSpotSchema, nearbySpotsQuerySchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const parsed = nearbySpotsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const spots = await findNearbySpots(parsed.data);
  return NextResponse.json({ spots });
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSpotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const spot = await createSpot(parsed.data, authContext.userId);
  return NextResponse.json({ spot }, { status: 201 });
});
