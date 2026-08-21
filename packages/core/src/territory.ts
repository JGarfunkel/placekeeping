import { db, subdivisions } from "@placekeeping/db";
import type {
  CivilBoundariesConfig,
  MunicipalityLayerConfig,
  MunicipalityType,
  TerritoryLevel,
  TerritoryType,
} from "@placekeeping/shared-types";
import { getStateConfig } from "@placekeeping/shared-types";
import { and, eq, ilike, inArray, like, sql } from "drizzle-orm";
import { debugLog } from "./debug";
import { logRemoteCall } from "./remoteLog";

// Municipal-level (county/city/town/village) territory resolution only
// works for states with a `civilBoundaries` entry in the per-state config
// (packages/shared-types/src/states) -- today, only NY. Any other state
// falls through to the nationwide ZIP fallback below. Same ArcGIS
// FeatureServer/query pattern already used for tax parcels in parcels.ts.

// Nationwide state boundaries (all 50 states + DC/territories), confirmed
// live while adding CT support -- STUSAB is the 2-letter postal code (our
// `sc`), NAME is the full display name. Unlike the NY layers above, this
// covers every state, so resolveState below isn't NY-restricted.
const US_STATES_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/15";

// Nationwide ZIP-code boundaries, confirmed live while adding zip fallback
// support -- PO_NAME is the USPS-preferred city name (what a spot's
// postalCity field actually holds), ZIP_CODE/STATE/POPULATION round it out.
// Not a US-government service (Esri-hosted, TomTom-sourced), unlike the two
// above, but public/no-auth and the only free source found that's
// queryable by postal city name rather than ZIP code alone. Used as the
// last-resort fallback in resolveMunicipality below -- and unlike the NY
// civil-boundaries service, this one is nationwide.
const ZIP_BOUNDARIES_URL =
  "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/USA_Boundaries_2023/FeatureServer/3";

// Nationwide Census Designated Places -- the informal "locale" name people
// actually use (Chappaqua, Katonah), distinct from both the governing
// municipality and the ZIP delivery area. Confirmed live 2026-08: layer 5
// of this MapServer is the current-vintage CDP layer, with a real GEOID and
// polygon (e.g. Chappaqua CDP -> GEOID 3613805) -- unlike ZIP_BOUNDARIES_URL
// above (Esri/TomTom ZIP delivery-area polygons, no GEOID, not a real named
// place). Tried between civil boundaries and the ZIP fallback in
// resolveMunicipality: a real government jurisdiction always wins over a
// same-named CDP, and a CDP always wins over the ZIP-area approximation.
const CDP_BOUNDARIES_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/5";

// Re-exported for existing consumers (backfillSubdivisions.ts, tests) --
// the type itself now lives in shared-types since CivilBoundariesConfig
// needs it too, and shared-types can't depend back on core.
export type { MunicipalityType };

export interface TerritoryResolution {
  level: TerritoryLevel;
  path: string;
  name: string;
  county: string | null;
  type: TerritoryType | null;
  centerLat: number;
  centerLng: number;
  zoom: number;
  // A stable government-assigned ID (see subdivisions.externalId in
  // schema.ts) -- null for a source with no such field on record.
  externalId: string | null;
}

export interface MunicipalityAmbiguity {
  ambiguous: true;
  options: { name: string; type: MunicipalityType; county: string | null }[];
}

// Process-level cache in front of the DB table -- avoids a DB round trip on
// every hit within one server process's lifetime. `subdivisions` is the
// persistent/progressive store (only ever written the first time a
// territory is actually requested); this is a pure perf layer on top of it,
// and also holds alias spellings (e.g. "ossining" -> the "ossining-town"
// row) that are never worth their own DB row.
const resolutionCache = new Map<string, TerritoryResolution>();

function rowToResolution(row: {
  level: number;
  path: string;
  name: string;
  county: string | null;
  type: string | null;
  externalId: string | null;
  centerLat: string | null;
  centerLng: string | null;
  zoom: number | null;
}): TerritoryResolution | null {
  // A row can exist with spotCounts but no boundary yet (bumped by a spot
  // save before anyone has visited this territory's page) -- treat that as
  // "not cached" so the caller falls through to actually resolving it.
  if (row.centerLat === null || row.centerLng === null || row.zoom === null) {
    return null;
  }
  return {
    level: row.level as TerritoryLevel,
    path: row.path,
    name: row.name,
    county: row.county,
    type: row.type as TerritoryType | null,
    externalId: row.externalId,
    centerLat: Number(row.centerLat),
    centerLng: Number(row.centerLng),
    zoom: row.zoom,
  };
}

