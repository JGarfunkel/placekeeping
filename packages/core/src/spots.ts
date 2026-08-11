import { db, spots, users } from "@placekeeping/db";
import {
  deriveAccessibility,
  type CreateSpotInput,
  type NearbySpotsQuery,
  type Spot,
  type SpotOption,
  type SpotSummary,
  type UpdateSpotInput,
  type Vegetation,
  type WeedLevel,
} from "@placekeeping/shared-types";
import { and, desc, eq, ilike, isNull, ne, sql } from "drizzle-orm";
import { debugLog } from "./debug";
import { createObservation } from "./observations";
import { findContainingParcel, resolveSiteForParcel } from "./parcels";
import { computeSpotSlug } from "./slug";
import { adjustTerritoryCounts } from "./territory";

const fullSpotColumns = {
  spotId: spots.spotId,
  name: spots.name,
  latitude: sql<number>`ST_Y(${spots.location}::geometry)`.as("latitude"),
  longitude: sql<number>`ST_X(${spots.location}::geometry)`.as("longitude"),
  address: spots.address,
  parcelId: spots.parcelId,
  parcelSbl: spots.parcelSbl,
  resolvedRollYr: spots.resolvedRollYr,
  parcelStatus: spots.parcelStatus,
  addressVisibility: spots.addressVisibility,
  state: spots.state,
  municipality: spots.municipality,
  postalCity: spots.postalCity,
  county: spots.county,
  useMunicipalityForSlug: spots.useMunicipalityForSlug,
  slugState: spots.slugState,
  slugLocality: spots.slugLocality,
  slug: spots.slug,
  sizeSqft: spots.sizeSqft,
  vegetation: spots.vegetation,
  weedLevel: spots.weedLevel,
  educationalComponent: spots.educationalComponent,
  educationalNotes: spots.educationalNotes,
  stewardId: spots.stewardId,
  stewardName: spots.stewardName,
  createdByUserId: spots.createdByUserId,
  siteId: spots.siteId,
  purpose: spots.purpose,
  access: spots.access,
  description: spots.description,
  needs: spots.needs,
  plans: spots.plans,
  website: spots.website,
  coverPhotoUrl: spots.coverPhotoUrl,
  photoAlbumUrl: spots.photoAlbumUrl,
  inaturalistUrl: spots.inaturalistUrl,
  dateAdded: spots.dateAdded,
  lastVerified: spots.lastVerified,
};

function toSpotDto(row: any): Spot {
  return {
    spotId: row.spotId,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    address: row.address,
    parcelId: row.parcelId,
    parcelSbl: row.parcelSbl,
    resolvedRollYr: row.resolvedRollYr,
    parcelStatus: row.parcelStatus,
    addressVisibility: row.addressVisibility,
    state: row.state,
    municipality: row.municipality,
    postalCity: row.postalCity,
    county: row.county,
    useMunicipalityForSlug: row.useMunicipalityForSlug,
    slugState: row.slugState,
    slugLocality: row.slugLocality,
    slug: row.slug,
    sizeSqft: row.sizeSqft === null ? null : Number(row.sizeSqft),
    accessibility: deriveAccessibility(row.access),
    vegetation: row.vegetation as Vegetation | null,
    weedLevel: row.weedLevel as WeedLevel,
    educationalComponent: row.educationalComponent,
    educationalNotes: row.educationalNotes,
    stewardId: row.stewardId,
    stewardName: row.stewardName,
    createdByUserId: row.createdByUserId,
    siteId: row.siteId,
    purpose: row.purpose,
    access: row.access,
    description: row.description,
    needs: row.needs,
    plans: row.plans,
    website: row.website,
    coverPhotoUrl: row.coverPhotoUrl,
    photoAlbumUrl: row.photoAlbumUrl,
    inaturalistUrl: row.inaturalistUrl,
    dateAdded: new Date(row.dateAdded).toISOString(),
    lastVerified: row.lastVerified ? new Date(row.lastVerified).toISOString() : null,
  };
}

