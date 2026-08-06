import "server-only";

import { adminAuth, resolveAuth, type AuthContext } from "@placekeeping/core";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_EXPIRES_IN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function createSessionCookieFromIdToken(idToken: string) {
  return adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_IN_MS,
  });
}

/**
 * The single Data Access Layer entry point for identity: reads either the
 * session cookie (web) or an Authorization bearer token (future mobile),
 * cached per-request so repeated calls during a render pass don't re-verify.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()]);
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const authHeader = headersList.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  return resolveAuth({ bearerToken, sessionCookie });
});

export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect("/login");
  }
  return ctx;
}
