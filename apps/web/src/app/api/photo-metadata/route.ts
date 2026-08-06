import { debugLog, getPhotoObservedDate } from "@placekeeping/core";
import { photoMetadataQuerySchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/session";

export async function GET(request: NextRequest) {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = photoMetadataQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    debugLog("[api/photo-metadata] invalid query:", parsed.error.flatten());
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  debugLog("[api/photo-metadata] request for:", parsed.data.url);
  const observedAt = await getPhotoObservedDate(parsed.data.url);
  debugLog("[api/photo-metadata] responding with observedAt:", observedAt);
  return NextResponse.json({ observedAt });
}
