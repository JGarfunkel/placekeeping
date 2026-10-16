import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const stewardTypeEnum = pgEnum("steward_type", [
  "individual",
  "school",
  "club",
  "nonprofit",
  "municipality",
]);

export const stewardMemberRoleEnum = pgEnum("steward_member_role", [
  "admin",
  "member",
]);

// vegetation, weed_level, and (as of the reclassification migration) purpose
// are intentionally plain text, not pgEnum: the taxonomy is still being
// actively reshaped, and the set of valid values is enforced at the
// application boundary by the Zod schemas in @placekeeping/shared-types. A
// DB-level enum would mean every rename or re-grading needs a type-recreate
// migration for no added safety. purpose was a native `spot_purpose` enum
// until local/reclassification-migration.md's Phase 0 converted it to text
// for the same reason -- see spotPurposeSchema in shared-types/src/enums.ts.

export const placeAccessEnum = pgEnum("place_access", [
  "public",
  "none",
  "private_club",
  "school",
  "visible_from_street",
]);

export const addressVisibilityEnum = pgEnum("address_visibility", [
  "public",
  "municipality",
  "hidden",
]);

// Null = legacy/never-explicitly-resolved. 'resolved' is always written
// together with a non-null parcelSbl; 'no_parcel' is a deliberate,
// persisted "no parcel applies here" (e.g. the pin is in the street) --
// distinct from null, which just means nobody has checked yet. See
// local/spot-resolution.md and reassignSpotParcel in @placekeeping/core.
export const parcelStatusEnum = pgEnum("parcel_status", [
  "resolved",
  "no_parcel",
]);

export const photoModerationStatusEnum = pgEnum("photo_moderation_status", [
  // Passed checkPhotoUrls/checkPhotoBytes (packages/core/src/photoModeration.ts).
  "approved",
  // Not currently reachable at insert time (a failing check throws before
  // the row is written) -- reserved for a future admin/report-photo review
  // flow (see local memory photo_content_moderation) to flip a row without
  // an enum migration.
  "rejected",
  // Written when PHOTO_MODERATION=none, i.e. no check actually ran.
  "skipped",
]);

// geography(Point,4326) has no first-class Drizzle type; we store/read it via
// raw SQL (ST_MakePoint on write, ST_X/ST_Y on read) in packages/core, so this
// customType only needs to describe the column for migration generation.
const geographyPoint = customType<{ data: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
});

// Same rationale as geographyPoint, for a site's boundary polygon.
const multiPolygon = customType<{ data: string }>({
  dataType() {
    return "geometry(MultiPolygon,4326)";
  },
});

// The login identity: one row per Firebase account. Not every user is a
// steward -- some only ever log observations -- so stewardship lives on a
// separate, optional link (stewards.userId) rather than here.
export const users = pgTable(
  "users",
  {
    userId: uuid("user_id").primaryKey().defaultRandom(),
    firebaseUid: text("firebase_uid").notNull().unique(),
    name: text("name").notNull(),
    // Public handle shown in place of `name` anywhere a user is visible to
    // other users (observations, steward rosters, etc.), same idea as an
    // iNaturalist username -- lets people participate without exposing
    // their real name. Format (alphanumeric/underscore, 3-40 chars) is
    // enforced in the Zod schema, not here, matching the vegetation/
    // weedLevel convention above. Uniqueness is case-insensitive, via the
    // lower() index below, so the column itself isn't marked .unique().
    username: text("username").notNull(),
    email: text("email"),
    isSystemAdmin: boolean("is_system_admin").notNull().default(false),
    // Verification/standing tier: -1 suspended, 0 unverified, 1 verified
    // member, 2 partner -- see LEVEL_LABELS in @placekeeping/shared-types.
    // Plain integer, not an enum, since further tiers may be added later.
    // Set via `npm run db:set-level` (packages/db/src/set-level.ts), same
    // convention as isSystemAdmin/set-admin.ts -- not self-service.
    level: integer("level").notNull().default(0),
    // Either our own storage URL (uploaded via POST /api/photos, already
    // moderated at upload time) or a pasted external URL (moderated on save
    // -- see checkPhotoUrls in updateUserProfile). Same convention as
    // spots.coverPhotoUrl / stewards.logoUrl.
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_lower_idx").on(sql`lower(${table.username})`),
  ],
);

// Singleton row (id is always 1) gating writes across the app -- flipped on
// by an admin from /admin/settings right before running a migration/upgrade,
// so in-flight requests can't write against a schema that's about to change.
// See assertWritesEnabled in @placekeeping/core and the pause gate in
// apps/web/src/lib/apiError.ts.
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  writesPaused: boolean("writes_paused").notNull().default(false),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  pausedByUserId: uuid("paused_by_user_id").references(() => users.userId, {
    onDelete: "set null",
  }),
});

