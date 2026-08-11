import { db, parcels, siteParcels, sites } from "@placekeeping/db";
import type {
  MultiPolygonGeometry,
  Parcel,
  ParcelCandidate,
  ParcelFieldMap,
  ParcelLookupResult,
  ParcelOwnerInfo,
  Site,
  Spot,
  StateConfig,
} from "@placekeeping/shared-types";
import { DEFAULT_STATE_CODE, getStateConfig, statesForPoint } from "@placekeeping/shared-types";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { logRemoteCall } from "./remoteLog";
import { toSiteDto } from "./sites";

// The configured state's tax-parcel service endpoint, falling back to
// DEFAULT_STATE_CODE's when the given/found state has no parcels config
// (or no state is known yet) -- keeps every parcel-service call working
// exactly as before for NY while being state-driven for a future state.
function parcelServiceConfig(stateCode?: string | null): StateConfig["parcels"] {
  return (
    (stateCode ? getStateConfig(stateCode)?.parcels : undefined) ??
    getStateConfig(DEFAULT_STATE_CODE)?.parcels
  );
}

// Owner-only NY field names (PRIMARY_OWNER/ADD_OWNER/OWNER_TYPE) -- these
// stay hardcoded/NY-specific since fetchParcelOwner is only ever reached
// for a state whose isInstitutionalClass can return true, which requires a
// classAllowlist. NJ/MA have none yet (see their state config files), so
// this path is unreachable for them until that's built.
const OWNER_ONLY_OUT_FIELDS = "PRIMARY_OWNER,ADD_OWNER,OWNER_TYPE";

// Builds the outFields list from a state's field map -- every ArcGIS field
// name mentioned anywhere in the map (deduplicated), nothing else. This is
// the request-time half of the owner-data guarantee: an owner/assessment
// field that isn't named in the map is never requested from the service at
// all (see toParcelDto below for the read-time half, which is the actual
// guarantee -- this is just a smaller-payload nicety on top of it).
export function outFieldsFor(fields: ParcelFieldMap): string {
  const names = [
    fields.externalId,
    fields.county,
    fields.municipality,
    fields.address,
    fields.propertyClass,
    fields.acres,
    fields.swis,
    fields.spatialYr,
    fields.printKey,
    fields.stateOwnedLabel,
    fields.vintageYearField,
    fields.vintageDateField,
  ].filter((field): field is string => field !== undefined);
  return Array.from(new Set(names)).join(",");
}

