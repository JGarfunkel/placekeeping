import { createCareEvent, listCareEventsForTarget } from "@placekeeping/core";
import { createCareEventSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

// GET ?siteId=<id> or ?spotId=<id>[&upcoming=1]: events the caller may see.
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const siteId = Number(searchParams.get("siteId"));
  const spotId = Number(searchParams.get("spotId"));
  const target = Number.isInteger(siteId) && siteId > 0
    ? { siteId }
    : Number.isInteger(spotId) && spotId > 0
      ? { spotId }
      : null;
  if (!target) {
    return NextResponse.json({ error: "siteId or spotId required" }, { status: 400 });
  }
  const authContext = await getAuthContext();
  const events = await listCareEventsForTarget(target, authContext, {
    upcomingOnly: searchParams.get("upcoming") === "1",
  });
  return NextResponse.json({ events });
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createCareEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const event = await createCareEvent(authContext, parsed.data);
  return NextResponse.json({ event }, { status: 201 });
});
