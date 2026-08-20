import { z } from "zod";

// sites.geom still has no serialization decided (see local/place-split.md
// Open Question 4) so it's intentionally absent here. Spots reference sites
// via spotSchema.siteId in ./spot.ts; site_parcels membership is
// siteWithParcelsSchema below.
export const siteSchema = z.object({
  siteId: z.number().int().positive(),
  name: z.string().min(1),
  purpose: z.string().nullable(),
  gisOpenSpace: z.string().nullable(),
  gisLandUse: z.string().nullable(),
  hnpMapNumber: z.number().int().nullable(),
  stewardshipProgram: z.string().nullable(),
  stewardshipRef: z.string().nullable(),
  legalOwner: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdByUsername: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Site = z.infer<typeof siteSchema>;

export const createSiteSchema = z.object({
  name: z.string().min(1),
  purpose: z.string().optional(),
  gisOpenSpace: z.string().optional(),
  gisLandUse: z.string().optional(),
  hnpMapNumber: z.number().int().optional(),
  stewardshipProgram: z.string().optional(),
  stewardshipRef: z.string().optional(),
  legalOwner: z.string().optional(),
});
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const updateSiteSchema = createSiteSchema.partial();
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

// Body for DELETE /api/sites/:siteId/parcels -- an admin/creator manually
// dropping a parcel from the site's extent (see removeSiteParcel in
// @placekeeping/core).
export const removeSiteParcelSchema = z.object({ swisSblId: z.string() });
export type RemoveSiteParcelInput = z.infer<typeof removeSiteParcelSchema>;

// Site + its site_parcels membership, for the read-only site detail page.
export const siteWithParcelsSchema = siteSchema.extend({
  parcelSwisSblIds: z.array(z.string()),
});
export type SiteWithParcels = z.infer<typeof siteWithParcelsSchema>;