export async function findNearbySpots(
  query: NearbySpotsQuery,
): Promise<SpotSummary[]> {
  const radiusMeters = query.radiusMi * 1609.344;
  const origin = sql`ST_MakePoint(${query.lng}, ${query.lat})::geography`;
  const distanceExpr = sql<number>`ST_Distance(${spots.location}, ${origin})`;

  const conditions = [
    sql`ST_DWithin(${spots.location}, ${origin}, ${radiusMeters})`,
  ];
  if (query.stewardId) conditions.push(eq(spots.stewardId, query.stewardId));
  if (query.unstewarded) conditions.push(isNull(spots.stewardId));
  if (query.vegetation) {
    conditions.push(eq(spots.vegetation, query.vegetation));
  }

  const rows = await db
    .select({
      spotId: spots.spotId,
      name: spots.name,
      latitude: sql<number>`ST_Y(${spots.location}::geometry)`.as(
        "latitude",
      ),
      longitude: sql<number>`ST_X(${spots.location}::geometry)`.as(
        "longitude",
      ),
      access: spots.access,
      vegetation: spots.vegetation,
      purpose: spots.purpose,
      weedLevel: spots.weedLevel,
      stewardId: spots.stewardId,
      coverPhotoUrl: spots.coverPhotoUrl,
      slugState: spots.slugState,
      slugLocality: spots.slugLocality,
      slug: spots.slug,
      distanceMeters: distanceExpr,
    })
    .from(spots)
    .where(and(...conditions))
    .orderBy(distanceExpr)
    .limit(50);

  return rows.map((r) => ({
    spotId: r.spotId,
    name: r.name,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    accessibility: deriveAccessibility(r.access),
    vegetation: r.vegetation as Vegetation | null,
    purpose: r.purpose,
    weedLevel: r.weedLevel as WeedLevel,
    stewardId: r.stewardId,
    coverPhotoUrl: r.coverPhotoUrl,
    slugState: r.slugState,
    slugLocality: r.slugLocality,
    slug: r.slug,
    distanceMeters: Number(r.distanceMeters),
  }));
}

export async function searchSpotsByName(
  query: string,
  excludeSpotId?: number,
): Promise<SpotOption[]> {
  const conditions = [ilike(spots.name, `%${query}%`)];
  if (excludeSpotId) conditions.push(ne(spots.spotId, excludeSpotId));

  const rows = await db
    .select({
      spotId: spots.spotId,
      name: spots.name,
      municipality: spots.municipality,
    })
    .from(spots)
    .where(and(...conditions))
    .orderBy(spots.name)
    .limit(10);

  return rows;
}

export async function listSpotsBySite(siteId: number): Promise<SpotSummary[]> {
  const rows = await db
    .select({
      spotId: spots.spotId,
      name: spots.name,
      latitude: sql<number>`ST_Y(${spots.location}::geometry)`.as("latitude"),
      longitude: sql<number>`ST_X(${spots.location}::geometry)`.as(
        "longitude",
      ),
      access: spots.access,
      vegetation: spots.vegetation,
      purpose: spots.purpose,
      weedLevel: spots.weedLevel,
      stewardId: spots.stewardId,
      coverPhotoUrl: spots.coverPhotoUrl,
      slugState: spots.slugState,
      slugLocality: spots.slugLocality,
      slug: spots.slug,
    })
    .from(spots)
    .where(eq(spots.siteId, siteId))
    .orderBy(spots.name);

  return rows.map((r) => ({
    spotId: r.spotId,
    name: r.name,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    accessibility: deriveAccessibility(r.access),
    vegetation: r.vegetation as Vegetation | null,
    purpose: r.purpose,
    weedLevel: r.weedLevel as WeedLevel,
    stewardId: r.stewardId,
    coverPhotoUrl: r.coverPhotoUrl,
    slugState: r.slugState,
    slugLocality: r.slugLocality,
    slug: r.slug,
  }));
}