function readString(properties: Record<string, unknown>, field: string | undefined): string | null {
  if (!field) return null;
  const value = properties[field];
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function readNumber(properties: Record<string, unknown>, field: string | undefined): number | null {
  if (!field) return null;
  const value = properties[field];
  return typeof value === "number" ? value : null;
}

// A parcel's "vintage year" -- NY/MA have a genuine int field for this
// (ROLL_YR/FY); NJ only has an update date, so a year gets derived from it.
// Always returns a real number, never null: this becomes part of the DB's
// natural key (see cacheParcel), and a state that always inserted a null
// here would silently accumulate duplicate rows on every re-fetch instead
// of updating in place, since Postgres unique indexes treat NULL as never
// equal to another NULL.
function vintageYear(fields: ParcelFieldMap, properties: Record<string, unknown>): number {
  if (fields.vintageYearField) {
    const value = properties[fields.vintageYearField];
    if (typeof value === "number") return value;
  }
  if (fields.vintageDateField) {
    const raw = properties[fields.vintageDateField];
    if (typeof raw === "string" || typeof raw === "number") {
      const year = new Date(raw).getFullYear();
      if (!Number.isNaN(year)) return year;
    }
  }
  return new Date().getFullYear();
}

export interface FetchedParcel extends Parcel {
  // Normalized GeoJSON geometry (see toMultiPolygonGeometry) -- always
  // MultiPolygon regardless of whether the ArcGIS response itself was a
  // single-part "Polygon" or a "MultiPolygon". Passed straight through to
  // ST_GeomFromGeoJSON on cache; the base Parcel DTO stays geometry-free,
  // but NearbyParcel/ParcelCandidate (below) does carry it, for the
  // candidate-picker map.
  geometry: MultiPolygonGeometry;
  // Which configured state's parcel service this came from -- there's no
  // state column on the `parcels` table, so cacheParcel folds this into the
  // `source` value instead (see cacheParcel below). Internal bookkeeping
  // only; stripped back out in toParcelCandidate before the wire response.
  stateCode: string;
}

// The ArcGIS service returns GeoJSON type "Polygon" for any single-part
// parcel and "MultiPolygon" only for genuinely multi-part ones -- mirrors
// the ST_Multi() upconversion cacheParcel already applies at the DB layer,
// but done in application code too since parcelContainsPoint and the
// candidate DTO shipped to the client both need it before anything reaches
// Postgres.
function toMultiPolygonGeometry(geometry: {
  type: string;
  coordinates: unknown;
}): MultiPolygonGeometry {
  if (geometry.type === "MultiPolygon") {
    return geometry as MultiPolygonGeometry;
  }
  return {
    type: "MultiPolygon",
    coordinates: [geometry.coordinates as number[][][]],
  };
}

// The exact ST_Covers query from local/spot-resolution.md §3. Read-only, no
// network -- this is the "zero network calls" path createSpot relies on.
// Use ST_Covers, not ST_Contains: a pin on a shared lot line must still
// count as inside.
export async function findContainingParcel(
  lat: number,
  lng: number,
): Promise<{
  swisSblId: string;
  rollYr: number | null;
  address: string | null;
  muniName: string | null;
  countyName: string | null;
} | null> {
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
  const [row] = await db
    .select({
      swisSblId: parcels.swisSblId,
      rollYr: parcels.rollYr,
      address: parcels.address,
      muniName: parcels.muniName,
      countyName: parcels.countyName,
    })
    .from(parcels)
    .where(sql`ST_Covers(${parcels.geom}, ${point})`)
    .orderBy(desc(parcels.rollYr))
    .limit(1);
  return row ?? null;
}

const parcelColumns = {
  swisSblId: parcels.swisSblId,
  swis: parcels.swis,
  printKey: parcels.printKey,
  address: parcels.address,
  countyName: parcels.countyName,
  muniName: parcels.muniName,
  cityTownName: parcels.cityTownName,
  propClass: parcels.propClass,
  calcAcres: parcels.calcAcres,
  nysName: parcels.nysName,
  rollYr: parcels.rollYr,
  spatialYr: parcels.spatialYr,
  ownerRevealedAt: parcels.ownerRevealedAt,
};

function toParcelDtoFromRow(row: any): Parcel {
  return {
    ...row,
    calcAcres: row.calcAcres === null ? null : Number(row.calcAcres),
    ownerRevealedAt: row.ownerRevealedAt
      ? new Date(row.ownerRevealedAt).toISOString()
      : null,
  };
}

// The most recently cached roll year for this parcel identifier. Used by
// the owner route to re-validate isInstitutionalClass server-side before
// ever calling fetchParcelOwner -- the gate isn't just button visibility.
export async function getCachedParcel(swisSblId: string): Promise<Parcel | null> {
  const [row] = await db
    .select(parcelColumns)
    .from(parcels)
    .where(eq(parcels.swisSblId, swisSblId))
    .orderBy(desc(parcels.rollYr))
    .limit(1);
  return row ? toParcelDtoFromRow(row) : null;
}

// Marks every cached roll-year row for this parcel identifier as revealed --
// owner identity doesn't change by roll year, so the "already shown" fact
// applies to the parcel, not a specific cached snapshot of it. Never stores
// the owner string itself.
export async function markOwnerRevealed(swisSblId: string): Promise<void> {
  await db
    .update(parcels)
    .set({ ownerRevealedAt: new Date() })
    .where(eq(parcels.swisSblId, swisSblId));
}

export async function resolveSiteForParcel(
  swisSblId: string,
): Promise<Site | null> {
  const [row] = await db
    .select({
      siteId: sites.siteId,
      name: sites.name,
      purpose: sites.purpose,
      gisOpenSpace: sites.gisOpenSpace,
      gisLandUse: sites.gisLandUse,
      hnpMapNumber: sites.hnpMapNumber,
      stewardshipProgram: sites.stewardshipProgram,
      stewardshipRef: sites.stewardshipRef,
      createdAt: sites.createdAt,
      updatedAt: sites.updatedAt,
    })
    .from(siteParcels)
    .innerJoin(sites, eq(sites.siteId, siteParcels.siteId))
    .where(eq(siteParcels.swisSblId, swisSblId))
    .limit(1);
  return row ? toSiteDto(row) : null;
}

// The read-time half of the owner-data guarantee (see outFieldsFor above):
// only fields named in `fields` are ever read out of the raw ArcGIS
// properties bag, regardless of what else the response contains -- an
// owner/assessment field that isn't named in a state's ParcelFieldMap
// simply never reaches this DTO, cacheParcel, the DB, or a client.
export function toParcelDto(fields: ParcelFieldMap, properties: Record<string, unknown>): Parcel {
  return {
    swisSblId: readString(properties, fields.externalId) ?? "",
    swis: readString(properties, fields.swis),
    printKey: readString(properties, fields.printKey),
    address: readString(properties, fields.address),
    countyName: readString(properties, fields.county),
    muniName: readString(properties, fields.municipality),
    cityTownName: null,
    propClass: readString(properties, fields.propertyClass),
    calcAcres: readNumber(properties, fields.acres),
    nysName: readString(properties, fields.stateOwnedLabel),
    rollYr: vintageYear(fields, properties),
    spatialYr: readNumber(properties, fields.spatialYr),
    // Freshly fetched, not yet read back from the cache -- callers that
    // need the authoritative value (e.g. the Find Parcel route) re-read via
    // getCachedParcel after cacheParcel() instead of trusting this.
    ownerRevealedAt: null,
  };
}

// Even-odd ray cast, XOR'd across every ring of every polygon in the
// MultiPolygon -- correctly treats a second (or later) ring on the same
// polygon as a hole. Pure JS, no geometry dependency: this only needs to
// flag which discovered candidate actually covers the pin, as a hint in the
// picker UI (local/spot-resolution.md §4), not a source of truth.
export function parcelContainsPoint(
  geometry: MultiPolygonGeometry,
  lat: number,
  lng: number,
): boolean {
  return geometry.coordinates.some((rings) => {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const crosses =
          yi > lat !== yj > lat &&
          lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (crosses) inside = !inside;
      }
    }
    return inside;
  });
}

