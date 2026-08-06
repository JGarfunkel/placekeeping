import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const protectedRoutes = ["/spots/new", "/me"];

/**
 * Optimistic-only check (cookie presence, no cryptographic verification —
 * Proxy runs on every navigation and must stay fast). Real verification
 * happens in the page/route handler via getAuthContext()/requireAuthContext()
 * in src/lib/session.ts, which is the actual security boundary.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtected && !request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/spots/new", "/me/:path*"],
};