export const stewards = pgTable(
  "stewards",
  {
    stewardId: uuid("steward_id").primaryKey().defaultRandom(),
    // The user who registered as this steward -- set for individuals
    // (self-service "become a steward"), null for groups, which are
    // administered via steward_members rather than owned by one login. Not
    // unique: nothing here rules out a user being linked from more than one
    // row.
    userId: uuid("user_id").references(() => users.userId, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    // URL-friendly identifier derived from `name` (see computeStewardSlug in
    // @placekeeping/core), globally unique with an auto-suffix on collision
    // -- deliberately NOT derived from name uniqueness, since two unrelated
    // groups in different towns can share a name (e.g. "Vine Squad"). This
    // is the preferred public identifier for /stewards/<slug> URLs; stewardId
    // (uuid) remains the FK/primary key everywhere else, including the
    // polymorphic verificationTokens.entityId column.
    slug: text("slug").notNull(),
    type: stewardTypeEnum("type").notNull().default("individual"),
    url: text("url"),
    contact: text("contact"),
    // Same convention as users.photoUrl above: our own storage URL (already
    // moderated at upload) or a pasted external URL (moderated on save).
    logoUrl: text("logo_url"),
    publicDisplay: boolean("public_display").notNull().default(true),
    // Same convention as users.level above, set via `npm run db:set-level`,
    // not self-service (see UpdateStewardInput).
    level: integer("level").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("stewards_slug_idx").on(table.slug)],
);

// Group roster: who belongs to a group steward (type != 'individual') and
// who among them can manage that roster / the steward's profile. System
// admins designate the first admin when they create the group; admins can
// then add/remove/promote members themselves.
export const stewardMembers = pgTable(
  "steward_members",
  {
    stewardId: uuid("steward_id")
      .notNull()
      .references(() => stewards.stewardId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    role: stewardMemberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.stewardId, table.userId] }),
    index("steward_members_user_id_idx").on(table.userId),
  ],
);

export const verificationEntityTypeEnum = pgEnum("verification_entity_type", [
  "user",
  "steward",
]);

// Single-use tokens for out-of-band contact verification (e.g. a group
// steward's contact email). entityId is polymorphic (points at either
// users.userId or stewards.stewardId depending on entityType), so it can't
// carry a real FK -- rows are deleted once consumed instead of accumulating
// verified/unverified state as columns on the target tables.
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: verificationEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("verification_tokens_token_idx").on(table.token),
    index("verification_tokens_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
  ],
);

// The land-unit-of-record: the area/boundary a spot may belong to. Carries
// the external identifiers (GIS codings, HNP, stewardship program of
// record) and — once surveyed — the boundary polygon. Seeded ahead of any
// UI to create one; see local/place-split.md.
export const sites = pgTable(
  "sites",
  {
    siteId: serial("site_id").primaryKey(),
    name: text("name").notNull(),
    purpose: text("purpose"),
    geom: multiPolygon("geom"),
    // Codings from external GIS layers we don't control, so kept as free
    // text rather than an enum we'd need to keep in sync.
    gisOpenSpace: text("gis_open_space"),
    gisLandUse: text("gis_land_use"),
    hnpMapNumber: integer("hnp_map_number"),
    stewardshipProgram: text("stewardship_program"),
    stewardshipRef: text("stewardship_ref"),
    // Who holds title (town, school district, HOA, private owner, land
    // trust) -- lives here rather than on spots, since it describes the
    // land-unit-of-record, not the pin. No UI to edit it yet, same as
    // stewardshipProgram/stewardshipRef above.
    legalOwner: text("legal_owner"),
    // The logged-in user who created this site -- set once at creation
    // (either via the spot-page cascade save or a future direct create UI)
    // and never touched by updateSite. Same idea as spots.createdByUserId.
    createdBy: uuid("created_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sites_geom_gix").using("gist", table.geom)],
);

// Cached NYS tax parcel boundaries, resolved from the state's public ArcGIS
// service (local/parcel-discovery.md, local/spot-resolution.md). Deliberately
// owner-free: only PROP_CLASS/CALC_ACRES/NYS_NAME-shaped public fields are
// ever written here. `(swisSblId, rollYr)` is the natural key rather than
// `id` because parcels are split/merged/renumbered between assessment rolls
// — keeping the year means a spot pinned in one roll year still points at
// the boundary as it stood then, and the table grows rather than overwrites.
export const parcels = pgTable(
  "parcels",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // Which configured state's parcel service resolved this row -- lets
    // (swisSblId, rollYr) collide safely across states, and fixes a
    // correctness gap for any state without a natural roll-year field:
    // Postgres unique indexes treat NULL as never-equal, so a state that
    // always inserted a null rollYr would silently accumulate duplicate
    // rows on every re-fetch instead of updating in place. See
    // packages/core/src/parcels.ts's vintageYear, which guarantees rollYr
    // is always a real number now.
    stateCode: text("state_code").notNull().default("ny"),
    swisSblId: text("swis_sbl_id").notNull(),
    swis: text("swis"),
    printKey: text("print_key"),
    // The parcel's own site address (PARCEL_ADDR), not owner mailing
    // address -- public and not gated by isInstitutionalClass, unlike
    // owner/assessment fields. See local/parcel-discovery.md.
    address: text("address"),
    countyName: text("county_name"),
    muniName: text("muni_name"),
    cityTownName: text("citytown_name"),
    propClass: text("prop_class"),
    calcAcres: numeric("calc_acres", { precision: 12, scale: 4 }),
    // Assigned public agency label for state-owned land (NYS_NAME); present
    // instead of an owner query for state land, see local/spot-resolution.md §5.
    nysName: text("nys_name"),
    rollYr: integer("roll_yr"),
    spatialYr: integer("spatial_yr"),
    geom: multiPolygon("geom").notNull(),
    source: text("source").notNull().default("nys_gis"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set once an authenticated owner (owner text itself, never stored)
    // has been shown for this parcel -- lets the UI stop re-offering the
    // "Show owner" button on later visits without persisting the owner
    // string. See local/spot-resolution.md §5 / §8.
    ownerRevealedAt: timestamp("owner_revealed_at", { withTimezone: true }),
    // True when the boundary looks like it was traced along a curving
    // linear feature (a road/ROW edge) rather than drawn as a small number
    // of straight survey lines -- see computeShapeFlag in
    // packages/core/src/parcels.ts. A hint for map-display cropping and
    // manual review, not a correctness signal: the geometry itself is still
    // authoritative for containment/join queries.
    shapeFlag: boolean("shape_flag").notNull().default(false),
  },
  (table) => [
    index("parcels_geom_gix").using("gist", table.geom),
    uniqueIndex("parcels_state_swis_sbl_roll_yr_idx").on(
      table.stateCode,
      table.swisSblId,
      table.rollYr,
    ),
  ],
);

