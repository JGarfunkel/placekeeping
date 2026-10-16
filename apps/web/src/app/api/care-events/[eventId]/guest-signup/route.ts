import { guestSignUpForCareEvent } from "@placekeeping/core";
import { guestSignupSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getClientIp } from "@/lib/clientIp";

type Params = { params: Promise<{ eventId: string }> };

// Signed-out sign-up. The response is identical whether or not the email
// already has an account.
// Rate limited per IP and per email inside guestSignUpForCareEvent.
export const POST = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const { eventId } = await params;
  const parsed = guestSignupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  await guestSignUpForCareEvent(eventId, parsed.data, getClientIp(request));
  return NextResponse.json({ ok: true, message: "Check your email to confirm." });
});
