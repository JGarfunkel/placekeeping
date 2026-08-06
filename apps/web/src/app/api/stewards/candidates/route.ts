import { listCandidateStewardsForUser } from "@placekeeping/core";
import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

// Feeds the steward picker's default list on spot create/edit: the caller's
// own individual steward first, then groups they admin, then groups
// they're a plain member of.
export const GET = withApiErrorHandling(async () => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await listCandidateStewardsForUser(authContext.userId);
  return NextResponse.json({ candidates });
});
