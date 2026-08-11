// Per-state configuration -- the settings that vary as more states get
// support alongside NY. Lives in shared-types (not core) because it's pure
// data with no server dependencies, and some of it (property-class
// descriptions) is consumed from client components.

export interface StateBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

// The municipality types actually resolvable via a state's civilBoundaries
// GIS source. A narrower set than TerritoryType (see enums.ts), which also
// covers types (country/state/district) that never come from this lookup.
export type MunicipalityType =
  | "city"
  | "town"
  | "village"
  | "borough"
  | "township"
  | "county"
  | "zip";

// One queryable layer of municipal boundaries. Two states rarely model
// local government the same way: NY splits cities/towns/villages into
// separate layers (each entry's `type` is a fixed MunicipalityType), while
// NJ/MA (and most other states) publish one flat layer covering every
// municipality with the type as an attribute (`type` is a field+valueMap).
export interface MunicipalityLayerConfig {
  // Overrides CivilBoundariesConfig.url for this one layer -- unset means
  // "same service as the rest". Needed because a state's county layer
  // isn't always hosted alongside its municipality layer (MA's counties
  // live on a separate MassGIS service from its municipalities).
  url?: string;
  layerId: number;
  nameField: string;
  countyField?: string;
  // Ordered newest-first; populationOf tries each in turn. Used to break
  // ties between same-named municipalities in different counties.
  populationFields?: string[];
  type:
    | MunicipalityType
    | { field: string; valueMap: Record<string, MunicipalityType> };
}

export interface CivilBoundariesConfig {
  // ArcGIS FeatureServer/MapServer root -- both support the same /<layer>/query
  // wire format (confirmed live for NJ's MapServer), so no distinction is
  // needed here between the two. Default root for county/municipality
  // layers below; either can override it with its own `url`.
  url: string;
  // Omit for a state with no county-boundary layer available at all --
  // county-level lookup just isn't available for that state yet.
  county?: { url?: string; layerId: number; nameField: string };
  // NY: 3 entries (cities/towns/villages), each a fixed type. NJ/MA: 1
  // entry, a flat layer with a type field.
  municipalities: MunicipalityLayerConfig[];
}

export interface ParcelClassAllowlistEntry {
  // First digit of the state's 3-digit property-classification code.
  series: string;
  label: string;
  autoReveal: boolean;
  note?: string;
}

// Maps our canonical Parcel DTO fields to a state's actual ArcGIS field
// names. This is also the owner-data allowlist boundary: only fields named
// here are ever read out of a raw ArcGIS response into our internal Parcel
// object (see parcels.ts), so an owner/assessment field that isn't named
// here -- even if the raw API response contains it -- never reaches our DB
// or a client, regardless of what outFields was able to exclude at query
// time.
export interface ParcelFieldMap {
  externalId: string;
  county?: string;
  municipality?: string;
  address?: string;
  propertyClass?: string;
  acres?: string;
  // NY-only concepts with no confirmed equivalent in other states yet --
  // left unmapped there, which just means the Parcel DTO field stays null.
  swis?: string;
  spatialYr?: string;
  // NY: PRINT_KEY. MA: MAP_PAR_ID (human map/parcel id, distinct from the
  // stable externalId).
  printKey?: string;
  // NY: NYS_NAME, a pre-assigned public-agency label for state-owned land.
  // Omit where no equivalent exists yet.
  stateOwnedLabel?: string;
  // An int field usable directly as the parcel's "vintage year" (NY:
  // ROLL_YR, MA: FY). Falls back to vintageDateField, then the current
  // calendar year, if unset -- see cacheParcel in parcels.ts for why this
  // always needs a value.
  vintageYearField?: string;
  // A date field to derive a vintage year from when no int field exists
  // (NJ: PCL_LASTUPD).
  vintageDateField?: string;
}

export interface ParcelServiceConfig {
  // ArcGIS query endpoint for tax-parcel lookup.
  queryUrl: string;
  fields: ParcelFieldMap;
  // Owner-reveal ("Show Owner") stays unavailable for a state until these
  // are populated -- isInstitutionalClass treats a missing allowlist as
  // "never auto-reveal", a safe default.
  classAllowlist?: ParcelClassAllowlistEntry[];
  // Full code -> human description (e.g. NY "210" -> "One family year-round residence").
  classDescriptions?: Record<string, string>;
  // Series digit -> fallback label, used when a code isn't individually listed.
  classSeriesLabels?: Record<string, string>;
}

export interface StateConfig {
  // Lowercase 2-letter postal code, matches territory.ts's `sc` route segment.
  code: string;
  name: string;
  boundingBox: StateBoundingBox;
  // Only set for a state with a municipal civil-boundaries GIS source.
  civilBoundaries?: CivilBoundariesConfig;
  // Only set for a state with a tax-parcel GIS source.
  parcels?: ParcelServiceConfig;
}
