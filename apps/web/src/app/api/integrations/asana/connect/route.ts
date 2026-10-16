import { buildAsanaAuthorizeUrl } from "@placekeeping/core";
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import {
  ASANA_COOKIE_PATH,
  ASANA_RETURN_COOKIE,
  ASANA_STATE_COOKIE,
  asanaRedirectUri,
  isAsanaEnabled,
  safeReturnPath,
} from "@/lib/asana";
import { getAuthContext } from "@/lib/session";

// Starts the Asana OAuth flow. A random state is stored in a short-lived
// httpOnly cookie and checked in the callback (CSRF protection).
export async function GET(request: NextRequest) {
  if (!isAsanaEnabled()) return new NextResponse(null, { status: 404 });
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.redirect(new URL("/login", getAppBaseUrl()));
  }
  const state = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(
    buildAsanaAuthorizeUrl(asanaRedirectUri(), state),
  );
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: ASANA_COOKIE_PATH,
  };
  response.cookies.set(ASANA_STATE_COOKIE, state, cookieOptions);
  // Where to land after authorizing (e.g. the spot page the user came from).
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo"));
  if (returnTo) response.cookies.set(ASANA_RETURN_COOKIE, returnTo, cookieOptions);
  return response;
}
