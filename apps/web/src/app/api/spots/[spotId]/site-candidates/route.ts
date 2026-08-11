import {
  canManageSpot,
  fetchParcelOwner,
  findCandidateSites,
  getCachedParcel,
  getSpotById,
  isInstitutionalClass,
  resolveSiteForParcel,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string }> };

function normalizeOwner(name: string | null): string | null {
  return name ? name.trim().toUpperCase() : null;
}

// Site join, candidate-then-confirm (local/spot-resolution.md §6). Never
// auto-merges on adjacency -- this only ever returns candidates for an
// explicit user pick, plus a direct-hit shortcut when the parcel is
// already grouped into a site.
export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const spotId = Number((await params).spotId);
    if (!Number.isInteger(spotId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const spot = await getSpotById(spotId);
    if (!spot) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canManageSpot(authContext, spot)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (spot.parcelStatus === "no_parcel") {
      // Deliberately parcel-less (e.g. the pin is in the street) -- there's
      // no parcel to search adjacency from, so there are no candidates.
      return NextResponse.json({ result: { status: "none" } });
    }
    if (!spot.parcelSbl) {
      return NextResponse.json(
        { error: "No parcel resolved for this spot yet" },
        { status: 400 },
      );
    }

    const directHit = await resolveSiteForParcel(spot.parcelSbl);
    if (directHit) {
      return NextResponse.json({ result: { status: "direct", site: directHit } });
    }

    const matches = await findCandidateSites(spot.parcelSbl);
    if (matches.length === 0) {
      return NextResponse.json({ result: { status: "none" } });
    }

    const targetParcel = await getCachedParcel(spot.parcelSbl);
    const institutional = targetParcel
      ? isInstitutionalClass(targetParcel.propClass, targetParcel.nysName, spot.state)
      : false;

    // Owner-match strengthens a candidate's presentation for institutional
    // classes only -- it never auto-joins anything (§6.3: residential /
    // opt-in is always an explicit pick).
    const targetOwner = institutional
      ? normalizeOwner((await fetchParcelOwner(spot.parcelSbl, spot.state))?.primaryOwner ?? null)
      : null;

    const candidates = await Promise.all(
      matches.map(async (match) => {
        if (!institutional || !targetOwner) {
          return { site: match.site };
        }
        const neighborOwner = normalizeOwner(
          (await fetchParcelOwner(match.neighborSwisSblId, spot.state))?.primaryOwner ?? null,
        );
        return {
          site: match.site,
          ownerMatch: neighborOwner !== null && neighborOwner === targetOwner,
        };
      }),
    );

    return NextResponse.json({ result: { status: "candidates", candidates } });
  },
);
