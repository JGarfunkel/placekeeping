import { cancelCareEvent } from "@placekeeping/core";
import { cancelCareEventSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ eventId: string }> };

export const POST = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const { eventId } = await params;
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = cancelCareEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await cancelCareEvent(authContext, eventId, parsed.data.reason);
  return NextResponse.json({ ok: true });
});
