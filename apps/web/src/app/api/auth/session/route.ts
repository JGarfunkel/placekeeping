import { adminAuth, getOrCreateUserByFirebaseUid } from "@placekeeping/core";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRES_IN_MS,
  createSessionCookieFromIdToken,
} from "@/lib/session";

// skipPauseGate on both: users must still be able to log in/out (and get-
// or-create'd on first login) while writes are paused, or nobody could
// reach the app to unpause it.
export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid ID token" }, { status: 401 });
  }

  await getOrCreateUserByFirebaseUid({
    firebaseUid: decoded.uid,
    name: decoded.name ?? decoded.email ?? "New User",
    email: decoded.email ?? null,
  });

  const sessionCookie = await createSessionCookieFromIdToken(idToken);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRES_IN_MS / 1000,
  });

  return NextResponse.json({ ok: true });
}, { skipPauseGate: true });

export const DELETE = withApiErrorHandling(async () => {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}, { skipPauseGate: true });
