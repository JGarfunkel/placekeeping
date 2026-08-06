import { searchStewardsByName } from "@placekeeping/core";
import { stewardSearchQuerySchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const parsed = stewardSearchQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const stewards = await searchStewardsByName(parsed.data.q);
  return NextResponse.json({ stewards });
});