// Many-to-many: which cached parcels (by swisSblId, independent of roll
// year — a parcel's site membership doesn't change per assessment roll)
// belong to which site. No DB-level FK to `parcels`, since `parcels`'
// natural key is `(swisSblId, rollYr)`, not `swisSblId` alone.
export const siteParcels = pgTable(
  "site_parcels",
  {
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.siteId, { onDelete: "cascade" }),
    swisSblId: text("swis_sbl_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.siteId, table.swisSblId] }),
    index("site_parcels_swis_sbl_id_idx").on(table.swisSblId),
  ],
);

// A resolved /spots/<cc>/<sc?>/<mc?> territory: cached map center/zoom, and
// a running per-category spot count. The two halves are populated on
// different triggers -- center/zoom/name are fetched from NY's civil
// boundaries service progressively, only the first time a territory is
// actually visited (see resolveCountry/resolveState/resolveMunicipality in
// packages/core/src/territory.ts); spotCounts is bumped eagerly, on every
// spot create/update/delete (adjustTerritoryCounts), since it's derived
// from our own data and needs no external call. A row can therefore exist
// with counts but a null center (a territory with spots that nobody has
// browsed to yet) -- callers must treat a null centerLat as "not yet
// boundary-resolved", not "doesn't exist". See apps/web/user-stories.md
// ("Spot page - routing").
export const subdivisions = pgTable(
  "subdivisions",
  {
    id: serial("id").primaryKey(),
    // Depth in the path below, not a US-specific label -- 0 = country, 1 =
    // state (or a same-tier equivalent in another country, e.g. a county),
    // 2 = the finest grain resolved (county/city/town/village/zip/etc, see
    // `type`). Plain integer, not a pgEnum, matching the vegetation/
    // weedLevel convention above -- see TerritoryLevel in
    // @placekeeping/shared-types.
    level: integer("level").notNull(),
    // The canonical (winning) resolved path, e.g. "us", "us/ny",
    // "us/ny/ossining-town" -- alternate spellings/qualifiers that resolve
    // to the same subdivision share this row rather than duplicating it.
    // Note: spot-save-time count bumps key this off the spot's own raw
    // (ungeocoded-against-NY's-GIS-layers) fields, so a freshly-created
    // level-2 row's path may not equal the GIS-canonical spelling until the
    // territory page is first visited and reconciles it -- known gap, not
    // solved yet.
    path: text("path").notNull(),
    // Best-effort display name -- the spot's own free-text field values
    // until a real page visit resolves the GIS-canonical name.
    name: text("name").notNull(),
    county: text("county"),
    // The jurisdiction kind, e.g. "country"/"state" at those levels, or
    // "county"/"city"/"town"/"village"/"zip"/etc at level 2 -- always
    // suffixed onto the level-2 path (e.g. "-county", "-village") once
    // resolved, so a name that's ambiguous without it (Mount Kisco the
    // village vs. a same-named town) has an unambiguous URL. Plain text,
    // not a pgEnum -- see TerritoryType in @placekeeping/shared-types for
    // the (non-exhaustive, growable) known values. Null until a page visit
    // or GIS lookup resolves it, same progressive-population pattern as
    // centerLat/centerLng/zoom below.
    type: text("type"),
    // A stable government-assigned ID (Census GEOID for country/state/CDP,
    // GNIS_ID for NY/NJ counties+municipalities, FIPS_ID for MA counties,
    // ZIP_CODE for zips) -- distinct from `path`, which is a human slug
    // that can drift from a GIS layer's exact spelling (see the path
    // comment above). Null until GIS-resolved, or permanently null for a
    // layer with no such field on record (MA's municipality layer). Not
    // unique-indexed: NY's GNIS_ID, MA's FIPS_ID, and Census GEOID are
    // different ID spaces that could theoretically collide across sources.
    externalId: text("external_id"),
    // The boundary polygon itself, once GIS-resolved -- same multiPolygon
    // type as sites.geom/parcels.geom. Null until a page visit or GIS
    // lookup resolves it, same progressive-population pattern as
    // centerLat/centerLng/zoom below (and, before this column existed, the
    // only thing ever kept from a resolved feature's geometry).
    geom: multiPolygon("geom"),
    centerLat: numeric("center_lat", { precision: 9, scale: 6 }),
    centerLng: numeric("center_lng", { precision: 9, scale: 6 }),
    zoom: integer("zoom"),
    // Per-category spot counts within this territory, e.g.
    // {"stewarded-garden": 3, "unstewarded-wild_area": 2} -- keys are
    // `${stewarded ? "stewarded" : "unstewarded"}-${purpose ?? "none"}`,
    // see categoryKey in packages/core/src/territory.ts. Lets a parent
    // territory page (e.g. a state) list which subdivisions (counties) have
    // spots, and eventually rank them, without a live GROUP BY over `spots`
    // on every page load.
    spotCounts: jsonb("spot_counts")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    source: text("source"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("subdivisions_path_idx").on(table.path),
    index("subdivisions_geom_gix").using("gist", table.geom),
  ],
);

export const spots = pgTable(
  "spots",
  {
    spotId: serial("spot_id").primaryKey(),
    name: text("name").notNull(),
    location: geographyPoint("location").notNull(),
    address: text("address"),
    parcelId: text("parcel_id"),
    // System-resolved parcel identifier (NYS SWIS_SBL_ID), set by local
    // containment on create or the Find Parcel action — distinct from the
    // hand-typed legacy `parcelId` above. See local/spot-resolution.md.
    parcelSbl: text("parcel_sbl"),
    resolvedRollYr: integer("resolved_roll_yr"),
    parcelStatus: parcelStatusEnum("parcel_status"),
    addressVisibility: addressVisibilityEnum("address_visibility")
      .notNull()
      .default("public"),
    state: text("state"),
    // The governing jurisdiction (town/city/village government) — distinct
    // from postalCity, which is the USPS mailing-address city and can name a
    // different place than the one that actually governs the parcel.
    municipality: text("municipality"),
    postalCity: text("postal_city"),
    county: text("county"),
    sizeSqft: numeric("size_sqft", { precision: 12, scale: 2 }),
    // Deprecated -- being replaced by focus/setting below. Kept (and still
    // written) until every spot is reviewed; see
    // local/reclassification-migration.md.
    vegetation: text("vegetation"),
    weedLevel: text("weed_level").notNull().default("minimal"),
    // Focus/Setting/Bloom: see local/reclassification-plan.md. `focus` is the
    // spot's single dominant vegetation layer (nullable/unreviewed until
    // Phase 3 of the migration sets it); `setting` is where the spot
    // physically sits. Both plain text, same convention as vegetation/
    // weedLevel above.
    focus: text("focus"),
    setting: text("setting"),
    // Months, 1-12, the spot is known to bloom in -- see
    // local/reclassification-plan.md's Bloom section. Revised rarely, same
    // tier as the biodiversity estimate; not the per-visit species_blooming
    // count on observations below.
    bloomMonths: smallint("bloom_months")
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
    educationalComponent: boolean("educational_component")
      .notNull()
      .default(false),
    educationalNotes: text("educational_notes"),
    stewardId: uuid("steward_id").references(() => stewards.stewardId, {
      onDelete: "set null",
    }),
    // True when this spot's steward is (or, if stewardId is still unset,
    // will be once claimed) its own legal owner -- typical for private
    // property -- rather than a third-party caretaker, typical for public
    // land. Deliberately independent of stewardId: bulk/self-service entry
    // of private properties can mark this without going through the steward
    // picker at all, ahead of an owner ever logging in to create a steward
    // record and claim the spot (see StewardAssociationPicker). Lives here,
    // not on `stewards`, because the same individual steward can be the
    // owner on one spot and just a caretaker on another -- it describes this
    // spot's relationship, not the steward record.
    stewardIsOwner: boolean("steward_is_owner").notNull().default(false),
    // Raw steward name as imported from a spreadsheet — intentionally not
    // resolved against `stewardId`, since it may not match any real Steward.
    stewardName: text("steward_name"),
    // When the current stewardId took over -- null means unknown (no record
    // of when stewardship began). Exists so observations.stewardId can be
    // backfilled correctly: an observation logged before stewardStart
    // predates this steward and shouldn't be attributed to them, even though
    // the spot has them as its steward now. Not yet written on steward
    // reassignment (see updateSpot) -- that wiring lands separately.
    stewardStart: timestamp("steward_start", { withTimezone: true }),
    // Set once at creation from the authenticated caller and never touched
    // by updateSpot — distinct from stewardId, which can be reassigned or
    // cleared later (e.g. bulk import, steward handoff). Lets the original
    // creator keep managing parcel discovery even on an unstewarded spot.
    // Points at users, not stewards: every authenticated caller has a
    // userId, but not every one has registered as a steward (stewardId can
    // be null), so a steward-keyed creator reference would silently lose
    // attribution for exactly the callers this field exists to protect.
    createdByUserId: uuid("created_by_user_id").references(
      () => users.userId,
      { onDelete: "set null" },
    ),
    siteId: integer("site_id").references(() => sites.siteId, {
      onDelete: "set null",
    }),
    // Relabeled Function in the app; converted from the native `spot_purpose`
    // enum to text in local/reclassification-migration.md's Phase 0. Values
    // are still the old purpose vocabulary until that migration's Phase 2 --
    // see spotPurposeSchema / spotFunctionSchema in shared-types/src/enums.ts.
    purpose: text("purpose"),
    access: placeAccessEnum("access"),
    description: text("description"),
    needs: text("needs"),
    plans: text("plans"),
    website: text("website"),
    coverPhotoUrl: text("cover_photo_url"),
    photoAlbumUrl: text("photo_album_url"),
    inaturalistUrl: text("inaturalist_url"),
    // Whether the URL slug's locality segment uses `municipality` (true) or
    // `postalCity` (false).
    useMunicipalityForSlug: boolean("use_municipality_for_slug")
      .notNull()
      .default(false),
    // Persisted snapshot of the /<state>/<locality>/<spot-name> URL
    // segments, recomputed on create/update. Null when state, the chosen
    // locality, or name isn't set yet — the spot is still reachable at
    // /spots/[spotId] in that case.
    slugState: text("slug_state"),
    slugLocality: text("slug_locality"),
    slug: text("slug"),
    dateAdded: timestamp("date_added", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastVerified: timestamp("last_verified", { withTimezone: true }),
    status: text("status"),
  },
  (table) => [
    index("spots_location_gix").using("gist", table.location),
    index("spots_steward_id_idx").on(table.stewardId),
    index("spots_vegetation_idx").on(table.vegetation),
    index("spots_site_id_idx").on(table.siteId),
    index("spots_unstewarded_idx")
      .on(table.spotId)
      .where(sql`${table.stewardId} IS NULL`),
    uniqueIndex("spots_slug_idx")
      .on(table.slugState, table.slugLocality, table.slug)
      .where(sql`${table.slug} IS NOT NULL`),
    index("spots_bloom_months_gin").using("gin", table.bloomMonths),
    check(
      "spots_bloom_months_check",
      sql`${table.bloomMonths} <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]`,
    ),
  ],
);

export const observations = pgTable(
  "observations",
  {
    observationId: uuid("observation_id").primaryKey().defaultRandom(),
    spotId: integer("spot_id")
      .notNull()
      .references(() => spots.spotId, { onDelete: "cascade" }),
    observedAt: date("observed_at")
      .notNull()
      .default(sql`CURRENT_DATE`),
    observerName: text("observer_name"),
    // The logged-in user who submitted this observation -- null for the seed
    // script and any other server-side caller without one. Deliberately a
    // users FK, not a stewards one: most people logging an observation
    // haven't registered as a steward (see AuthContext.stewardId), so a
    // steward-keyed reference would silently lose attribution for them.
    observerId: uuid("observer_id").references(() => users.userId, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    // Per-observation snapshot, distinct from spots.vegetation/weedLevel
    // (the site's current default) -- both nullable since not every
    // observation logs them. Same plain-text convention as spots, see
    // comment above spots.vegetation.
    vegetation: text("vegetation"),
    weedLevel: text("weed_level"),
    // This visit's own Focus read, independent of spots.focus -- replaces
    // `vegetation` above once existing rows are backfilled (see
    // local/reclassification-migration.md's Observations section).
    focus: text("focus"),
    // Per-visit estimated count of species in bloom -- record only, doesn't
    // feed the pin (distinct from spots.bloom_* above, which is the spot's
    // static bloom duration). See local/reclassification-plan.md.
    speciesBlooming: integer("species_blooming"),
    // Snapshot of spots.stewardId as of this observation -- null both for
    // "spot was unstewarded at the time" and "predates spots.stewardStart,
    // can't tell." Drives the observation-card glyph's solid/outline fill,
    // same purpose spots.stewardId serves for the map pin. Set at insert
    // time by createObservation; see stewardStart above for how existing
    // rows get backfilled.
    stewardId: uuid("steward_id").references(() => stewards.stewardId, {
      onDelete: "set null",
    }),
    photoUrls: text("photo_urls")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    inaturalistObsUrl: text("inaturalist_obs_url"),
    // Nullable to keep the migration cheap on existing rows: NULL means
    // 'keeper', so readers must test `source IS DISTINCT FROM 'gsv'`, never
    // `source = 'keeper'`. 'keeper' (a person's own visit, the default) or 'gsv' (a pointer to a
    // Google Street View frame, backdated to its capture month). Plain text
    // rather than pgEnum, same convention as vegetation/weedLevel above. GSV
    // rows have null observerId/observerName/stewardId and empty photoUrls --
    // who attached the frame is recorded as gsvRef.addedBy. No Google imagery
    // is ever stored, only the pano ID and view parameters.
    source: text("source").default("keeper"),
    gsvRef: jsonb("gsv_ref").$type<{
      panoId: string;
      captureDate: string; // "YYYY-MM" as Google reports it
      panoLat: number;
      panoLng: number;
      heading: number;
      pitch: number;
      fov: number;
      addedBy: string; // users.userId of the person who attached it
    } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("observations_spot_id_idx").on(table.spotId, table.observedAt),
    uniqueIndex("observations_gsv_pano_uniq")
      .on(table.spotId, sql`(${table.gsvRef}->>'panoId')`)
      .where(sql`${table.source} = 'gsv'`),
    check(
      "observations_gsv_ref_chk",
      sql`(COALESCE(${table.source}, 'keeper') = 'gsv') = (${table.gsvRef} IS NOT NULL)`,
    ),
  ],
);

// Audit trail of create/update/delete operations across the app's main
// entities -- who did what to which row and when. `entityId` is text (not a
// real FK) since it has to hold both integer ids (spots, sites) and uuids
// (observations, stewards, users) uniformly across one column. `changes` is
// {fieldName: {from, to}} -- from is null on create, to is null on delete,
// see diffFields/snapshotToChanges in packages/core/src/events.ts. Internal
// caches (parcels, subdivisions, verification_tokens) are deliberately not
// logged here -- they're system-derived/ephemeral, not user actions.
export const events = pgTable(
  "events",
  {
    eventId: uuid("event_id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    userId: uuid("user_id").references(() => users.userId, {
      onDelete: "set null",
    }),
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("events_entity_idx").on(table.entityType, table.entityId),
    index("events_created_at_idx").on(table.createdAt),
    index("events_user_id_idx").on(table.userId),
  ],
);

// One row per photo attached to an observation. Added alongside
// observations.photoUrls (text[]), not as a replacement for it yet --
// createObservation dual-writes into both, so this table can build up
// structured data (uploader, storage key, moderation outcome) before any UI
// switches over to reading from here. See local/future-work.md #9.
export const photos = pgTable(
  "photos",
  {
    photoId: uuid("photo_id").primaryKey().defaultRandom(),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.observationId, { onDelete: "cascade" }),
    url: text("url").notNull(),
    // The object key in our own storage (packages/core/src/photoStorage.ts),
    // set only for natively-uploaded photos -- null for pasted external
    // URLs, which have no object we control to key by.
    storageKey: text("storage_key"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(
      () => users.userId,
      { onDelete: "set null" },
    ),
    moderationStatus: photoModerationStatusEnum("moderation_status").notNull(),
    // Dimensions/bytes of the stored original plus the derived medium and
    // thumb WebP copies (see local/photo-updates.md). Null for pasted
    // external URLs and for native rows not yet regenerated -- readers fall
    // back to `url`. A non-null value means all three objects exist.
    variants: jsonb("variants").$type<PhotoVariants | null>(),
    originalFilename: text("original_filename"),
    sizeBytes: integer("size_bytes"),
    // Set when the stored bytes change after upload (admin replace or
    // regenerate). Keys are reused, so photoSrc appends it as a ?v= cache
    // buster.
    replacedAt: timestamp("replaced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("photos_observation_id_idx").on(table.observationId)],
);

export type PhotoVariants = {
  original: { w: number; h: number; bytes: number; mime: string };
  medium?: { w: number; h: number; bytes: number };
  thumb?: { w: number; h: number; bytes: number };
};

// A Placekeeping user's linked account in an external work-management system
// (Asana first -- see local/asana-integration.md). One user can link several
// remote workspaces, and one remote account can be linked by several users.
// `system` is plain text validated in app code (not a pgEnum) so adding
// Trello/GitHub later needs no migration. Tokens are AES-GCM encrypted by
// @placekeeping/core before they reach this table; never store plaintext.
export const externalIdentities = pgTable(
  "external_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    system: text("system").notNull(),
    remoteWorkspaceId: text("remote_workspace_id").notNull(),
    remoteWorkspaceName: text("remote_workspace_name"),
    remoteUserId: text("remote_user_id").notNull(),
    remoteUserName: text("remote_user_name"),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    // "active" | "revoked" -- app-level, like `system`.
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("external_identities_unique_idx").on(
      table.userId,
      table.system,
      table.remoteWorkspaceId,
      table.remoteUserId,
    ),
    index("external_identities_user_idx").on(table.userId),
  ],
);

// Binds a site (or a single spot, overriding its site's binding) to a
// container in an external system -- an Asana project, for now. Exactly one
// of siteId/spotId/stewardId is set (scope is implied by which). See
// local/asana-integration.md.
export const integrationBindings = pgTable(
  "integration_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: integer("site_id").references(() => sites.siteId, {
      onDelete: "cascade",
    }),
    spotId: integer("spot_id").references(() => spots.spotId, {
      onDelete: "cascade",
    }),
    // A steward-level binding is the default for every spot that steward
    // holds; a site or spot binding overrides it (spot > site > steward).
    stewardId: uuid("steward_id").references(() => stewards.stewardId, {
      onDelete: "cascade",
    }),
    system: text("system").notNull(),
    remoteWorkspaceId: text("remote_workspace_id").notNull(),
    remoteProjectId: text("remote_project_id").notNull(),
    remoteProjectName: text("remote_project_name"),
    remoteSectionId: text("remote_section_id"),
    configuredBy: uuid("configured_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("integration_bindings_site_idx")
      .on(table.siteId, table.system)
      .where(sql`${table.siteId} IS NOT NULL`),
    uniqueIndex("integration_bindings_spot_idx")
      .on(table.spotId, table.system)
      .where(sql`${table.spotId} IS NOT NULL`),
    uniqueIndex("integration_bindings_steward_idx")
      .on(table.stewardId, table.system)
      .where(sql`${table.stewardId} IS NOT NULL`),
    check(
      "integration_bindings_scope_chk",
      sql`(${table.siteId} IS NOT NULL)::int + (${table.spotId} IS NOT NULL)::int + (${table.stewardId} IS NOT NULL)::int = 1`,
    ),
  ],
);

// A pointer from a Placekeeping row to a thing in an external system, plus a
// small cache of its title/status (refreshed on page load). `targetId` is
// text, like events.entityId, to hold integer spot ids and uuid observation
// ids uniformly; `targetType` is "spot" | "site" | "observation".
export const externalLinks = pgTable(
  "external_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    system: text("system").notNull(),
    remoteType: text("remote_type").notNull(),
    remoteId: text("remote_id").notNull(),
    remoteUrl: text("remote_url").notNull(),
    cachedTitle: text("cached_title"),
    // "open" | "done"
    cachedStatus: text("cached_status"),
    cachedAt: timestamp("cached_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("external_links_target_idx").on(table.targetType, table.targetId),
    uniqueIndex("external_links_remote_idx").on(
      table.system,
      table.remoteType,
      table.remoteId,
      table.targetType,
      table.targetId,
    ),
  ],
);

// A repeating task template for an external task system (Asana). Scoped like
// integration_bindings: exactly one of stewardId/siteId/spotId, and a steward
// or site template fans out to one task per spot in scope. A scheduler
// (POST /api/cron/recurring-tasks) creates each occurrence `leadDays` before
// its due date, as `configuredBy`, using that user's stored token.
// `unit` is "week" | "month" | "year" and `status` is "active" | "paused",
// both validated in app code. Due dates are anchorDate + k * interval units
// (k = occurrenceCount), so month-end clamping never drifts.
export const recurringTasks = pgTable(
  "recurring_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stewardId: uuid("steward_id").references(() => stewards.stewardId, {
      onDelete: "cascade",
    }),
    siteId: integer("site_id").references(() => sites.siteId, {
      onDelete: "cascade",
    }),
    spotId: integer("spot_id").references(() => spots.spotId, {
      onDelete: "cascade",
    }),
    system: text("system").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    unit: text("unit").notNull(),
    interval: integer("interval").notNull().default(1),
    anchorDate: date("anchor_date").notNull(),
    leadDays: integer("lead_days").notNull().default(30),
    // Due date of the next occurrence not yet generated.
    nextDueOn: date("next_due_on").notNull(),
    occurrenceCount: integer("occurrence_count").notNull().default(0),
    status: text("status").notNull().default("active"),
    pausedReason: text("paused_reason"),
    configuredBy: uuid("configured_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("recurring_tasks_due_idx").on(table.status, table.nextDueOn),
    index("recurring_tasks_steward_idx").on(table.stewardId),
    index("recurring_tasks_site_idx").on(table.siteId),
    index("recurring_tasks_spot_idx").on(table.spotId),
    check(
      "recurring_tasks_scope_chk",
      sql`(${table.siteId} IS NOT NULL)::int + (${table.spotId} IS NOT NULL)::int + (${table.stewardId} IS NOT NULL)::int = 1`,
    ),
    check("recurring_tasks_interval_chk", sql`${table.interval} >= 1`),
    check("recurring_tasks_lead_chk", sql`${table.leadDays} >= 0`),
  ],
);