const NEARBY_RADIUS_METERS = 15;
const NEARBY_LIMIT = 5;

export interface NearbyParcel extends FetchedParcel {
  containsPin: boolean;
}

// NearbyParcel and ParcelCandidate happen to carry the same fields today,
// minus the internal-only stateCode -- this indirection exists so the route
// layer has one clearly-named conversion point rather than passing the
// internal fetch/cache type straight through as the API response shape.
export function toParcelCandidate(p: NearbyParcel): ParcelCandidate {
  const { stateCode: _stateCode, ...candidate } = p;
  return candidate;
}

async function fetchNearbyParcelsForState(
  stateCode: string,
  parcelConfig: NonNullable<StateConfig["parcels"]>,
  lat: number,
  lng: number,
): Promise<NearbyParcel[]> {
  const url = new URL(parcelConfig.queryUrl);
  url.searchParams.set("geometry", `${lng},${lat}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("distance", String(NEARBY_RADIUS_METERS));
  url.searchParams.set("units", "esriSRUnit_Meter");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", outFieldsFor(parcelConfig.fields));
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("resultRecordCount", String(NEARBY_LIMIT));
  url.searchParams.set("f", "geojson");

  const response = await logRemoteCall("arcgis", `nearby-parcels:${stateCode}`, () => fetch(url));
  if (!response.ok) {
    throw new Error(`ArcGIS parcel query failed (${stateCode}): ${response.status}`);
  }
  const body = (await response.json()) as {
    features: Array<{
      type: "Feature";
      geometry: { type: string; coordinates: unknown };
      properties: Record<string, unknown>;
    }>;
  };

  return body.features.map((feature) => {
    const geometry = toMultiPolygonGeometry(feature.geometry);
    return {
      ...toParcelDto(parcelConfig.fields, feature.properties),
      geometry,
      stateCode,
      containsPin: parcelContainsPoint(geometry, lat, lng),
    };
  });
}

// Live, owner-free buffered query against the state's ArcGIS service --
// searches a small radius around the pin instead of trusting a single
// point-intersect hit, so a mis-set pin (e.g. sitting in a public road) has
// a chance of surfacing the actually-correct neighboring parcel as a choice
// instead of silently linking to whatever the point happened to land on.
// Returns [] on an empty result set (water / ROW / an uncovered county, or a
// point outside every configured state's bounding box) -- that's a normal
// outcome, not an error; see local/spot-resolution.md §4. Results are
// pre-sorted contains-pin-first, then smallest-acreage-first -- the two
// signals that would have caught the site #2 bug (a 300+ acre street ROW
// parcel that didn't even cover the pin).
export async function fetchNearbyParcels(
  lat: number,
  lng: number,
): Promise<NearbyParcel[]> {
  const candidateStates = statesForPoint(lat, lng).filter((state) => state.parcels);

  const results = await Promise.all(
    candidateStates.map((state) =>
      fetchNearbyParcelsForState(state.code, state.parcels!, lat, lng),
    ),
  );

  return results.flat().sort((a, b) => {
    if (a.containsPin !== b.containsPin) return a.containsPin ? -1 : 1;
    return (a.calcAcres ?? Infinity) - (b.calcAcres ?? Infinity);
  });
}

// Single shared read for GET /parcel/lookup and the tail of POST
// /parcel/select -- keeps both surfaces reporting the exact same shape for
// a given spot's persisted state.
export async function getParcelLookupResult(spot: Spot): Promise<ParcelLookupResult> {
  if (spot.parcelSbl) {
    const parcel = await getCachedParcel(spot.parcelSbl);
    if (parcel) {
      return {
        status: "resolved",
        parcel,
        isInstitutionalClass: isInstitutionalClass(parcel.propClass, parcel.nysName, spot.state),
        site: await resolveSiteForParcel(parcel.swisSblId),
      };
    }
  }
  if (spot.parcelStatus === "no_parcel") {
    return { status: "no_parcel" };
  }
  return { status: "unresolved" };
}

// Only ever called from the gated owner-reveal path (see
// isInstitutionalClass / the /parcel/owner route) -- never from the
// discovery/select parcel-lookup path. Transient: the result is never
// cached. stateCode should be the owning spot's `state` -- falls back to
// DEFAULT_STATE_CODE's service when unset (legacy spots predating the
// `state` field).
export async function fetchParcelOwner(
  swisSblId: string,
  stateCode?: string | null,
): Promise<{ primaryOwner: string | null; addOwner: string | null } | null> {
  const config = parcelServiceConfig(stateCode);
  if (!config) return null;
  const url = new URL(config.queryUrl);
  url.searchParams.set(
    "where",
    `${config.fields.externalId}='${swisSblId.replace(/'/g, "''")}'`,
  );
  url.searchParams.set("outFields", OWNER_ONLY_OUT_FIELDS);
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");

  const response = await logRemoteCall("arcgis", "owner-lookup", () => fetch(url));
  if (!response.ok) {
    throw new Error(`ArcGIS owner query failed: ${response.status}`);
  }
  const body = (await response.json()) as {
    features: Array<{ attributes: { PRIMARY_OWNER: string | null; ADD_OWNER: string | null } }>;
  };

  const feature = body.features[0];
  if (!feature) return null;
  return {
    primaryOwner: feature.attributes.PRIMARY_OWNER,
    addOwner: feature.attributes.ADD_OWNER,
  };
}

