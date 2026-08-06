import { searchSpotsByName } from "@placekeeping/core";
import { spotSearchQuerySchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const parsed = spotSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const spots = await searchSpotsByName(
    parsed.data.q,
    parsed.data.excludeSpotId,
  );
  return NextResponse.json({ spots });
});