async function getCachedByPath(path: string): Promise<TerritoryResolution | null> {
  const cached = resolutionCache.get(path);
  if (cached) return cached;

  const [row] = await db
    .select()
    .from(subdivisions)
    .where(eq(subdivisions.path, path))
    .limit(1);
  if (!row) return null;

  const resolution = rowToResolution(row);
  if (!resolution) return null;
  resolutionCache.set(path, resolution);
  return resolution;
}

// Upserts the boundary half of a territory row -- creates it if a page
// visit is the first thing to ever touch this path, or fills in a row that
// adjustTerritoryCounts already created (counts-only, null center) if a
// spot save got there first. Never touches spotCounts either way.
// `geometry` is the raw GeoJSON Polygon/MultiPolygon a resolver's ArcGIS
// feature came with (null for the hardcoded country row, which has none) --
// stored via the same ST_GeomFromGeoJSON/ST_Multi pattern parcels.ts uses
// for parcel boundaries.
async function cacheResolution(
  resolution: TerritoryResolution,
  geometry: { type: string; coordinates: unknown } | null,
  source: string,
): Promise<void> {
  const geom = geometry
    ? sql`ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(geometry)})), 4326)`
    : null;
  await db
    .insert(subdivisions)
    .values({
      level: resolution.level,
      path: resolution.path,
      name: resolution.name,
      county: resolution.county,
      type: resolution.type,
      externalId: resolution.externalId,
      geom,
      centerLat: String(resolution.centerLat),
      centerLng: String(resolution.centerLng),
      zoom: resolution.zoom,
      source,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subdivisions.path,
      set: {
        level: resolution.level,
        name: resolution.name,
        county: resolution.county,
        type: resolution.type,
        externalId: resolution.externalId,
        geom,
        centerLat: String(resolution.centerLat),
        centerLng: String(resolution.centerLng),
        zoom: resolution.zoom,
        source,
        fetchedAt: new Date(),
      },
    });
  resolutionCache.set(resolution.path, resolution);
}

// Walks a GeoJSON Polygon/MultiPolygon's coordinate array (arbitrary
// nesting) to find the lat/lng envelope, then derives a center and an
// approximate "fit the envelope" zoom. This is a rough heuristic, not the
// exact fitBounds math Leaflet/Google run client-side for parcels
// (FitBoundsToPolygons in LeafletMapView.tsx/GoogleMapView.tsx) -- it just
// needs to get a territory page in the right neighborhood on first paint.
function boundsFromGeometry(geometry: { coordinates: unknown }): {
  centerLat: number;
  centerLng: number;
  zoom: number;
} {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lng, lat] = coords as [number, number];
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      return;
    }
    for (const item of coords) visit(item);
  };
  visit(geometry.coordinates);

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latSpan = maxLat - minLat;
  const lngSpan = (maxLng - minLng) * Math.cos((centerLat * Math.PI) / 180);
  const span = Math.max(latSpan, lngSpan, 0.0005);
  // +2 over the naive "fit the envelope exactly" value -- that bare fit
  // reads as noticeably too zoomed-out in practice (confirmed on /us/ny).
  const zoom = Math.min(16, Math.max(3, Math.floor(Math.log2(360 / span)) + 2));
  return { centerLat, centerLng, zoom };
}

export interface ArcGisFeature<TProps> {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: TProps;
}

async function queryArcGis<TProps>(
  serviceUrl: string,
  where: string,
): Promise<ArcGisFeature<TProps>[]> {
  const url = new URL(`${serviceUrl}/query`);
  url.searchParams.set("where", where);
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "geojson");

  const response = await logRemoteCall("arcgis", serviceUrl, () => fetch(url));
  if (!response.ok) {
    throw new Error(`ArcGIS query failed (${serviceUrl}): ${response.status}`);
  }
  const body = (await response.json()) as { features: ArcGisFeature<TProps>[] };
  return body.features;
}

async function queryLayer<TProps>(
  rootUrl: string,
  layerId: number,
  where: string,
): Promise<ArcGisFeature<TProps>[]> {
  return queryArcGis<TProps>(`${rootUrl}/${layerId}`, where);
}

// ---- Country level -------------------------------------------------------

// Single supported country today. Center/zoom follow the standard US
// web-map convention of framing the contiguous 48 by default (see
// apps/web/user-stories.md) -- no external lookup needed for one fixed country.
const MAINLAND_US: TerritoryResolution = {
  level: 0,
  path: "us",
  name: "United States",
  county: null,
  type: "country",
  externalId: null,
  centerLat: 39.5,
  centerLng: -98.35,
  zoom: 4,
};

export async function resolveCountry(cc: string): Promise<TerritoryResolution | null> {
  if (cc.toLowerCase() !== "us") return null;
  const cached = await getCachedByPath("us");
  if (cached) return cached;
  await cacheResolution(MAINLAND_US, null, "hardcoded:mainland-us");
  return MAINLAND_US;
}

