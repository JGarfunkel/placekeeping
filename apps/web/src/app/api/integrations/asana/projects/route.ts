import { listAsanaProjects } from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireApiAuth } from "@/lib/integrationAuth";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const auth = await requireApiAuth();
  if ("response" in auth) return auth.response;
  const identityId = request.nextUrl.searchParams.get("identityId");
  if (!identityId) {
    return NextResponse.json({ error: "identityId is required" }, { status: 400 });
  }
  const projects = await listAsanaProjects(auth.ctx.userId, identityId);
  return NextResponse.json({ projects });
});
