import { confirmGuestSignup } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAppBaseUrl } from "@/lib/appBaseUrl";

type Params = { params: Promise<{ eventId: string }> };

// Target of the guest confirmation email link. Confirms the roster row, then
// sends the guest on to Firebase's set-password page (which returns to the
// event). A bad or expired token lands on the event page without confirming.
export const GET = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const { eventId } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const eventUrl = `${getAppBaseUrl()}/events/${eventId}`;
  const result = token ? await confirmGuestSignup(token) : null;
  if (!result) return NextResponse.redirect(`${eventUrl}?confirm=invalid`);
  return NextResponse.redirect(result.passwordSetupUrl ?? `${eventUrl}?confirm=ok`);
}, { skipPauseGate: true });
