import { handleInboundEmailEvent, verifyInboundEmailWebhook } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";

// Resend POSTs here for every email received at a "receiving" address (see
// Resend dashboard > Receiving), e.g. contact@yourdomain.com. skipPauseGate
// because this is an external service, not a user write -- pausing app
// writes shouldn't cause Resend to pile up webhook retries.
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const rawBody = await request.text();
  const svixHeaders = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event;
  try {
    event = verifyInboundEmailWebhook(rawBody, svixHeaders);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  await handleInboundEmailEvent(event);
  return NextResponse.json({ ok: true });
}, { skipPauseGate: true });
