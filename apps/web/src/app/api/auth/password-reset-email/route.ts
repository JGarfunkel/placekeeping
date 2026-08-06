import { requestPasswordResetEmail } from "@placekeeping/core";
import { requestPasswordResetSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAppBaseUrl } from "@/lib/appBaseUrl";

// Public and deliberately quiet about whether the address has an account --
// requestPasswordResetEmail no-ops on auth/user-not-found, and this route
// always reports success either way to avoid leaking account existence.
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = requestPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await requestPasswordResetEmail(
    parsed.data.email,
    `${getAppBaseUrl()}/reset-password/confirm`,
  );
  return NextResponse.json({ ok: true });
}, { skipPauseGate: true });
