import type { SiteParcelGeometry } from "@placekeeping/core";
import {
  describePropertyClass,
  type ParcelCandidate,
  type Site,
  type SpotSummary,
} from "@placekeeping/shared-types";
import Link from "next/link";
import type { ReactNode } from "react";
import { MapView, type ParcelPolygon } from "@/components/map/MapView";
import {
  parcelPolygonsForCandidates,
  type ParcelSelection,
} from "@/components/spots/ParcelPicker";
import { multiPolygonToPolygonPaths } from "@/lib/geo/parcelGeometry";
import { spotPath } from "@/lib/spotPath";
import { SiteDetailsEditor } from "./SiteDetailsEditor";

// Map + parcel list + spot list for a site. Shared by the standalone site
// page (/sites/[siteId]) and the Site column embedded in a spot's detail
// page -- both render the same "polygons, parcel details, spot list, site
// details" view, just with different surrounding chrome.
export function SiteMapAndParcels({
  site,
  parcelGeometries,
  memberSpots,
  center,
  canEditSite,
  currentSpotId,
  movableSpotId,
  // Set only while a "Change parcel" session is active (see
  // ChangeParcelControl) -- when present, the map shows these candidate
  // outlines (highlighted per pickerSelected) instead of the site's usual
  // parcelGeometries, so there's still only one map on the page rather than
  // a second one living inside the picker itself.
  pickerCandidates,
  pickerSelected,
  // The rest are all ChangeParcelControl-only, and only meaningful together
  // with currentSpotId -- they drive the "change" affordance and the
  // current spot's parcel status shown in the Parcels section below.
  currentSpotParcel,
  onStartChangeParcel,
  changeSessionOpen,
  changeParcelPanel,
}: {
  site: Site;
  parcelGeometries: SiteParcelGeometry[];
  memberSpots: SpotSummary[];
  center: { lat: number; lng: number };
  canEditSite: boolean;
  currentSpotId?: number;
  movableSpotId?: number;
  pickerCandidates?: ParcelCandidate[];
  pickerSelected?: ParcelSelection;
  currentSpotParcel?: { status: "resolved" | "no_parcel" | null; sbl: string | null };
  onStartChangeParcel?: () => void;
  changeSessionOpen?: boolean;
  changeParcelPanel?: ReactNode;
}) {
  const parcelPolygons: ParcelPolygon[] = pickerCandidates
    ? parcelPolygonsForCandidates(pickerCandidates, pickerSelected ?? "")
    : parcelGeometries.flatMap((p) =>
        multiPolygonToPolygonPaths(p.geometry).map((paths, i) => ({
          key: `${p.swisSblId}-${i}`,
          paths,
        })),
      );

  return (
    <div className="flex flex-col gap-4">
      {(parcelPolygons.length > 0 || memberSpots.length > 0) && (
        <MapView
          spots={memberSpots}
          parcelPolygons={parcelPolygons}
          canAddSpot
          siteId={site.siteId}
          center={center}
          compact
          movableSpotId={movableSpotId}
        />
      )}

      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">
            Parcels ({parcelGeometries.length})
          </h3>
          {onStartChangeParcel && (
            <button
              type="button"
              onClick={onStartChangeParcel}
              disabled={changeSessionOpen}
              className="text-xs font-medium text-neutral-600 underline hover:text-neutral-900 disabled:opacity-50 disabled:no-underline"
            >
              change
            </button>
          )}
        </div>
        {parcelGeometries.length === 0 ? (
          <p className="text-sm text-neutral-500">No parcels linked yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm text-neutral-700">
            {parcelGeometries.map((p) => {
              const isCurrentSpotParcel =
                currentSpotParcel?.status === "resolved" &&
                currentSpotParcel.sbl === p.swisSblId;
              return (
                <li
                  key={p.swisSblId}
                  className={isCurrentSpotParcel ? "font-medium text-neutral-900" : undefined}
                >
                  {p.printKey} {p.address} &middot;{" "}
                  <span title={describePropertyClass(p.propClass) ?? undefined}>
                    {p.propClass}
                  </span>{" "}
                  &middot; {p.calcAcres?.toFixed(1)} ac
                  {isCurrentSpotParcel && (
                    <span
                      className="ml-1 text-amber-500"
                      title="This spot's parcel"
                      aria-label="This spot's parcel"
                    >
                      ★
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {currentSpotParcel?.status === "no_parcel" && (
          <p className="mt-1 text-sm text-neutral-500">
            This spot has no linked parcel (marked manually).
          </p>
        )}
        {changeParcelPanel}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-neutral-900">
          Spots ({memberSpots.length})
        </h3>
        {memberSpots.length === 0 ? (
          <p className="text-sm text-neutral-500">No spots linked yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {memberSpots.map((spot) =>
              spot.spotId === currentSpotId ? (
                <li key={spot.spotId} className="text-neutral-500">
                  {spot.name} (this spot)
                </li>
              ) : (
                <li key={spot.spotId}>
                  <Link href={spotPath(spot)} className="underline">
                    {spot.name}
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <SiteDetailsEditor site={site} canEdit={canEditSite} />
    </div>
  );
}
