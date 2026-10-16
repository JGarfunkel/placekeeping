import { completeAsanaConnection } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import {
  ASANA_COOKIE_PATH,
  ASANA_RETURN_COOKIE,
  ASANA_STATE_COOKIE,
  asanaRedirectUri,
  safeReturnPath,
} from "@/lib/asana";
import { getAuthContext } from "@/lib/session";

function done(request: NextRequest, result: "connected" | "error") {
  const returnTo = safeReturnPath(request.cookies.get(ASANA_RETURN_COOKIE)?.value);
  const target = new URL(returnTo ?? "/me", getAppBaseUrl());
  target.searchParams.set("asana", result);
  const response = NextResponse.redirect(target);
  for (const name of [ASANA_STATE_COOKIE, ASANA_RETURN_COOKIE]) {
    response.cookies.delete({ name, path: ASANA_COOKIE_PATH });
  }
  return response;
}

export async function GET(request: NextRequest) {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.redirect(new URL("/login", getAppBaseUrl()));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expected = request.cookies.get(ASANA_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return done(request, "error");

  try {
    await completeAsanaConnection({
      userId: authContext.userId,
      code,
      redirectUri: asanaRedirectUri(),
    });
  } catch (err) {
    console.error("Asana connection failed", err);
    return done(request, "error");
  }
  return done(request, "connected");
}