// ---- State level -----------------------------------------------------------

interface StateProps {
  NAME: string;
  STUSAB: string;
  // 2-digit state FIPS code -- also the Census GEOID at this level, and the
  // prefix used to scope a nationwide CDP-layer query to one state (see
  // getStateFips/findCdpWinner below).
  GEOID: string;
}

export async function resolveState(
  cc: string,
  sc: string,
): Promise<TerritoryResolution | null> {
  if (cc.toLowerCase() !== "us") return null;
  const stateCode = sc.toLowerCase();
  if (!/^[a-z]{2}$/.test(stateCode)) return null;

  const path = `us/${stateCode}`;
  const cached = await getCachedByPath(path);
  if (cached) return cached;

  const features = await queryArcGis<StateProps>(
    US_STATES_URL,
    `STUSAB='${escapeForArcGis(stateCode.toUpperCase())}'`,
  );
  const feature = features[0];
  if (!feature) return null;

  const bounds = boundsFromGeometry(feature.geometry);
  const resolution: TerritoryResolution = {
    level: 1,
    path,
    name: feature.properties.NAME,
    county: null,
    type: "state",
    externalId: feature.properties.GEOID,
    ...bounds,
  };
  await cacheResolution(resolution, feature.geometry, "census-tigerweb:State");
  return resolution;
}

// The 2-digit state FIPS code -- reuses resolveState's own caching (DB +
// in-process resolutionCache), so this is cheap after the first call for a
// given state. Used to scope the nationwide CDP layer query in
// findCdpWinner to one state, since that layer has no STUSAB field.
async function getStateFips(stateCode: string): Promise<string | null> {
  const state = await resolveState("us", stateCode);
  return state?.externalId ?? null;
}

// ---- Municipality level -----------------------------------------------------

const QUALIFIER_TYPES: MunicipalityType[] = [
  "city",
  "town",
  "village",
  "borough",
  "township",
  "county",
  "zip",
  "cdp",
];

export function stripQualifier(mc: string): { name: string; qualifier: MunicipalityType | null } {
  const lower = mc.toLowerCase();
  for (const type of QUALIFIER_TYPES) {
    const suffix = `-${type}`;
    if (lower.endsWith(suffix)) {
      return { name: mc.slice(0, mc.length - suffix.length), qualifier: type };
    }
  }
  return { name: mc, qualifier: null };
}

type MuniFeatureProps = Record<string, unknown>;

export interface Candidate {
  type: MunicipalityType;
  name: string;
  county: string | null;
  population: number | null;
  externalId: string | null;
  geometry: { type: string; coordinates: unknown };
}

// Tries each configured population field (newest-first) in turn -- states
// publish different sets of census-year columns (NY/NJ have decade columns
// back to 1980/1990, MA has them back to 1960), so this just walks
// whichever list a given layer config supplies.
// Reads a layer's configured government-ID field (see idField on
// MunicipalityLayerConfig), if any -- coerced to string since ArcGIS layers
// mix numeric and string ID fields across states (e.g. NY's GNIS_ID is
// numeric, ZIP_CODE is a zero-padded string).
export function externalIdOf(
  properties: Record<string, unknown>,
  idField: string | undefined,
): string | null {
  if (!idField) return null;
  const value = properties[idField];
  return value === null || value === undefined ? null : String(value);
}

export function populationOf(
  properties: Record<string, unknown>,
  fields: string[] | undefined,
): number | null {
  if (!fields) return null;
  for (const field of fields) {
    const value = properties[field];
    if (typeof value === "number") return value;
  }
  return null;
}

// Resolves a raw feature's municipality type from a layer's `type` config
// -- either a fixed type (the whole layer is one type, NY's cities/towns/
// villages) or a field+valueMap (one layer mixes types via an attribute,
// NJ/MA's single municipalities layer). Returns null for an unmapped raw
// value rather than guessing, so an unrecognized type is dropped as a
// candidate instead of silently mis-tagged.
export function resolveMuniType(
  type: MunicipalityLayerConfig["type"],
  properties: Record<string, unknown>,
): MunicipalityType | null {
  if (typeof type === "string") return type;
  const raw = properties[type.field];
  return typeof raw === "string" ? (type.valueMap[raw] ?? null) : null;
}

// Counties fold into the same query batch as a pseudo municipality-layer
// entry (fixed type "county") when the state has a county layer -- NY's
// municipalities list never includes counties itself (see ny.ts), so this
// is the only place counties enter the candidate set. A state with no
// county layer (e.g. MA) just contributes nothing here -- county-level
// lookup for it stays unavailable rather than erroring.
export function civilBoundaryLayers(
  civilBoundaries: CivilBoundariesConfig,
): MunicipalityLayerConfig[] {
  return [
    ...civilBoundaries.municipalities,
    ...(civilBoundaries.county
      ? [{ ...civilBoundaries.county, type: "county" as const }]
      : []),
  ];
}

