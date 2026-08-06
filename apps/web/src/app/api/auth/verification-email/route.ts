import { getUserByUserId, sendVerificationEmailForUser } from "@placekeeping/core";
import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { getAuthContext } from "@/lib/session";

// Called from signup (right after /api/auth/session mints a cookie) and
// from ResendVerificationButton -- both need the caller signed in, since
// there's no other way to know which address to verify.
export const POST = withApiErrorHandling(async () => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByUserId(authContext.userId);
  if (!user?.email) {
    return NextResponse.json({ error: "No email on file" }, { status: 400 });
  }

  await sendVerificationEmailForUser(user.email, `${getAppBaseUrl()}/`);
  return NextResponse.json({ ok: true });
}, { skipPauseGate: true });
