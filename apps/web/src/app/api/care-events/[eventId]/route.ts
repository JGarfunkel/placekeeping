import { getCareEventView, updateCareEvent } from "@placekeeping/core";
import { updateCareEventSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ eventId: string }> };

export const GET = withApiErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const { eventId } = await params;
  const view = await getCareEventView(eventId, await getAuthContext());
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view);
});

export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const { eventId } = await params;
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = updateCareEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const event = await updateCareEvent(authContext, eventId, parsed.data);
  return NextResponse.json({ event });
});