function escapeForArcGis(value: string): string {
  return value.replace(/'/g, "''");
}

async function findCandidates(
  name: string,
  civilBoundaries: CivilBoundariesConfig,
): Promise<Candidate[]> {
  // The <mc> segment's dashes may represent a literal dash or a space in
  // the real name -- try both spellings.
  const nameVariants = Array.from(new Set([name, name.replace(/-/g, " ")]));

  const layers = civilBoundaryLayers(civilBoundaries);

  const byKey = new Map<string, Candidate>();
  for (const variant of nameVariants) {
    const results = await Promise.all(
      layers.map((layer) =>
        queryLayer<MuniFeatureProps>(
          layer.url ?? civilBoundaries.url,
          layer.layerId,
          `UPPER(${layer.nameField})=UPPER('${escapeForArcGis(variant)}')`,
        ),
      ),
    );
    layers.forEach((layer, i) => {
      for (const feature of results[i]) {
        const type = resolveMuniType(layer.type, feature.properties);
        if (!type) continue;
        const candidate: Candidate = {
          type,
          name: String(feature.properties[layer.nameField]),
          county: layer.countyField
            ? ((feature.properties[layer.countyField] as string | null | undefined) ?? null)
            : null,
          population: populationOf(feature.properties, layer.populationFields),
          externalId: externalIdOf(feature.properties, layer.idField),
          geometry: feature.geometry,
        };
        byKey.set(`${type}:${candidate.name}:${candidate.county}`, candidate);
      }
    });
  }
  return Array.from(byKey.values());
}

// Applies the doc's disambiguation rules, in order. Counties rank last on
// purpose (per user direction): a same-named city/town/village always wins
// over a same-named county (e.g. "new-york" -> NYC, not New York County).
export function pickWinner(
  candidates: Candidate[],
  qualifier: MunicipalityType | null,
): Candidate | MunicipalityAmbiguity | null {
  if (candidates.length === 0) return null;

  if (qualifier) {
    return candidates.find((c) => c.type === qualifier) ?? null;
  }

  const nonCounty = candidates.filter((c) => c.type !== "county");

  if (nonCounty.length === 0) {
    // Only county matches -- fall back to it (there's only ever one county
    // per name in NY, but guard the multi-match case anyway).
    if (candidates.length === 1) return candidates[0];
    return { ambiguous: true, options: toOptions(candidates) };
  }

  if (nonCounty.length === 1) return nonCounty[0];

  const city = nonCounty.find((c) => c.type === "city");
  const town = nonCounty.find((c) => c.type === "town");
  const village = nonCounty.find((c) => c.type === "village");

  // Village inside a town sharing a name (e.g. Ossining) -> town wins. A
  // village only ever shares a name with its own containing town, so this
  // doesn't need a county check the way city+town does below.
  if (town && village && !city && nonCounty.length === 2) return town;

  if (city && town && !village && nonCounty.length === 2) {
    // Same county -> a town-next-to-a-city naming pattern (e.g. Rye), city
    // wins outright. Different (or unknown) county -> not the same naming
    // pattern, just two unrelated same-named municipalities in different
    // counties (e.g. Middletown) -> pick the larger by population instead.
    if (city.county && town.county && city.county === town.county) {
      return city;
    }
    if (city.population !== null && town.population !== null) {
      return city.population >= town.population ? city : town;
    }
    return { ambiguous: true, options: toOptions(nonCounty) };
  }

  // Multiple same-type matches across counties -> prefer the larger by
  // population, if every candidate has one on record.
  const sameType = nonCounty.every((c) => c.type === nonCounty[0].type);
  if (sameType) {
    const withPopulation = nonCounty.filter((c) => c.population !== null);
    if (withPopulation.length === nonCounty.length) {
      return withPopulation.reduce((largest, candidate) =>
        (candidate.population ?? 0) > (largest.population ?? 0) ? candidate : largest,
      );
    }
  }

  return { ambiguous: true, options: toOptions(nonCounty) };
}

function toOptions(
  candidates: Candidate[],
): { name: string; type: MunicipalityType; county: string | null }[] {
  return candidates.map((c) => ({ name: c.name, type: c.type, county: c.county }));
}

function slugifyMuniName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A spot's stored county name usually already ends in "County" (e.g.
// Google's administrative_area_level_2 long_name, "Westchester County"),
// but other sources (NY parcel data) supply the bare name -- strip a
// pre-existing suffix so both spellings normalize to the same value. Shared
// with spots.ts, which applies this at write time so `spots.county` itself
// stays consistent, not just the path built from it here.
export function normalizeCountyName(countyName: string): string {
  return countyName.trim().replace(/\s+county$/i, "").trim();
}

// A "-county" suffix always gets appended below to build the path -- start
// from the normalized name so it doesn't double up into
// "westchester-county-county".
export function countyPathSegment(countyName: string): string {
  return `${slugifyMuniName(normalizeCountyName(countyName))}-county`;
}

interface ZipProps {
  ZIP_CODE: string;
  PO_NAME: string;
  STATE: string;
  POPULATION: number | null;
}

// Combines however many ZIP polygons share a PO_NAME into one Candidate --
// there's no reasonable way to pick "the" ZIP for a city name split across
// several codes, so this covers all of them. Pure/testable: takes
// already-fetched features, does no I/O itself.
export function combineZipFeatures(
  features: ArcGisFeature<ZipProps>[],
): Candidate | null {
  if (features.length === 0) return null;
  const totalPopulation = features.reduce(
    (sum, f) => sum + (f.properties.POPULATION ?? 0),
    0,
  );
  // No single ZIP_CODE is "the" ID for a PO_NAME split across several
  // codes -- lowest wins as a best-effort, deterministic primary ID (e.g.
  // Ossining's 10510/10562 -> 10510), same spirit as combining every
  // feature's geometry below rather than picking just one.
  const primaryZip = [...features].map((f) => f.properties.ZIP_CODE).sort()[0] ?? null;
  return {
    type: "zip",
    name: features[0].properties.PO_NAME,
    county: null,
    population: totalPopulation || null,
    externalId: primaryZip,
    // Feeding boundsFromGeometry a synthetic coordinates array holding
    // every matched ZIP's own coordinates -- its recursive walk just looks
    // for [lng, lat] leaf pairs, so this combines their envelopes for free
    // without needing a dedicated multi-geometry bounds function. Each
    // ZIP feature is itself a GeoJSON Polygon (confirmed live), so nesting
    // their coordinate arrays under one "MultiPolygon" type produces valid
    // GeoJSON for storage too, not just bounds.
    geometry: {
      type: "MultiPolygon",
      coordinates: features.map((f) => f.geometry.coordinates),
    },
  };
}

async function findZipWinner(
  stateCode: string,
  name: string,
): Promise<Candidate | null> {
  const nameVariants = Array.from(new Set([name, name.replace(/-/g, " ")]));
  const stateAbbrev = stateCode.toUpperCase();

  const seenZips = new Set<string>();
  const features: ArcGisFeature<ZipProps>[] = [];
  for (const variant of nameVariants) {
    const where = `UPPER(PO_NAME)=UPPER('${escapeForArcGis(variant)}') AND UPPER(STATE)=UPPER('${escapeForArcGis(stateAbbrev)}')`;
    for (const feature of await queryArcGis<ZipProps>(ZIP_BOUNDARIES_URL, where)) {
      if (seenZips.has(feature.properties.ZIP_CODE)) continue;
      seenZips.add(feature.properties.ZIP_CODE);
      features.push(feature);
    }
  }

  return combineZipFeatures(features);
}

interface CdpProps {
  NAME: string; // Census NAME always carries a " CDP" suffix, e.g. "Chappaqua CDP".
  GEOID: string;
}

// Finds a Census Designated Place by name within one state. The CDP layer
// has no STUSAB field (only a numeric STATE FIPS code), hence getStateFips
// -- and CDP names in this layer always carry a trailing " CDP", hence
// appending it to the query rather than matching NAME directly.
async function findCdpWinner(stateCode: string, name: string): Promise<Candidate | null> {
  const fips = await getStateFips(stateCode);
  if (!fips) return null;

  const nameVariants = Array.from(new Set([name, name.replace(/-/g, " ")]));
  for (const variant of nameVariants) {
    const where = `UPPER(NAME)=UPPER('${escapeForArcGis(variant)} CDP') AND STATE='${fips}'`;
    const features = await queryArcGis<CdpProps>(CDP_BOUNDARIES_URL, where);
    const feature = features[0];
    if (feature) {
      return {
        type: "cdp",
        name: feature.properties.NAME.replace(/ CDP$/i, ""),
        county: null,
        population: null,
        externalId: feature.properties.GEOID,
        geometry: feature.geometry,
      };
    }
  }
  return null;
}

export async function resolveMunicipality(
  cc: string,
  sc: string,
  mc: string,
): Promise<TerritoryResolution | MunicipalityAmbiguity | null> {
  if (cc.toLowerCase() !== "us") return null;
  const stateCode = sc.toLowerCase();
  if (!/^[a-z]{2}$/.test(stateCode)) return null;

  const requestedPath = `us/${stateCode}/${mc.toLowerCase()}`;
  const cached = await getCachedByPath(requestedPath);
  if (cached) return cached;

  const { name, qualifier } = stripQualifier(mc);

  // Civil-boundary lookup (city/town/village/county) first, unless the
  // qualifier explicitly asks for the ZIP fallback -- only states with a
  // `civilBoundaries` config entry have this data source. Any other state
  // (or an unresolved name) falls through to the nationwide ZIP lookup below.
  const civilBoundaries = getStateConfig(stateCode)?.civilBoundaries;
  let winner: Candidate | MunicipalityAmbiguity | null = null;
  if (civilBoundaries && qualifier !== "zip" && qualifier !== "cdp") {
    const candidates = await findCandidates(name, civilBoundaries);
    winner = pickWinner(candidates, qualifier);
  }

  // CDP ("locale") lookup: only once civil boundaries have ruled out a real
  // governing municipality/county of the same name, and only when an
  // explicit qualifier hasn't already picked "zip" instead.
  if (winner === null && qualifier !== "zip") {
    winner = await findCdpWinner(stateCode, name);
  }

  if (winner === null) {
    winner = await findZipWinner(stateCode, name);
  }

  if (winner === null || "ambiguous" in winner) return winner;

  const canonicalPath = `us/${stateCode}/${slugifyMuniName(winner.name)}-${winner.type}`;
  const existingCanonical = await getCachedByPath(canonicalPath);
  if (existingCanonical) {
    resolutionCache.set(requestedPath, existingCanonical);
    return existingCanonical;
  }

  const bounds = boundsFromGeometry(winner.geometry);
  const resolution: TerritoryResolution = {
    level: 2,
    path: canonicalPath,
    name: winner.name,
    county: winner.county,
    type: winner.type,
    externalId: winner.externalId,
    ...bounds,
  };
  const source =
    winner.type === "zip"
      ? "esri-usa-zip-boundaries"
      : winner.type === "cdp"
        ? "census-tigerweb:cdp"
        : `${stateCode}-civil-boundaries:${winner.type}`;
  await cacheResolution(resolution, winner.geometry, source);
  resolutionCache.set(requestedPath, resolution);
  return resolution;
}

// ---- Progressive per-category spot counts ---------------------------------
//
// Unlike boundary resolution above, this never calls an external GIS
// service -- it's derived entirely from the spot's own stored fields (plus,
// for the postalCity case-2-vs-3 check below, a read of our own DB), so it
// can run eagerly on every create/update/delete (see adjustTerritoryCounts
// callers in spots.ts) without coupling a spot save to an external
// service's uptime. Trade-off: a municipality-level path is keyed by the
// spot's own (geocoded, but not GIS-disambiguated) text, e.g. "ossining",
// which may not match the GIS-canonical path a page visit later resolves to
// (e.g. "ossining-town") if the spelling doesn't exactly match the GIS
// layer's NAME field. Known gap, not reconciled yet.

export interface SpotTerritoryFields {
  state: string | null;
  county: string | null;
  municipality: string | null;
  postalCity: string | null;
  useMunicipalityForSlug: boolean | null;
  stewardId: string | null;
  purpose: string | null;
}

// `${stewarded ? "stewarded" : "unstewarded"}-${purpose ?? "none"}`, e.g.
// "stewarded-garden", "unstewarded-wild_area", "stewarded-none".
export function categoryKey(spot: {
  stewardId: string | null;
  purpose: string | null;
}): string {
  return `${spot.stewardId ? "stewarded" : "unstewarded"}-${spot.purpose ?? "none"}`;
}

export interface TerritoryPathEntry {
  path: string;
  level: TerritoryResolution["level"];
  placeholderName: string;
  // Best-effort containing-county display name, set on the locality-level
  // entries so listSubdivisions can find "municipalities in this county"
  // before that municipality has ever been GIS-resolved. Null for the
  // country/state/county entries themselves.
  county: string | null;
  // Set only when the type is knowable without a GIS call -- "country"/
  // "state"/"county" are certain from the entry's own level/shape; a
  // municipality/postalCity entry's real type (city/town/village/zip) needs
  // disambiguation, so this stays undefined for those until something
  // GIS-resolves the path (see cacheResolution, and backfillSubdivisions.ts
  // for a script that does this for every existing spot).
  type?: TerritoryType | null;
  // True only for the postalCity entry when it differs from municipality --
  // see shouldIncludePostalCandidate. Every other entry is unconditional.
  isPostalCandidate?: boolean;
}

// The territory paths a spot counts toward -- country and state always (if
// state is set), county if set, and up to two locality-level entries:
// municipality, and postalCity if it names a different place (the "3-case
// model" from apps/web/user-stories.md, "Spot scoreboards" #0):
//   1. Equivalent (same place) -- same slug either way, naturally one entry.
//   2. Within (postalCity is a hamlet/CDP with no municipal status of its
//      own, e.g. a community inside the municipality) -- count under both.
//   3. Expansive (postalCity's ZIP service area spills into other towns,
//      e.g. NY's White Plains/Scarsdale/Mount Kisco) -- count only under
//      the spot's actual municipality, not the postalCity name, since that
//      name's scoreboard belongs to spots actually governed by it.
// This function only produces the postalCity *candidate*, tagged
// isPostalCandidate -- distinguishing case 2 from case 3 needs a DB read
// (is postalCity itself a known real municipality?), which adjustTerritoryCounts
// does, keeping this function pure and directly testable.
export function territoryPathsForSpot(
  spot: SpotTerritoryFields,
): TerritoryPathEntry[] {
  const entries: TerritoryPathEntry[] = [
    { path: "us", level: 0, placeholderName: "United States", county: null, type: "country" },
  ];

  const stateSlug = spot.state ? slugifyMuniName(spot.state) : "";
  if (!stateSlug) return entries;
  entries.push({
    path: `us/${stateSlug}`,
    level: 1,
    placeholderName: spot.state as string,
    county: null,
    type: "state",
  });

  if (spot.county) {
    entries.push({
      path: `us/${stateSlug}/${countyPathSegment(spot.county)}`,
      level: 2,
      placeholderName: spot.county,
      county: null,
      type: "county",
    });
  }

  const municipalitySlug = spot.municipality ? slugifyMuniName(spot.municipality) : "";
  if (municipalitySlug) {
    entries.push({
      path: `us/${stateSlug}/${municipalitySlug}`,
      level: 2,
      placeholderName: spot.municipality as string,
      county: spot.county,
    });
  }

  const postalSlug = spot.postalCity ? slugifyMuniName(spot.postalCity) : "";
  if (postalSlug && postalSlug !== municipalitySlug) {
    entries.push({
      path: `us/${stateSlug}/${postalSlug}`,
      level: 2,
      placeholderName: spot.postalCity as string,
      county: spot.county,
      // Only excludable (case 3) when there's a separate municipality entry
      // that's the more correct attribution instead. If municipality is
      // unset entirely, postalCity is the only locality info this spot
      // has, so it counts unconditionally -- there's nothing to defer to.
      isPostalCandidate: municipalitySlug !== "",
    });
  }

  return entries;
}

// Case 2 vs. case 3 (see territoryPathsForSpot): a postalCity candidate is
// only excluded when we already know -- from a prior GIS resolution -- that
// it names a real, separate municipality. `null` (never resolved) and
// "county"/"zip" (not a city/town/village) both default to inclusion.
export function shouldIncludePostalCandidate(
  knownType: MunicipalityType | null,
): boolean {
  return knownType === null || knownType === "county" || knownType === "zip";
}

// Local-DB-only lookup (never the live GIS service -- see the module
// comment above) for the case-2-vs-3 check. `path` is the raw, unsuffixed
// slug (e.g. "us/ny/mount-kisco") -- but resolveMunicipality's canonical
// path for a GIS-resolved municipality always has a "-<type>" suffix
// appended (e.g. "us/ny/mount-kisco-town"), so a resolved row never lives
// at the raw path itself. Check both: the raw path (covers a county/zip
// entry, which -- per territoryPathsForSpot -- IS stored unsuffixed for
// counties, or a row nobody's disambiguated a suffix for yet) and every
// possible "-<type>" canonical variant.
async function getKnownMunicipalityType(path: string): Promise<MunicipalityType | null> {
  const candidatePaths = [path, ...QUALIFIER_TYPES.map((type) => `${path}-${type}`)];
  const rows = await db
    .select({ type: subdivisions.type })
    .from(subdivisions)
    .where(inArray(subdivisions.path, candidatePaths));
  const resolved = rows.find((row) => row.type !== null);
  return (resolved?.type as MunicipalityType | null) ?? null;
}

// Upserts (creating a boundary-less row if needed) and atomically bumps one
// category key in spotCounts. Never touches centerLat/centerLng/zoom, so it
// can't clobber a boundary cacheResolution already wrote. `entry.type`, when
// provided, IS written (both on insert and -- via the coalesce-to-self
// fallback below -- on conflict) since a known type (country/state/county,
// or a GIS-resolved municipality/postalCity) is safe to record eagerly;
// when omitted, an existing row's type is left untouched rather than reset
// to null.
export async function bumpTerritoryCount(
  entry: TerritoryPathEntry,
  category: string,
  delta: number,
): Promise<void> {
  debugLog(
    "[territory] bumping count:",
    entry.path,
    "category:", category,
    "delta:", delta,
  );
  await db
    .insert(subdivisions)
    .values({
      level: entry.level,
      path: entry.path,
      name: entry.placeholderName,
      county: entry.county,
      type: entry.type ?? null,
      spotCounts: { [category]: delta },
      source: "spot-save",
    })
    .onConflictDoUpdate({
      target: subdivisions.path,
      set: {
        type: entry.type !== undefined ? entry.type : sql`${subdivisions.type}`,
        spotCounts: sql`jsonb_set(
          coalesce(${subdivisions.spotCounts}, '{}'::jsonb),
          ARRAY[${category}]::text[],
          to_jsonb(coalesce((${subdivisions.spotCounts}->>${category})::int, 0) + ${delta})
        )`,
      },
    });
}

// Call with delta=+1 on create, -1 on delete, and both -1 (old fields) then
// +1 (new fields) on update -- always calling both rather than diffing
// first keeps this simple and correct even when nothing territory-relevant
// changed (paths match, the -1/+1 nets to the same value either way).
export async function adjustTerritoryCounts(
  spot: SpotTerritoryFields,
  delta: number,
): Promise<void> {
  const category = categoryKey(spot);
  const entries = territoryPathsForSpot(spot);
  debugLog(
    "[territory] adjustTerritoryCounts:",
    "state:", spot.state,
    "county:", spot.county,
    "municipality:", spot.municipality,
    "postalCity:", spot.postalCity,
    "delta:", delta,
    "paths:", entries.map((entry) => entry.path),
  );

  const toBump = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isPostalCandidate) return entry;
      const knownType = await getKnownMunicipalityType(entry.path);
      const include = shouldIncludePostalCandidate(knownType);
      debugLog(
        "[territory] postalCity candidate:",
        entry.path,
        "knownType:", knownType,
        "included:", include,
      );
      return include ? entry : null;
    }),
  );

  const filtered = toBump.filter(
    (entry): entry is TerritoryPathEntry => entry !== null,
  );
  debugLog(
    "[territory] paths to bump after postalCity filtering:",
    filtered.map((entry) => entry.path),
  );

  await Promise.all(
    filtered.map((entry) => bumpTerritoryCount(entry, category, delta)),
  );
}

