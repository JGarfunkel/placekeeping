import {
  canManageSite,
  getSiteById,
  reassignSiteParcel,
  removeSiteParcel,
} from "@placekeeping/core";
import {
  reassignSiteParcelSchema,
  removeSiteParcelSchema,
} from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ siteId: string }> };

// Manual admin/creator "remove parcel" affordance (SiteMapAndParcels) --
// the counterpart to the spot-driven site_parcels bookkeeping in
// reassignSpotParcel. See removeSiteParcel for why this refuses when a
// member spot still resolves to the parcel being removed.
export const DELETE = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const siteId = Number((await params).siteId);
    if (!Number.isInteger(siteId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const site = await getSiteById(siteId);
    if (!site) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canManageSite(authContext, site)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = removeSiteParcelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await removeSiteParcel(
      siteId,
      parsed.data.swisSblId,
      authContext.userId,
    );
    if (!result.ok) {
      if (result.reason === "not_linked") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        {
          error: `Still in use by ${result.spotNames.join(", ")} -- reassign or clear that spot's parcel first`,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  },
);

// Manual admin/creator "move parcel to a different site" affordance --
// existing site or a brand-new one. See reassignSiteParcel for why any
// member spot still resolved to this parcel moves along with it.
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

    const site = await getSiteById(siteId);
    if (!site) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canManageSite(authContext, site)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = reassignSiteParcelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { swisSblId, ...target } = parsed.data;
    const result = await reassignSiteParcel(
      siteId,
      swisSblId,
      target,
      authContext.userId,
    );
    if (!result.ok) {
      if (result.reason === "not_linked") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Parcel is already linked to this site" },
        { status: 400 },
      );
    }

    return NextResponse.json({ site: result.site });
  },
);
