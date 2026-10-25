import { findNearbySpots, listPromotedNotes } from "@placekeeping/core";
import { noteSignedBy } from "@placekeeping/shared-types";
import { isDatabaseConnectionError } from "@placekeeping/db";
import { cookies } from "next/headers";
import Link from "next/link";
import { DatabaseWarningBanner } from "@/components/DatabaseWarningBanner";
import { SpotFilters } from "@/components/SpotFilters";
import { HomeMapAndUpdates } from "@/components/HomeMapAndUpdates";
import { MapLegend } from "@/components/map/MapLegend";
import { ClampedNote } from "@/components/notes/ClampedNote";
import { NoteHtml } from "@/components/notes/NoteHtml";
import { MAP_VIEW_COOKIE_NAME, parseMapViewCookie } from "@/lib/mapView";
import { renderNotes } from "@/lib/renderNotes";
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
  focus?: string;
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

  const [spotsResult, authResult, notesResult] = await Promise.allSettled([
    findNearbySpots({
      lat,
      lng,
      radiusMi,
      stewardId: params.stewardId,
      unstewarded: params.unstewarded === "true",
      focus: params.focus as never,
    }),
    getAuthContext(),
    listPromotedNotes(),
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

  // A failed notes query must not take the map down with it -- the welcome
  // content is optional, so it just disappears.
  const promotedNotes =
    notesResult.status === "fulfilled" ? renderNotes(notesResult.value) : [];
  const spots = spotsResult.status === "fulfilled" ? spotsResult.value : [];
  const authContext = authResult.status === "fulfilled" ? authResult.value : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8">
      {dbUnavailable && <DatabaseWarningBanner />}

      <HomeMapAndUpdates
        spots={spots}
        center={{ lat, lng }}
        zoom={zoom}
        canAddSpot={!!authContext}
        dbUnavailable={dbUnavailable}
        legend={<MapLegend />}
        welcome={
          promotedNotes.length > 0 ? (
            <div className="flex flex-col gap-6">
              {promotedNotes.map((note) => (
                <article key={note.noteId}>
                  {note.title && (
                    <h2 className="mb-2 text-xl font-semibold">{note.title}</h2>
                  )}
                  <ClampedNote href={`/notes/${note.noteId}`}>
                    <NoteHtml html={note.html} />
                  </ClampedNote>
                  {noteSignedBy(note) && (
                    <p className="mt-1 text-sm text-neutral-500">
                      <Link href={`/user/${note.authorUsername}`} className="underline">
                        @{note.authorUsername}
                      </Link>
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : null
        }
      />
    </main>
  );
}
