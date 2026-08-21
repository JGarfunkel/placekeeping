import { findNearbySpots, getUserByUserId } from "@placekeeping/core";
import { isDatabaseConnectionError } from "@placekeeping/db";
import { cookies } from "next/headers";
import Link from "next/link";
import { DatabaseWarningBanner } from "@/components/DatabaseWarningBanner";
import { SpotFilters } from "@/components/SpotFilters";
import { SubdivisionSearch } from "@/components/SubdivisionSearch";
import { MapLegend } from "@/components/map/MapLegend";
import { MapView } from "@/components/map/MapView";
import { UploadPhotoButton } from "@/components/photos/UploadPhotoButton";
import { MAP_VIEW_COOKIE_NAME, parseMapViewCookie } from "@/lib/mapView";
import { DEFAULT_PIN_SVG, renderPin } from "@/lib/pins/renderPin";
import { resolveSpotPin } from "@/lib/pins/resolveSpotPin";
import { getAuthContext } from "@/lib/session";

// Falls back to roughly the geographic center of the contiguous U.S. — used
// only until the visitor shares their location or the query string carries one.
const DEFAULT_CENTER = {
  lat: process.env.DEFAULT_MAP_CENTER_LAT
    ? Number(process.env.DEFAULT_MAP_CENTER_LAT)
    : 39.8283,
  lng: process.env.DEFAULT_MAP_CENTER_LNG
    ? Number(process.env.DEFAULT_MAP_CENTER_LNG)
    : -98.5795,
};
const DEFAULT_RADIUS_MI = 1000;

type SearchParams = {
  lat?: string;
  lng?: string;
  zoom?: string;
  radiusMi?: string;
  stewardId?: string;
  unstewarded?: string;
  vegetation?: string;
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const savedView = parseMapViewCookie(
    cookieStore.get(MAP_VIEW_COOKIE_NAME)?.value,
  );

  const lat = params.lat
    ? Number(params.lat)
    : (savedView?.lat ?? DEFAULT_CENTER.lat);
  const lng = params.lng
    ? Number(params.lng)
    : (savedView?.lng ?? DEFAULT_CENTER.lng);
  const zoom = params.zoom
    ? Number(params.zoom)
    : savedView && !params.lat
      ? savedView.zoom
      : 11;
  const radiusMi = params.radiusMi
    ? Number(params.radiusMi)
    : params.lat
      ? 15
      : DEFAULT_RADIUS_MI;

  const [spotsResult, authResult] = await Promise.allSettled([
    findNearbySpots({
      lat,
      lng,
      radiusMi,
      stewardId: params.stewardId,
      unstewarded: params.unstewarded === "true",
      vegetation: params.vegetation as never,
    }),
    getAuthContext(),
  ]);

  let dbUnavailable = false;

  if (spotsResult.status === "rejected" && !isDatabaseConnectionError(spotsResult.reason)) {
    throw spotsResult.reason;
  }
  if (authResult.status === "rejected" && !isDatabaseConnectionError(authResult.reason)) {
    throw authResult.reason;
  }
  if (spotsResult.status === "rejected" || authResult.status === "rejected") {
    dbUnavailable = true;
  }

  const spots = spotsResult.status === "fulfilled" ? spotsResult.value : [];
  const authContext = authResult.status === "fulfilled" ? authResult.value : null;
  // The logged-in caller's own public handle, shown as the attribution on
  // any observation they log from this page -- see users.username in
  // schema.ts (never the private `name` here, since this is visible to
  // other users on the spot's observation list).
  const observerUser = authContext
    ? await getUserByUserId(authContext.userId)
    : null;
  const observerName = observerUser?.username ?? null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8">
      {dbUnavailable && <DatabaseWarningBanner />}

      <div className="flex flex-wrap items-center gap-3">
        <SubdivisionSearch />

        {authContext && (
          <div className="text-sm text-neutral-500">
            <UploadPhotoButton observerName={observerName} /> or click map to add
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="md:w-2/3">
          <MapView
            spots={spots}
            center={{ lat, lng }}
            zoom={zoom}
            canAddSpot={!!authContext}
            persistViewState
          />

          <MapLegend />
        </div>

        <ul className="divide-y divide-neutral-200 md:w-1/3">
          {spots.map((spot) => {
            const pin = resolveSpotPin(spot);
            const pinSvg = pin ? renderPin(pin) : DEFAULT_PIN_SVG;
            return (
              <li key={spot.spotId} className="flex items-start gap-2 py-3">
                <div
                  className="h-[38px] w-7 shrink-0"
                  dangerouslySetInnerHTML={{ __html: pinSvg }}
                />
                <div>
                  <Link
                    href={`/spots/${spot.spotId}`}
                    className="font-medium underline"
                  >
                    {spot.name}
                  </Link>
                  <div className="text-sm text-neutral-500">
                    {spot.stewardId ? (
                      <Link
                        href={`/stewards/${spot.stewardId}`}
                        className="underline"
                      >
                        Stewarded
                      </Link>
                    ) : (
                      ""
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {spots.length === 0 && !dbUnavailable && (
            <li className="py-6 text-sm text-neutral-500">
              No spots found in this area. Try widening the radius.
            </li>
          )}
          {spots.length === 0 && dbUnavailable && (
            <li className="py-6 text-sm text-neutral-500">
              Spots couldn&apos;t be loaded right now.
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}
