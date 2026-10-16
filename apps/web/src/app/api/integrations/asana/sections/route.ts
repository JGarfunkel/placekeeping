import { listAsanaSections } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const identityId = request.nextUrl.searchParams.get("identityId");
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!identityId || !projectId) {
    return NextResponse.json(
      { error: "identityId and projectId are required" },
      { status: 400 },
    );
  }
  const sections = await listAsanaSections(auth.ctx.userId, identityId, projectId);
  return NextResponse.json({ sections });
});