// Upserts on the (stateCode, swisSblId, rollYr) natural key. The parcels
// table stays owner-free permanently -- this only ever receives
// FetchedParcel, which has no owner field to begin with.
export async function cacheParcel(parcel: FetchedParcel): Promise<void> {
  await db
    .insert(parcels)
    .values({
      stateCode: parcel.stateCode,
      swisSblId: parcel.swisSblId,
      swis: parcel.swis,
      printKey: parcel.printKey,
      address: parcel.address,
      countyName: parcel.countyName,
      muniName: parcel.muniName,
      cityTownName: parcel.cityTownName,
      propClass: parcel.propClass,
      calcAcres: parcel.calcAcres !== null ? String(parcel.calcAcres) : null,
      nysName: parcel.nysName,
      rollYr: parcel.rollYr,
      spatialYr: parcel.spatialYr,
      geom: sql`ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(parcel.geometry)})), 4326)`,
      // Mirrors the state-tagged `source` values territory.ts writes for
      // subdivisions (e.g. "nys-civil-boundaries:${type}").
      source: `${parcel.stateCode}-parcels`,
    })
    .onConflictDoUpdate({
      target: [parcels.stateCode, parcels.swisSblId, parcels.rollYr],
      set: {
        source: `${parcel.stateCode}-parcels`,
        fetchedAt: new Date(),
      },
    });
}

