import { z } from "zod";
import { siteSchema } from "./site";

// The owner-free cached-parcel shape — mirrors packages/db/src/schema.ts's
// `parcels` table. Never carries PRIMARY_OWNER/ADD_OWNER or any assessment
// field; see local/spot-resolution.md §4/§8.
export const parcelSchema = z.object({
  swisSblId: z.string(),
  swis: z.string().nullable(),
  printKey: z.string().nullable(),
  // The parcel's own site address (ArcGIS PARCEL_ADDR) -- public record,
  // not an owner/mailing field. See local/parcel-discovery.md.
  address: z.string().nullable(),
  countyName: z.string().nullable(),
  muniName: z.string().nullable(),
  cityTownName: z.string().nullable(),
  propClass: z.string().nullable(),
  calcAcres: z.number().nullable(),
  nysName: z.string().nullable(),
  rollYr: z.number().int().nullable(),
  spatialYr: z.number().int().nullable(),
  // Not owner data itself -- just whether owner has already been shown for
  // this parcel, so the client can skip re-offering "Show owner". See
  // packages/db/src/schema.ts's parcels.ownerRevealedAt.
  ownerRevealedAt: z.string().datetime().nullable(),
  // Best-effort "this boundary looks like it traces a road/ROW edge rather
  // than surveyed lot lines" hint -- see computeShapeFlag in
  // packages/core/src/parcels.ts. Not authoritative; a UI cue only.
  shapeFlag: z.boolean(),
});
export type Parcel = z.infer<typeof parcelSchema>;

// Raw GeoJSON MultiPolygon -- [lng, lat] coordinate order, per GeoJSON
// convention. Only ever attached to a ParcelCandidate, so the picker UI can
// draw candidate outlines on a map; the base Parcel DTO stays geometry-free.
export const multiPolygonGeometrySchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(z.array(z.array(z.number())))),
});
export type MultiPolygonGeometry = z.infer<typeof multiPolygonGeometrySchema>;

// One nearby-parcel option from the buffered "discover candidates" query
// (local/spot-resolution.md §4) -- `containsPin` flags the parcel whose
// boundary actually covers the pin (vs. one merely within the search
// radius), and candidates arrive pre-sorted contains-pin-first, then
// smallest-acreage-first, so the UI can render them in that order as-is.
// `geometry` lets the picker draw each candidate's outline on a map.
export const parcelCandidateSchema = parcelSchema.extend({
  containsPin: z.boolean(),
  geometry: multiPolygonGeometrySchema,
});
export type ParcelCandidate = z.infer<typeof parcelCandidateSchema>;

// Response shape for the parcel lookup/select flow (local/spot-resolution.md §4).
export const parcelLookupResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("resolved"),
    parcel: parcelSchema,
    isInstitutionalClass: z.boolean(),
    site: siteSchema.nullable(),
  }),
  // Live discovery found one or more nearby parcels -- present as choices,
  // not an auto-pick. Never persisted until POST /parcel/select confirms one.
  z.object({
    status: z.literal("candidates"),
    candidates: z.array(parcelCandidateSchema),
  }),
  z.object({
    status: z.literal("unparcelled"),
  }),
  // Persisted, deliberate "no parcel applies here" (spots.parcelStatus =
  // 'no_parcel') -- distinct from "unresolved", which just means nobody has
  // tried (or confirmed) a lookup yet.
  z.object({
    status: z.literal("no_parcel"),
  }),
  // Cache-only read (GET) found nothing yet -- distinct from "unparcelled",
  // which means a live lookup was already tried and came back empty.
  z.object({
    status: z.literal("unresolved"),
  }),
]);
export type ParcelLookupResult = z.infer<typeof parcelLookupResultSchema>;

// Body for POST /api/spots/:spotId/parcel/select -- confirms one candidate
// from a prior "candidates" lookup, or declares no parcel applies. Used by
// both the initial-discovery picker and the post-link "Change parcel" flow.
export const parcelSelectSchema = z.union([
  z.object({ swisSblId: z.string(), rollYr: z.number().int().nullable() }),
  z.object({ noParcel: z.literal(true) }),
]);
export type ParcelSelectInput = z.infer<typeof parcelSelectSchema>;

// Response shape for "Show owner" only (local/spot-resolution.md §5/§7).
// Never persisted — a request-lifecycle-only DTO. `suggestedSiteName` is
// entity-only per §7's fail-closed heuristic; null means the owner looks
// like a natural person and the field should be left for the user.
export const parcelOwnerInfoSchema = z.object({
  primaryOwner: z.string().nullable(),
  addOwner: z.string().nullable(),
  suggestedSiteName: z.string().nullable(),
});
export type ParcelOwnerInfo = z.infer<typeof parcelOwnerInfoSchema>;

// A neighboring-parcel site candidate for the join flow (§6). `ownerMatch`
// is only ever populated for institutional classes — never used to
// auto-join, only to strengthen a candidate's presentation.
export const siteCandidateSchema = z.object({
  site: siteSchema,
  ownerMatch: z.boolean().optional(),
});
export type SiteCandidate = z.infer<typeof siteCandidateSchema>;

// Body for POST /api/spots/:spotId/site — the §8 cascade save. Either join
// an existing (already-resolved or candidate) site, or create a new one
// scoped to the spot's resolved parcel.
export const linkSpotToSiteSchema = z.union([
  z.object({ siteId: z.number().int().positive() }),
  z.object({
    newSite: z.object({
      name: z.string().min(1),
      purpose: z.string().nullable(),
    }),
  }),
]);
export type LinkSpotToSiteInput = z.infer<typeof linkSpotToSiteSchema>;

// Body for PATCH /api/sites/:siteId/parcels -- an admin/creator moving a
// parcel (and any spot still resolved to it) to a different site, existing
// or brand new. Same target shape as linkSpotToSiteSchema, plus the parcel
// being moved.
export const reassignSiteParcelSchema = z.union([
  z.object({ swisSblId: z.string(), siteId: z.number().int().positive() }),
  z.object({
    swisSblId: z.string(),
    newSite: z.object({
      name: z.string().min(1),
      purpose: z.string().nullable(),
    }),
  }),
]);
export type ReassignSiteParcelInput = z.infer<typeof reassignSiteParcelSchema>;
