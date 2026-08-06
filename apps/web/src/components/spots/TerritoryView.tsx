import {
  findNearbySpots,
  getTerritoryCounts,
  getUserByUserId,
  listSubdivisions,
} from "@placekeeping/core";
import type {
  MunicipalityAmbiguity,
  TerritoryResolution,
} from "@placekeeping/core";
import Link from "next/link";
import { MapView } from "@/components/map/MapView";
import { UploadPhotoButton } from "@/components/photos/UploadPhotoButton";
import { TerritorySidePanel } from "@/components/spots/TerritorySidePanel";
import { getAuthContext } from "@/lib/session";

// Rough "fit the territory" radius from the approximate zoom computed in
// packages/core/src/territory.ts -- doesn't need to be exact, just enough to
// pull in the spots that plausibly belong to this territory on first paint.
function radiusMiForZoom(zoom: number): number {
  const radius = 1500 / Math.pow(2, zoom - 4);
  return Math.min(1500, Math.max(5, radius));
}

export async function TerritoryView({
  resolution,
}: {
  resolution: TerritoryResolution;
}) {
  const [spots, subdivisions, ownCounts, authContext] = await Promise.all([
    findNearbySpots({
      lat: resolution.centerLat,
      lng: resolution.centerLng,
      radiusMi: radiusMiForZoom(resolution.zoom),
    }),
    listSubdivisions(resolution),
    getTerritoryCounts(resolution.path),
    getAuthContext(),
  ]);
  // The logged-in caller's own public handle, shown as the attribution on
  // any observation they log from this page -- see users.username in
  // schema.ts (never the private `name` here, since this is visible to
  // other users on the spot's observation list).
  const observerUser = authContext
    ? await getUserByUserId(authContext.userId)
    : null;
  const observerName = observerUser?.username ?? null;

  // This territory's own category breakdown -- only meaningful as a
  // scoreboard at the finest grain (no subdivisions to rank instead), but
  // computed either way since it's cheap and the panel decides which to show.
  const scoreboard = Object.entries(ownCounts)
    .map(([category, count]) => ({ category, count }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:grid lg:items-start lg:gap-0 lg:divide-x lg:divide-neutral-200"
      style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}
    >
      <div className="flex flex-col gap-4 lg:pr-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">{resolution.name}</h1>
          <div className="flex items-baseline gap-4">
            <UploadPhotoButton observerName={observerName} />
            <Link href="/" className="text-sm underline">
              Full map
            </Link>
          </div>
        </div>

        <MapView
          spots={spots}
          center={{ lat: resolution.centerLat, lng: resolution.centerLng }}
          canAddSpot={!!authContext}
          zoom={resolution.zoom}
        />
      </div>

      <TerritorySidePanel
        territoryName={resolution.name}
        subdivisions={subdivisions}
        scoreboard={scoreboard}
        spots={spots}
      />
    </main>
  );
}

// Rendered instead of TerritoryView when resolveMunicipality can't safely
// pick a winner on its own -- e.g. two same-named, same-population towns.
// Links carry the -city/-town/-village/-county qualifier from
// packages/core/src/territory.ts so the next request resolves outright.
export function MunicipalityAmbiguityView({
  cc,
  sc,
  mc,
  ambiguity,
}: {
  cc: string;
  sc: string;
  mc: string;
  ambiguity: MunicipalityAmbiguity;
}) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold">Which {mc}?</h1>
      <p className="text-sm text-neutral-500">
        More than one municipality in {sc.toUpperCase()} is named &quot;{mc}
        &quot; -- pick one:
      </p>
      <ul className="divide-y divide-neutral-200">
        {ambiguity.options.map((option) => (
          <li key={`${option.type}-${option.name}-${option.county}`} className="py-3">
            <Link
              href={`/spots/${cc}/${sc}/${mc}-${option.type}`}
              className="font-medium underline"
            >
              {option.name} ({option.type})
            </Link>
            {option.county && (
              <span className="text-sm text-neutral-500"> -- {option.county}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