// State land bypasses the class table entirely: NYS_NAME is a pre-assigned
// public agency label, not an owner query, so it's always safe to reveal.
// stateCode should be the owning spot's `state` -- falls back to
// DEFAULT_STATE_CODE's allowlist when unset (legacy spots predating the
// `state` field).
export function isInstitutionalClass(
  propClass: string | null,
  nysName: string | null,
  stateCode?: string | null,
): boolean {
  if (nysName) return true;
  if (!propClass) return false;
  const series = propClass.charAt(0);
  const allowlist = parcelServiceConfig(stateCode)?.classAllowlist ?? [];
  const entry = allowlist.find((s) => s.series === series);
  return entry?.autoReveal ?? false;
}

// Fail-closed entity heuristic from local/spot-resolution.md §7: no
// organization marker -> treat as a natural person -> false. NY assessment
// names for individuals are typically "LASTNAME FIRSTNAME" with no marker.
const ENTITY_MARKERS = [
  "LLC",
  "INC",
  "CORP",
  "LP",
  "LLP",
  "TRUST",
  "TOWN OF",
  "CITY OF",
  "VILLAGE OF",
  "COUNTY OF",
  "STATE OF",
  "AUTHORITY",
  "DISTRICT",
  "CHURCH",
  "DIOCESE",
  "UNIVERSITY",
  "COLLEGE",
  "SCHOOL",
  "ASSOCIATION",
  "FOUNDATION",
  "CONSERVANCY",
  "LAND TRUST",
  "HOA",
  "PARTNERS",
  "HOLDINGS",
  "PROPERTIES",
  "LTD",
];

export function looksLikeEntity(ownerName: string | null): boolean {
  if (!ownerName) return false;
  const upper = ownerName.toUpperCase();
  return ENTITY_MARKERS.some((marker) => upper.includes(marker));
}

// Show Owner (local/spot-resolution.md §5): gated by the caller re-checking
// isInstitutionalClass against the cached parcel row before this is ever
// invoked. Returns the entity-only name suggestion alongside the raw owner
// strings; neither is ever persisted.
export async function getParcelOwnerInfo(
  swisSblId: string,
  stateCode?: string | null,
): Promise<ParcelOwnerInfo | null> {
  const owner = await fetchParcelOwner(swisSblId, stateCode);
  if (!owner) return null;
  await markOwnerRevealed(swisSblId);
  const suggestedSiteName = looksLikeEntity(owner.primaryOwner)
    ? owner.primaryOwner
    : null;
  return { ...owner, suggestedSiteName };
}

export interface SiteCandidateMatch {
  site: Site;
  // The neighboring parcel that put this site in the candidate list --
  // needed by the route layer to fetch that parcel's owner for the
  // ownerMatch comparison (institutional classes only).
  neighborSwisSblId: string;
}

// Neighboring-parcel candidates for the site-join flow (§6.2). Never used
// to auto-join -- only to present candidates for an explicit user pick.
// ownerMatch is computed by the caller (route layer), which is the only
// place both the resolved parcel's and each candidate's owner are fetched.
export async function findCandidateSites(
  swisSblId: string,
): Promise<SiteCandidateMatch[]> {
  // 0.0001 degrees (~11m at NY latitudes) as the "small buffer" from
  // local/spot-resolution.md §6.2 -- covers ST_Touches plus parcels
  // separated by a thin gap (a shared driveway, a sliver ROW). The target
  // geom is looked up via a plain correlated subquery rather than embedding
  // a drizzle query builder inside the sql tag, to keep the parameter
  // binding unambiguous.
  const rows = await db
    .selectDistinctOn([sites.siteId], {
      siteId: sites.siteId,
      name: sites.name,
      purpose: sites.purpose,
      gisOpenSpace: sites.gisOpenSpace,
      gisLandUse: sites.gisLandUse,
      hnpMapNumber: sites.hnpMapNumber,
      stewardshipProgram: sites.stewardshipProgram,
      stewardshipRef: sites.stewardshipRef,
      createdAt: sites.createdAt,
      updatedAt: sites.updatedAt,
      neighborSwisSblId: parcels.swisSblId,
    })
    .from(parcels)
    .innerJoin(siteParcels, eq(siteParcels.swisSblId, parcels.swisSblId))
    .innerJoin(sites, eq(sites.siteId, siteParcels.siteId))
    .where(
      and(
        ne(parcels.swisSblId, swisSblId),
        sql`ST_DWithin(${parcels.geom}, (SELECT geom FROM parcels WHERE swis_sbl_id = ${swisSblId} LIMIT 1), 0.0001)`,
      ),
    );

  return rows.map((row) => ({
    site: toSiteDto(row),
    neighborSwisSblId: row.neighborSwisSblId,
  }));
}