export async function listSpotsBySteward(stewardId: string): Promise<SpotSummary[]> {
  const rows = await db
    .select({
      spotId: spots.spotId,
      name: spots.name,
      latitude: sql<number>`ST_Y(${spots.location}::geometry)`.as("latitude"),
      longitude: sql<number>`ST_X(${spots.location}::geometry)`.as(
        "longitude",
      ),
      access: spots.access,
      vegetation: spots.vegetation,
      purpose: spots.purpose,
      weedLevel: spots.weedLevel,
      stewardId: spots.stewardId,
      coverPhotoUrl: spots.coverPhotoUrl,
      slugState: spots.slugState,
      slugLocality: spots.slugLocality,
      slug: spots.slug,
    })
    .from(spots)
    .where(eq(spots.stewardId, stewardId))
    .orderBy(spots.name);

  return rows.map((r) => ({
    spotId: r.spotId,
    name: r.name,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    accessibility: deriveAccessibility(r.access),
    vegetation: r.vegetation as Vegetation | null,
    purpose: r.purpose,
    weedLevel: r.weedLevel as WeedLevel,
    stewardId: r.stewardId,
    coverPhotoUrl: r.coverPhotoUrl,
    slugState: r.slugState,
    slugLocality: r.slugLocality,
    slug: r.slug,
  }));
}

// For the profile page's "created spots" list. Keyed on the creating user
// (not a steward), so it works even for a creator who never registered as
// a steward themselves.
export async function listSpotsByCreator(
  createdByUserId: string,
  limit = 20,
): Promise<SpotSummary[]> {
  const rows = await db
    .select({
      spotId: spots.spotId,
      name: spots.name,
      latitude: sql<number>`ST_Y(${spots.location}::geometry)`.as("latitude"),
      longitude: sql<number>`ST_X(${spots.location}::geometry)`.as(
        "longitude",
      ),
      access: spots.access,
      vegetation: spots.vegetation,
      purpose: spots.purpose,
      weedLevel: spots.weedLevel,
      stewardId: spots.stewardId,
      coverPhotoUrl: spots.coverPhotoUrl,
      slugState: spots.slugState,
      slugLocality: spots.slugLocality,
      slug: spots.slug,
    })
    .from(spots)
    .where(eq(spots.createdByUserId, createdByUserId))
    .orderBy(sql`${spots.dateAdded} desc`)
    .limit(limit);

  return rows.map((r) => ({
    spotId: r.spotId,
    name: r.name,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    accessibility: deriveAccessibility(r.access),
    vegetation: r.vegetation as Vegetation | null,
    purpose: r.purpose,
    weedLevel: r.weedLevel as WeedLevel,
    stewardId: r.stewardId,
    coverPhotoUrl: r.coverPhotoUrl,
    slugState: r.slugState,
    slugLocality: r.slugLocality,
    slug: r.slug,
  }));
}

// Backs the admin dashboard's recent-activity log (apps/web /admin).
export async function listRecentSpots(limit = 10): Promise<
  Array<{
    spotId: number;
    name: string;
    createdByUsername: string | null;
    dateAdded: string;
  }>
> {
  const rows = await db
    .select({
      spotId: spots.spotId,
      name: spots.name,
      createdByUsername: users.username,
      dateAdded: spots.dateAdded,
    })
    .from(spots)
    .leftJoin(users, eq(users.userId, spots.createdByUserId))
    .orderBy(desc(spots.dateAdded))
    .limit(limit);

  return rows.map((r) => ({ ...r, dateAdded: r.dateAdded.toISOString() }));
}

export async function getSpotById(spotId: number): Promise<Spot | null> {
  const [row] = await db
    .select(fullSpotColumns)
    .from(spots)
    .where(eq(spots.spotId, spotId))
    .limit(1);
  return row ? toSpotDto(row) : null;
}

