import {
  cancelCareEventSignup,
  setCareEventTimeslot,
  signUpForCareEvent,
} from "@placekeeping/core";
import { signupSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ eventId: string }> };

// Body is optional: { timeslot: "0900-1100" | null }, in the event's time zone.
async function readSlot(request: NextRequest) {
  const text = await request.text();
  if (!text.trim()) return { timeslot: null as string | null };
  const parsed = signupSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

export const POST = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const { eventId } = await params;
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await readSlot(request).catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid time slot" }, { status: 400 });
  await signUpForCareEvent(authContext, eventId, body.timeslot);
  return NextResponse.json({ ok: true });
});

// Change the time slot on your existing sign-up.
export const PATCH = withApiErrorHandling(async (request: NextRequest, { params }: Params) => {
  const { eventId } = await params;
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await readSlot(request).catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid time slot" }, { status: 400 });
  await setCareEventTimeslot(authContext, eventId, body.timeslot);
  return NextResponse.json({ ok: true });
});

export const DELETE = withApiErrorHandling(async (_request: NextRequest, { params }: Params) => {
  const { eventId } = await params;
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await cancelCareEventSignup(authContext, eventId);
  return NextResponse.json({ ok: true });
});
