// A structural shape shared by both Spot and SpotSummary (from
// @placekeeping/shared-types) -- either can be passed in without importing
// both types here.
type SlugSource = {
  spotId: number;
  slugState: string | null;
  slugLocality: string | null;
  slug: string | null;
};

// Mirrors the canonical-URL logic in app/spots/[a]/page.tsx: a spot with a
// full slug lives at /spots/us/<state>/<locality>/<slug>, otherwise it's
// only reachable at /spots/<spotId> (no slug route is generated for it).
export function spotPath(spot: SlugSource): string {
  return spot.slugState && spot.slugLocality && spot.slug
    ? `/spots/us/${spot.slugState}/${spot.slugLocality}/${spot.slug}`
    : `/spots/${spot.spotId}`;
}

// Prefers the slug-tree permalink (/spots/us/<state>/<locality>/<slug>/<id>,
// see spotRoute.ts's slugObservation/slugPhoto kinds); falls back to the
// numeric-id tree's mirrored .../observations/<id> shape (spotObservation/
// spotPhoto kinds) for a spot that hasn't been slugged yet, so every
// observation/photo always has a real permalink to copy.
export function observationPath(spot: SlugSource, observationId: string): string {
  return spot.slugState && spot.slugLocality && spot.slug
    ? `/spots/us/${spot.slugState}/${spot.slugLocality}/${spot.slug}/${observationId}`
    : `/spots/${spot.spotId}/observations/${observationId}`;
}

export function photoPath(
  spot: SlugSource,
  observationId: string,
  photoId: string,
): string {
  return `${observationPath(spot, observationId)}/${photoId}`;
}