export async function createSpot(
  input: CreateSpotInput,
  creatorStewardId: string | null,
  creatorUserId: string | null,
): Promise<Spot> {
  debugLog("[spots] createSpot", input, "creatorStewardId", creatorStewardId);
  const useMunicipalityForSlug = input.useMunicipalityForSlug ?? false;

  // Local containment (local/spot-resolution.md §1/§3): a cached parcel
  // polygon covering this point resolves parcel + (if already grouped) site
  // with zero network calls. Only runs when the caller hasn't already
  // supplied a siteId explicitly. Resolved ahead of the slug/insert below so
  // a parcel-derived address/municipality/county (see next comment) can
  // feed both.
  const containingParcel = await findContainingParcel(
    input.latitude,
    input.longitude,
  );
  const resolvedSite =
    containingParcel && input.siteId === undefined
      ? await resolveSiteForParcel(containingParcel.swisSblId)
      : null;

  // Per local/parcel-discovery.md: derive address/municipality/county from
  // the resolved parcel rather than a separate geocode lookup, but only to
  // fill in what the caller didn't already supply -- an explicit client
  // value (e.g. from Google reverse-geocoding, where available) still wins.
  // The parcel service is NY-only, so a resolved parcel implies state "NY".
  const resolvedAddress = input.address ?? containingParcel?.address ?? undefined;
  const resolvedState = input.state ?? (containingParcel ? "NY" : undefined);
  const resolvedMunicipality =
    input.municipality ?? containingParcel?.muniName ?? undefined;
  const resolvedCounty = input.county ?? containingParcel?.countyName ?? undefined;

  const { slugState, slugLocality, slug } = await computeSpotSlug({
    name: input.name,
    state: resolvedState,
    municipality: resolvedMunicipality,
    postalCity: input.postalCity,
    useMunicipalityForSlug,
  });

  const [row] = await db
    .insert(spots)
    .values({
      name: input.name,
      location: sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography`,
      address: resolvedAddress,
      parcelId: input.parcelId,
      parcelSbl: containingParcel?.swisSblId,
      resolvedRollYr: containingParcel?.rollYr ?? undefined,
      parcelStatus: containingParcel ? "resolved" : undefined,
      addressVisibility: input.addressVisibility,
      state: resolvedState,
      municipality: resolvedMunicipality,
      postalCity: input.postalCity,
      county: resolvedCounty,
      useMunicipalityForSlug,
      slugState,
      slugLocality,
      slug,
      sizeSqft:
        input.sizeSqft !== undefined ? String(input.sizeSqft) : undefined,
      vegetation: input.vegetation,
      weedLevel: input.weedLevel,
      educationalComponent: input.educationalComponent,
      educationalNotes: input.educationalNotes,
      stewardId: input.stewardId ?? creatorStewardId,
      stewardName: input.stewardName,
      createdByUserId: creatorUserId,
      siteId: input.siteId ?? resolvedSite?.siteId,
      purpose: input.purpose,
      access: input.access,
      description: input.description,
      needs: input.needs,
      plans: input.plans,
      website: input.website,
      coverPhotoUrl: input.coverPhotoUrl,
      photoAlbumUrl: input.photoAlbumUrl,
      inaturalistUrl: input.inaturalistUrl,
    })
    .returning({ spotId: spots.spotId });

  const created = await getSpotById(row.spotId);
  if (!created) throw new Error("Failed to load created spot");
  debugLog("[spots] createSpot saved", created.spotId, "stewardId", created.stewardId);
  await adjustTerritoryCounts(created, 1);

  // The cover photo supplied at creation time is always the photo the spot
  // was created from (see QuickAddSpotDialog / the /spots/new?coverPhotoUrl
  // flow from UploadPhotoDialog) -- log it as the spot's first observation
  // rather than letting it exist only as coverPhotoUrl with no sighting
  // record behind it.
  if (input.coverPhotoUrl) {
    await createObservation(
      row.spotId,
      { photoUrls: [input.coverPhotoUrl], observedAt: input.coverPhotoObservedAt },
      creatorUserId,
    );
  }

  return created;
}

export async function updateSpot(
  spotId: number,
  input: UpdateSpotInput,
): Promise<Spot | null> {
  // coverPhotoObservedAt only ever backdates the one-time observation
  // createSpot logs alongside a new cover photo -- not a spots column, so it
  // must not reach the update() call below.
  const { latitude, longitude, sizeSqft, coverPhotoObservedAt: _coverPhotoObservedAt, ...rest } = input;
  debugLog("[spots] updateSpot", spotId, input);

  // Fetched unconditionally (not just when slug-relevant fields change) --
  // adjustTerritoryCounts below needs the pre-update territory/category
  // fields regardless of what's actually changing, to decrement the old
  // bucket before incrementing the new one.
  const [current] = await db
    .select({
      name: spots.name,
      state: spots.state,
      municipality: spots.municipality,
      postalCity: spots.postalCity,
      county: spots.county,
      useMunicipalityForSlug: spots.useMunicipalityForSlug,
      stewardId: spots.stewardId,
      purpose: spots.purpose,
    })
    .from(spots)
    .where(eq(spots.spotId, spotId))
    .limit(1);

  if (!current) return null;

  const slugInputsChanged =
    input.name !== undefined ||
    input.state !== undefined ||
    input.municipality !== undefined ||
    input.postalCity !== undefined ||
    input.useMunicipalityForSlug !== undefined;

  let slugFields:
    | { slugState: string | null; slugLocality: string | null; slug: string | null }
    | undefined;
  if (slugInputsChanged) {
    slugFields = await computeSpotSlug(
      {
        name: input.name ?? current.name,
        state: input.state ?? current.state,
        municipality: input.municipality ?? current.municipality,
        postalCity: input.postalCity ?? current.postalCity,
        useMunicipalityForSlug:
          input.useMunicipalityForSlug ?? current.useMunicipalityForSlug,
      },
      spotId,
    );
  }

  await db
    .update(spots)
    .set({
      ...rest,
      ...(sizeSqft !== undefined ? { sizeSqft: String(sizeSqft) } : {}),
      ...(latitude !== undefined && longitude !== undefined
        ? {
            location: sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`,
          }
        : {}),
      ...(slugFields ?? {}),
      lastVerified: new Date(),
    })
    .where(eq(spots.spotId, spotId));

  const updated = await getSpotById(spotId);
  debugLog(
    "[spots] updateSpot saved",
    spotId,
    "stewardId",
    current.stewardId,
    "->",
    updated?.stewardId,
  );
  if (updated) {
    await adjustTerritoryCounts(current, -1);
    await adjustTerritoryCounts(updated, 1);
  }
  return updated;
}

