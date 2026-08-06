import {
  getSiteById,
  getSiteParcelGeometries,
  listSpotsBySite,
} from "@placekeeping/core";
import type { SiteParcelGeometry } from "@placekeeping/core";
import type { Site, Spot, SpotSummary } from "@placekeeping/shared-types";

// Shared by the spot detail view and the edit page -- both render a Site
// column (SiteColumn) alongside the spot itself, and need the same
// linked-site + parcel + sibling-spot data to do it.
export async function getSiteColumnData(spot: Spot): Promise<{
  linkedSite: Site | null;
  parcelGeometries: SiteParcelGeometry[];
  memberSpots: SpotSummary[];
}> {
  const linkedSite = spot.siteId ? await getSiteById(spot.siteId) : null;
  let parcelGeometries: SiteParcelGeometry[] = [];
  let memberSpots: SpotSummary[] = [];
  if (linkedSite) {
    [parcelGeometries, memberSpots] = await Promise.all([
      getSiteParcelGeometries(linkedSite.siteId),
      listSpotsBySite(linkedSite.siteId),
    ]);
  }
  return { linkedSite, parcelGeometries, memberSpots };
}
