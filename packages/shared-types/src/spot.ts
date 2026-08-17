import { z } from "zod";
import {
  addressVisibilitySchema,
  parcelStatusSchema,
  placeAccessibilitySchema,
  placeAccessSchema,
  spotPurposeSchema,
  vegetationSchema,
  weedLevelSchema,
} from "./enums";

export const spotSchema = z.object({
  spotId: z.number().int().positive(),
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().nullable(),
  parcelId: z.string().nullable(),
  // System-resolved (local containment or Find Parcel), read-only on the
  // DTO — not part of createSpotSchema/updateSpotSchema.
  parcelSbl: z.string().nullable(),
  resolvedRollYr: z.number().int().nullable(),
  parcelStatus: parcelStatusSchema.nullable(),
  addressVisibility: addressVisibilitySchema,
  state: z.string().nullable(),
  municipality: z.string().nullable(),
  postalCity: z.string().nullable(),
  county: z.string().nullable(),
  useMunicipalityForSlug: z.boolean(),
  slugState: z.string().nullable(),
  slugLocality: z.string().nullable(),
  slug: z.string().nullable(),
  sizeSqft: z.number().nullable(),
  // Derived from `access`, not stored — see deriveAccessibility in ./enums.
  accessibility: placeAccessibilitySchema,
  vegetation: vegetationSchema.nullable(),
  weedLevel: weedLevelSchema,
  educationalComponent: z.boolean(),
  educationalNotes: z.string().nullable(),
  stewardId: z.string().uuid().nullable(),
  // True when this spot's steward is (or will be, once claimed) its own
  // legal owner rather than a third-party caretaker. Independent of
  // stewardId -- see stewardIsOwner on the spots table in
  // packages/db/src/schema.ts.
  stewardIsOwner: z.boolean(),
  stewardName: z.string().nullable(),
  // Set once at spot creation from the authenticated caller; unlike
  // stewardId it's never reassigned or cleared by updateSpot. Not part of
  // createSpotSchema/updateSpotSchema — server-derived, not client-set.
  // Keyed on the user, not a steward, since not every caller has registered
  // as a steward.
  createdByUserId: z.string().uuid().nullable(),
  siteId: z.number().int().positive().nullable(),
  purpose: spotPurposeSchema.nullable(),
  access: placeAccessSchema.nullable(),
  description: z.string().nullable(),
  needs: z.string().nullable(),
  plans: z.string().nullable(),
  website: z.string().nullable(),
  coverPhotoUrl: z.string().url().nullable(),
  photoAlbumUrl: z.string().url().nullable(),
  inaturalistUrl: z.string().url().nullable(),
  dateAdded: z.string().datetime(),
  lastVerified: z.string().datetime().nullable(),
});
export type Spot = z.infer<typeof spotSchema>;

export const spotSummarySchema = spotSchema
  .pick({
    spotId: true,
    name: true,
    latitude: true,
    longitude: true,
    accessibility: true,
    vegetation: true,
    purpose: true,
    weedLevel: true,
    stewardId: true,
    stewardIsOwner: true,
    coverPhotoUrl: true,
    // Lets callers link to the friendly /spots/us/<state>/<locality>/<slug>
    // URL instead of the numeric /spots/<id> one (see SiteMapAndParcels'
    // spot list) -- null until a spot has enough geo data to slug.
    slugState: true,
    slugLocality: true,
    slug: true,
  })
  .extend({ distanceMeters: z.number().optional() });
export type SpotSummary = z.infer<typeof spotSummarySchema>;

export const createSpotSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().optional(),
  parcelId: z.string().optional(),
  addressVisibility: addressVisibilitySchema.default("public"),
  state: z.string().optional(),
  municipality: z.string().optional(),
  postalCity: z.string().optional(),
  county: z.string().optional(),
  useMunicipalityForSlug: z.boolean().default(false),
  // Manual override for the final /<state>/<locality>/<slug> URL segment.
  // Slugified and uniqueness-suffixed server-side (see computeSpotSlug) --
  // omit/blank to auto-derive from `name` as before.
  slug: z.string().optional(),
  sizeSqft: z.number().positive().optional(),
  vegetation: vegetationSchema.optional(),
  weedLevel: weedLevelSchema.default("minimal"),
  educationalComponent: z.boolean().default(false),
  educationalNotes: z.string().optional(),
  stewardId: z.string().uuid().nullable().optional(),
  // Independent of stewardId -- can be set on an unstewarded spot ahead of
  // an owner claiming it later. See spots.stewardIsOwner in
  // packages/db/src/schema.ts.
  stewardIsOwner: z.boolean().optional(),
  stewardName: z.string().optional(),
  siteId: z.number().int().positive().optional(),
  purpose: spotPurposeSchema.optional(),
  access: placeAccessSchema.optional(),
  description: z.string().optional(),
  needs: z.string().optional(),
  plans: z.string().optional(),
  website: z.string().url().optional(),
  coverPhotoUrl: z.string().url().optional(),
  // EXIF capture date of coverPhotoUrl, read client-side at upload time (see
  // POST /api/photos) -- used to backdate the initial observation createSpot
  // logs for this photo instead of defaulting it to today. Ignored unless
  // coverPhotoUrl is also set.
  coverPhotoObservedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
    .optional(),
  photoAlbumUrl: z.string().url().optional(),
  inaturalistUrl: z.string().url().optional(),
});
export type CreateSpotInput = z.infer<typeof createSpotSchema>;

export const updateSpotSchema = createSpotSchema.partial();
export type UpdateSpotInput = z.infer<typeof updateSpotSchema>;

export const spotOptionSchema = spotSchema.pick({
  spotId: true,
  name: true,
  municipality: true,
});
export type SpotOption = z.infer<typeof spotOptionSchema>;

export const spotSearchQuerySchema = z.object({
  q: z.string().min(1),
  excludeSpotId: z.coerce.number().int().positive().optional(),
});
export type SpotSearchQuery = z.infer<typeof spotSearchQuerySchema>;

export const nearbySpotsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMi: z.coerce.number().positive().max(1250).default(15),
  stewardId: z.string().uuid().optional(),
  unstewarded: z.coerce.boolean().optional(),
  vegetation: vegetationSchema.optional(),
});
export type NearbySpotsQuery = z.infer<typeof nearbySpotsQuerySchema>;