export async function getSpotBySlug(
  slugState: string,
  slugLocality: string,
  slug: string,
): Promise<Spot | null> {
  debugLog("[spots] getSpotBySlug query", { slugState, slugLocality, slug });
  const [row] = await db
    .select(fullSpotColumns)
    .from(spots)
    .where(
      and(
        eq(spots.slugState, slugState),
        eq(spots.slugLocality, slugLocality),
        eq(spots.slug, slug),
      ),
    )
    .limit(1);
  debugLog("[spots] getSpotBySlug result", row ? `spotId=${row.spotId}` : "no row");
  return row ? toSpotDto(row) : null;
}

// Observations cascade-delete via the DB FK (observations.spot_id ->
// spots.spot_id ON DELETE CASCADE) -- no explicit cleanup needed here.
export async function deleteSpot(spotId: number): Promise<void> {
  const [current] = await db
    .select({
      state: spots.state,
      municipality: spots.municipality,
      postalCity: spots.postalCity,
      county: spots.county,
      useMunicipalityForSlug: spots.useMunicipalityForSlug,
      stewardId: spots.stewardId,
      purpose: spots.purpose,
    })
    .from(spots)
    .where(eq(spots.spotId, spotId))
    .limit(1);

  await db.delete(spots).where(eq(spots.spotId, spotId));

  if (current) {
    await adjustTerritoryCounts(current, -1);
  }
}
