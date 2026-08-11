import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
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

// vegetation and weed_level are intentionally plain text, not pgEnum: the
// taxonomy is still being actively reshaped, and the set of valid values is
// enforced at the application boundary by the Zod schemas in
// @placekeeping/shared-types. A DB-level enum would mean every rename or
// re-grading needs a type-recreate migration for no added safety.

export const spotPurposeEnum = pgEnum("spot_purpose", [
  "garden",
  "monument",
  "wild_area",
  "none",
]);

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
  (table) => [uniqueIndex("subdivisions_path_idx").on(table.path)],
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
    vegetation: text("vegetation"),
    weedLevel: text("weed_level").notNull().default("minimal"),
    educationalComponent: boolean("educational_component")
      .notNull()
      .default(false),
    educationalNotes: text("educational_notes"),
    stewardId: uuid("steward_id").references(() => stewards.stewardId, {
      onDelete: "set null",
    }),
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
    purpose: spotPurposeEnum("purpose"),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("observations_spot_id_idx").on(table.spotId, table.observedAt),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("photos_observation_id_idx").on(table.observationId)],
);
