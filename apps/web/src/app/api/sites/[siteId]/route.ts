import { canManageSite, getSiteById, updateSite } from "@placekeeping/core";
import { updateSiteSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ siteId: string }> };

export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const siteId = Number((await params).siteId);
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const site = await getSiteById(siteId);
    if (!site) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ site });
  },
);

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const siteId = Number((await params).siteId);
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getSiteById(siteId);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canManageSite(authContext, existing)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSiteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const site = await updateSite(siteId, parsed.data, authContext.userId);
    if (!site) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ site });
  },
);