// ---- Subdivisions with spots ------------------------------------------------

export interface Subdivision {
  path: string;
  name: string;
  totalCount: number;
}

export function sumCounts(counts: Record<string, number> | null | undefined): number {
  if (!counts) return 0;
  return Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
}

async function subdivisionRows(where: ReturnType<typeof and>): Promise<Subdivision[]> {
  const rows = await db
    .select({
      path: subdivisions.path,
      name: subdivisions.name,
      spotCounts: subdivisions.spotCounts,
    })
    .from(subdivisions)
    .where(where);

  return rows
    .map((row) => ({ path: row.path, name: row.name, totalCount: sumCounts(row.spotCounts) }))
    .filter((row) => row.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount);
}

// The next level down from `resolution` that has at least one spot, ranked
// by count (the "leaders amongst the subdivisions"). Reads purely from
// subdivisions.spot_counts -- no GROUP BY over `spots` -- so it's cheap even
// though it's driven off the eagerly-maintained counts rather than the
// lazily-fetched boundaries.
export async function listSubdivisions(
  resolution: TerritoryResolution,
): Promise<Subdivision[]> {
  if (resolution.level === 0) {
    return subdivisionRows(eq(subdivisions.level, 1));
  }

  if (resolution.level === 1) {
    return subdivisionRows(
      and(
        eq(subdivisions.level, 2),
        like(subdivisions.path, `${resolution.path}/%-county`),
      ),
    );
  }

  // Level 2: only a county has further subdivisions (the municipalities
  // within it) -- a city/town/village is the finest grain we resolve, so it
  // has none.
  const isCounty = resolution.type === "county" || resolution.path.endsWith("-county");
  if (!isCounty) return [];

  const statePrefix = resolution.path.split("/").slice(0, 2).join("/");
  return subdivisionRows(
    and(
      eq(subdivisions.level, 2),
      like(subdivisions.path, `${statePrefix}/%`),
      sql`${subdivisions.path} NOT LIKE '%-county'`,
      ilike(subdivisions.county, resolution.name),
    ),
  );
}

// This territory's own per-category counts (not its subdivisions') -- the
// scoreboard shown at the finest grain (a city/town/village), where
// listSubdivisions has nothing to drill into. Deliberately bypasses
// getCachedByPath's boundary-resolved check: counts can be meaningful even
// on a row nobody has GIS-resolved yet.
export async function getTerritoryCounts(
  path: string,
): Promise<Record<string, number>> {
  const [row] = await db
    .select({ spotCounts: subdivisions.spotCounts })
    .from(subdivisions)
    .where(eq(subdivisions.path, path))
    .limit(1);
  return row?.spotCounts ?? {};
}
