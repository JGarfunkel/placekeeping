import { z } from "zod";

export const announcementStatusValues = ["log", "warn", "error"] as const;
export const announcementStatusSchema = z.enum(announcementStatusValues);
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;

export const stewardTypeValues = [
  "individual",
  "school",
  "club",
  "nonprofit",
  "municipality",
] as const;
export const stewardTypeSchema = z.enum(stewardTypeValues);
export type StewardType = z.infer<typeof stewardTypeSchema>;

// Every non-individual steward type is a group, administered by one or more
// users via steward_members rather than owned by a single login -- see
// isGroupStewardType below. Kept as its own literal tuple (rather than
// filtering stewardTypeValues) so the schema retains a proper literal union.
export const groupStewardTypeValues = [
  "school",
  "club",
  "nonprofit",
  "municipality",
] as const;
export const groupStewardTypeSchema = z.enum(groupStewardTypeValues);
export type GroupStewardType = z.infer<typeof groupStewardTypeSchema>;

// No separate "isGroup" column: type already carries this distinction, and
// a boolean alongside it would just be a second source of truth.
export function isGroupStewardType(type: StewardType): boolean {
  return type !== "individual";
}

export const stewardMemberRoleValues = ["admin", "member"] as const;
export const stewardMemberRoleSchema = z.enum(stewardMemberRoleValues);
export type StewardMemberRole = z.infer<typeof stewardMemberRoleSchema>;

// Verification/standing tier shared by users.level and stewards.level (see
// schema.ts) -- kept as a plain integer rather than a pgEnum since further
// tiers may be added later (e.g. more partner grades), same convention as
// vegetation/weedLevel above. -1 and 2 aren't reachable through any
// self-service flow yet (only db:set-level), but the labels are canonical
// for display wherever a level is shown.
export const knownLevelValues = [-1, 0, 1, 2] as const;
export type KnownLevel = (typeof knownLevelValues)[number];
export const LEVEL_LABELS: Record<KnownLevel, string> = {
  [-1]: "Suspended",
  0: "Unverified",
  1: "Verified member",
  2: "Partner",
};

// Falls back to the raw number for any level outside the known range above,
// so display code never crashes on a value db:set-level allowed through.
export function levelLabel(level: number): string {
  return LEVEL_LABELS[level as KnownLevel] ?? `Level ${level}`;
}

export const placeAccessibilityValues = [
  "public",
  "designated_members_guests",
] as const;
export const placeAccessibilitySchema = z.enum(placeAccessibilityValues);
export type PlaceAccessibility = z.infer<typeof placeAccessibilitySchema>;

export const vegetationValues = [
  "vegetable_herb",
  "ornamental",
  "pollinator",
  "wetland",
  "woodland",
  "grassland",
  "mowed_lawn",
  "herbaceous_weeds", // renamed from light_weeds
  "vigorous_weeds",
  "none",
] as const;
export const vegetationSchema = z.enum(vegetationValues);
export type Vegetation = z.infer<typeof vegetationSchema>;

// Vegetation values that record "weeds are the vegetation" rather than a
// problem on top of some other vegetation. See weed_level below for that.
export const WEED_VEGETATION = new Set<Vegetation>([
  "herbaceous_weeds",
  "vigorous_weeds",
]);

export const weedLevelValues = ["minimal", "light", "thick", "overtaken"] as const;
export const weedLevelSchema = z.enum(weedLevelValues);
export type WeedLevel = z.infer<typeof weedLevelSchema>;

// Purpose vocabulary for a spot (the pin) — feeds pin glyph/colour
// resolution via apps/web/src/lib/pins/resolveSpotPin.ts.
export const spotPurposeValues = [
  "garden",
  "monument",
  "wild_area",
  "none",
] as const;
export const spotPurposeSchema = z.enum(spotPurposeValues);
export type SpotPurpose = z.infer<typeof spotPurposeSchema>;

export const placeAccessValues = [
  "public",
  "none",
  "private_club",
  "school",
  "visible_from_street",
] as const;
export const placeAccessSchema = z.enum(placeAccessValues);
export type PlaceAccess = z.infer<typeof placeAccessSchema>;

// Accessibility is derived from access rather than captured separately: a
// private club is inherently restricted to designated members & guests,
// while every other access value (including a school, which is public with
// a legitimate-purpose caveat) reads as publicly accessible.
export function deriveAccessibility(
  access: PlaceAccess | null | undefined,
): PlaceAccessibility {
  return access === "private_club" ? "designated_members_guests" : "public";
}

// Governs whether a spot's street-level address is shown to non-owner
// viewers. See local/spot-resolution.md §2 — this is the "residential
// opt-in" control, not a parcel-specific toggle.
export const addressVisibilityValues = [
  "public",
  "municipality",
  "hidden",
] as const;
export const addressVisibilitySchema = z.enum(addressVisibilityValues);
export type AddressVisibility = z.infer<typeof addressVisibilitySchema>;

// Null (not part of this schema -- see spotSchema's `.nullable()`) means
// legacy/never-explicitly-resolved. 'resolved' is always paired with a
// non-null parcelSbl; 'no_parcel' is a deliberate, persisted "no parcel
// applies here" (e.g. the pin is in the street), distinct from a spot that
// was simply never checked. See local/spot-resolution.md.
export const parcelStatusValues = ["resolved", "no_parcel"] as const;
export const parcelStatusSchema = z.enum(parcelStatusValues);
export type ParcelStatus = z.infer<typeof parcelStatusSchema>;

// Depth in the /<cc>/<sc>/<mc> territory path, not a US-specific "country/
// state/municipality" label -- other countries can have e.g. a county at
// level 1 instead of a state. See subdivisions.level in schema.ts.
export const territoryLevelValues = [0, 1, 2] as const;
export type TerritoryLevel = (typeof territoryLevelValues)[number];
export const TERRITORY_LEVEL_LABELS: Record<TerritoryLevel, string> = {
  0: "country",
  1: "state",
  2: "locality",
};

// The kind of jurisdiction a subdivisions row represents, at any level (a
// level-0 row is always "country", level-1 "state") -- kept as plain text
// rather than a pgEnum since new local-government types (e.g. NJ's borough/
// township/district) surface as more countries/states are added, and a
// pgEnum would need a migration for each one. Not exhaustive -- see
// MunicipalityType in ./states/types for the narrower set actually
// resolvable via a state's civilBoundaries GIS source today.
export const territoryTypeValues = [
  "country",
  "state",
  "county",
  "city",
  "town",
  "village",
  "borough",
  "township",
  "district",
  "zip",
] as const;
export const territoryTypeSchema = z.enum(territoryTypeValues);
export type TerritoryType = z.infer<typeof territoryTypeSchema>;