// One row per (template, spot, due date): the idempotency ledger. Rows are
// inserted before any task is created ("pending"), so a re-run never creates
// a duplicate; failures stay "failed" and are retried up to a cap.
// `status`: "pending" | "created" | "failed" | "skipped" (spot not bound).
export const recurringTaskOccurrences = pgTable(
  "recurring_task_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recurringTaskId: uuid("recurring_task_id")
      .notNull()
      .references(() => recurringTasks.id, { onDelete: "cascade" }),
    spotId: integer("spot_id")
      .notNull()
      .references(() => spots.spotId, { onDelete: "cascade" }),
    dueOn: date("due_on").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    externalLinkId: uuid("external_link_id").references(() => externalLinks.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recurring_task_occurrences_uniq").on(
      table.recurringTaskId,
      table.spotId,
      table.dueOn,
    ),
    index("recurring_task_occurrences_status_idx").on(table.status),
  ],
);

// A scheduled maintenance event on a site or a spot (UI copy: "event" or
// "workday"). Named care_events because `events` is the audit log. Exactly one
// of siteId/spotId is set, so deletes cascade. eventType, status and
// visibility are text validated in Zod (see shared-types careEvent.ts), not
// pg enums. Control/planting columns (control_method, authorization_id,
// aftercare, dig-safe) arrive with their gates in a later migration.
export const careEvents = pgTable(
  "care_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: integer("site_id").references(() => sites.siteId, {
      onDelete: "cascade",
    }),
    spotId: integer("spot_id").references(() => spots.spotId, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    eventType: text("event_type").notNull().default("cleanup"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    timeZone: text("time_zone").notNull(),
    locationText: text("location_text").notNull().default(""),
    // An outside page for the event (a sign-up sheet, a partner's listing).
    // http(s) only, set by managers; shown as an external link.
    url: text("url"),
    // planned | held | canceled
    status: text("status").notNull().default("planned"),
    // managers | members | public
    visibility: text("visibility").notNull().default("public"),
    signupOpen: boolean("signup_open").notNull().default(true),
    signupDeadline: timestamp("signup_deadline", { withTimezone: true }),
    whatToBring: text("what_to_bring").notNull().default(""),
    notesForVolunteers: text("notes_for_volunteers").notNull().default(""),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("care_events_site_idx").on(table.siteId, table.startAt),
    index("care_events_spot_idx").on(table.spotId, table.startAt),
    index("care_events_start_idx").on(table.startAt),
    check(
      "care_events_target_chk",
      sql`(${table.siteId} IS NOT NULL)::int + (${table.spotId} IS NOT NULL)::int = 1`,
    ),
    check("care_events_end_chk", sql`${table.endAt} > ${table.startAt}`),
  ],
);

