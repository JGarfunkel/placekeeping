import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/session";

/**
 * Gate for /api/admin routes: null when the caller is a system admin,
 * otherwise the 401 response to return (same convention as
 * api/admin/settings).
 */
export async function requireSystemAdminApi(): Promise<NextResponse | null> {
  const authContext = await getAuthContext();
  if (!authContext?.isSystemAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
