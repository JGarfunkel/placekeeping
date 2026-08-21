import { searchSubdivisions, searchSubdivisionsLive } from "@placekeeping/core";
import { subdivisionSearchQuerySchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const parsed = subdivisionSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const subdivisions = parsed.data.live
    ? await searchSubdivisionsLive(parsed.data.q)
    : await searchSubdivisions(parsed.data.q);
  return NextResponse.json({ subdivisions });
});