// One row per (event, user). `confirmedAt` stays null until the emailed link
// is used; unconfirmed rows are purged after 48h and never counted publicly.
// `status` is going | canceled, `role` is lead | volunteer.
export const careEventParticipants = pgTable(
  "care_event_participants",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => careEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    status: text("status").notNull().default("going"),
    role: text("role").notNull().default("volunteer"),
    attended: boolean("attended"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    // The part of the event this person is coming for, as normalized text in
    // the event's local time zone: "HHMM-HHMM" 24-hour, e.g. "0900-1100".
    // null = the whole event. Validated in app code.
    timeslot: text("timeslot"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    // sha256 of the emailed confirmation token (guest sign-up); null once used.
    confirmationTokenHash: text("confirmation_token_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    index("care_event_participants_user_idx").on(table.userId),
    uniqueIndex("care_event_participants_token_idx").on(table.confirmationTokenHash),
  ],
);

// Fixed-window request counters for abuse control (see core/rateLimit.ts).
// Postgres rather than process memory because Cloud Run runs several
// instances. `key` is "<bucket>:<subject>" (subjects that are emails are
// hashed before they get here). Old windows are purged by the care-events
// maintenance job.
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index("rate_limits_window_idx").on(table.windowStart),
  ],
);

// Native tasks: small, always attached to a place (a site, spot, observation
// or care event -- exactly one, so deletes cascade). Visible to verified
// members and managers only. `status` is open | in_progress | done | dropped
// and `sourceType` (optional) is "observation" | "suggestion", both validated
// in app code. Spots/sites bound to Asana keep their tasks in Asana instead
// (see external_links); these rows then remain as read-only history.
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: integer("site_id").references(() => sites.siteId, {
      onDelete: "cascade",
    }),
    spotId: integer("spot_id").references(() => spots.spotId, {
      onDelete: "cascade",
    }),
    observationId: uuid("observation_id").references(
      () => observations.observationId,
      { onDelete: "cascade" },
    ),
    eventId: uuid("event_id").references(() => careEvents.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("open"),
    dueOn: date("due_on"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.userId, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.userId, {
      onDelete: "set null",
    }),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    // Mirror state for the Asana project this task's place is bound to
    // (native is the source of truth; the Asana task is a copy, recorded as
    // an external_links row with target_type "task"). null = not mirrored
    // (no binding); "pending" = needs a push; "synced"; "failed" = retried
    // by the task-sync job until `externalSyncAttempts` runs out. Validated
    // in app code.
    externalSyncStatus: text("external_sync_status"),
    externalSyncError: text("external_sync_error"),
    externalSyncAttempts: integer("external_sync_attempts").notNull().default(0),
    // When the two sides last agreed; a pull only applies Asana-side edits
    // made after this, and only if the task has not changed natively since.
    externalSyncedAt: timestamp("external_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("tasks_sync_idx").on(table.externalSyncStatus, table.externalSyncedAt),
    index("tasks_site_idx").on(table.siteId),
    index("tasks_spot_idx").on(table.spotId),
    index("tasks_observation_idx").on(table.observationId),
    index("tasks_event_idx").on(table.eventId),
    index("tasks_assignee_idx").on(table.assigneeUserId, table.status),
    index("tasks_due_idx").on(table.dueOn),
    check(
      "tasks_target_chk",
      sql`(${table.siteId} IS NOT NULL)::int + (${table.spotId} IS NOT NULL)::int + (${table.observationId} IS NOT NULL)::int + (${table.eventId} IS NOT NULL)::int = 1`,
    ),
  ],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.userId, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // The Asana story this comment is the other half of -- set both for
    // comments we pushed out and for ones pulled in, so neither is copied
    // back again. `externalAuthor` is the Asana display name for a pulled
    // comment whose author has no linked Placekeeping account (userId null).
    externalId: text("external_id"),
    externalAuthor: text("external_author"),
  },
  (table) => [
    index("task_comments_task_idx").on(table.taskId, table.createdAt),
    uniqueIndex("task_comments_external_idx")
      .on(table.taskId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
  ],
);
