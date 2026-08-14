import {
  canManageSite,
  getSiteById,
  getSiteParcelGeometries,
  listSpotsBySite,
} from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SiteMapAndParcels } from "@/components/sites/SiteMapAndParcels";
import { multiPolygonToPolygonPaths } from "@/lib/geo/parcelGeometry";
import type { ParcelPolygon } from "@/components/map/MapView";
import { SpotColumns } from "@/components/spots/SpotColumns";
import { sitePurposeLabels } from "@/lib/siteLabels";
import { buildSiteMetadata } from "@/lib/siteMetadata";
import { getAuthContext } from "@/lib/session";

// Falls back to roughly the geographic center of the contiguous U.S. --
// matches apps/web/src/app/page.tsx's default, used only when this site has
// neither spots nor parcel geometry to derive a center from.
const DEFAULT_CENTER = {
  lat: process.env.DEFAULT_MAP_CENTER_LAT
    ? Number(process.env.DEFAULT_MAP_CENTER_LAT)
    : 39.8283,
  lng: process.env.DEFAULT_MAP_CENTER_LNG
    ? Number(process.env.DEFAULT_MAP_CENTER_LNG)
    : -98.5795,
};

// Shared between generateMetadata and the page body so the site + its member
// spots only get fetched once per request (mirrors the spot slug page's
// loadSpot cache in app/spots/[a]/[b]/[c]/[d]/page.tsx).
const loadSite = cache(async (siteId: number) => {
  const site = await getSiteById(siteId);
  if (!site) return null;
  const memberSpots = await listSpotsBySite(siteId);
  return { site, memberSpots };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}): Promise<Metadata> {
  const { siteId: siteIdParam } = await params;
  const siteId = Number(siteIdParam);
  if (!Number.isInteger(siteId)) return {};
  const loaded = await loadSite(siteId);
  return loaded ? buildSiteMetadata(loaded.site, loaded.memberSpots) : {};
}

// Sites are only created via the spot-page cascade save
// (local/spot-resolution.md §8) -- no create/list UI here, just view + edit.
export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId: siteIdParam } = await params;
  const siteId = Number(siteIdParam);
  if (!Number.isInteger(siteId)) notFound();

  const loaded = await loadSite(siteId);
  if (!loaded) notFound();
  const { site, memberSpots } = loaded;

  const [parcelGeometries, authContext] = await Promise.all([
    getSiteParcelGeometries(siteId),
    getAuthContext(),
  ]);

  const parcelPolygons: ParcelPolygon[] = parcelGeometries.flatMap((p) =>
    multiPolygonToPolygonPaths(p.geometry).map((paths, i) => ({
      key: `${p.swisSblId}-${i}`,
      paths,
    })),
  );

  const center = memberSpots.length
    ? { lat: memberSpots[0].latitude, lng: memberSpots[0].longitude }
    : parcelPolygons.length
      ? centroidOfRing(parcelPolygons[0].paths[0])
      : DEFAULT_CENTER;

  const canEdit = authContext ? canManageSite(authContext, site) : false;

  return (
    <SpotColumns
      site={
        <SiteMapAndParcels
          site={site}
          parcelGeometries={parcelGeometries}
          memberSpots={memberSpots}
          center={center}
          canEditSite={canEdit}
        />
      }
      main={
        <div>
          <h1 className="text-2xl font-semibold">{site.name}</h1>
          {site.purpose && (
            <p className="text-sm text-neutral-500">
              {sitePurposeLabels[site.purpose] ?? site.purpose}
            </p>
          )}
          {site.createdByUsername && (
            <p className="mt-2 text-sm text-neutral-500">
              Added by {site.createdByUsername}
            </p>
          )}
        </div>
      }
    />
  );
}

function centroidOfRing(ring: google.maps.LatLngLiteral[]): google.maps.LatLngLiteral {
  const sum = ring.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / ring.length, lng: sum.lng / ring.length };
}
