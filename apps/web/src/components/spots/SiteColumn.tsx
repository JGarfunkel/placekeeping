import type { SiteParcelGeometry } from "@placekeeping/core";
import type { Site, Spot, SpotSummary } from "@placekeeping/shared-types";
import Link from "next/link";
import { MapView } from "@/components/map/MapView";
import { SiteMapAndParcels } from "@/components/sites/SiteMapAndParcels";
import { sitePurposeLabels } from "@/lib/siteLabels";
import { ChangeParcelControl } from "./ChangeParcelControl";
import { SiteDiscoveryPanel } from "./SiteDiscoveryPanel";

// Site (largest-scope) column of the spot detail page's 3-column layout:
// Site > Spot > Observations. Once a site is linked, this is read-only
// (map with parcel polygons, parcel list, sibling-spot list); until then
// it's just this spot's own pin plus the owner-only discovery flow to find
// a parcel and join/create a site.
export function SiteColumn({
  spot,
  linkedSite,
  parcelGeometries,
  memberSpots,
  canManageParcel,
  canEditSite,
}: {
  spot: Spot;
  linkedSite: Site | null;
  parcelGeometries: SiteParcelGeometry[];
  memberSpots: SpotSummary[];
  canManageParcel: boolean;
  canEditSite: boolean;
}) {
  if (linkedSite) {
    const center = memberSpots.length
      ? { lat: memberSpots[0].latitude, lng: memberSpots[0].longitude }
      : { lat: spot.latitude, lng: spot.longitude };

    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-medium">
            <Link href={`/sites/${linkedSite.siteId}`} className="underline">
              {linkedSite.name}
            </Link>
          </h2>
          {linkedSite.purpose && (
            <p className="text-sm text-neutral-500">
              {sitePurposeLabels[linkedSite.purpose] ?? linkedSite.purpose}
            </p>
          )}
        </div>

        {canManageParcel ? (
          <ChangeParcelControl
            spot={spot}
            site={linkedSite}
            parcelGeometries={parcelGeometries}
            memberSpots={memberSpots}
            center={center}
            movableSpotId={spot.spotId}
            canEditSite={canEditSite}
          />
        ) : (
          <SiteMapAndParcels
            site={linkedSite}
            parcelGeometries={parcelGeometries}
            memberSpots={memberSpots}
            center={center}
            currentSpotId={spot.spotId}
            canEditSite={canEditSite}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Site</h2>

      {canManageParcel ? (
        // Owns its own map (with candidate-picker highlighting) rather than
        // rendering one here too -- see ParcelPicker's map-less design.
        <SiteDiscoveryPanel spot={spot} />
      ) : (
        <>
          <MapView
            spots={[
              {
                spotId: spot.spotId,
                name: spot.name,
                latitude: spot.latitude,
                longitude: spot.longitude,
                slugState: spot.slugState,
                slugLocality: spot.slugLocality,
                slug: spot.slug,
                accessibility: spot.accessibility,
                vegetation: spot.vegetation,
                purpose: spot.purpose,
                weedLevel: spot.weedLevel,
                stewardId: spot.stewardId,
                coverPhotoUrl: spot.coverPhotoUrl,
              },
            ]}
            center={{ lat: spot.latitude, lng: spot.longitude }}
            compact
          />
          <p className="text-sm text-neutral-500">
            This spot isn&apos;t linked to a site yet.
          </p>
        </>
      )}
    </div>
  );
}
