import { z } from "zod";
import { focusSchema, vegetationSchema, weedLevelSchema } from "./enums";

// One row per photo attached to an observation (packages/db/src/schema.ts's
// `photos` table) -- the addressable id behind an observation/photo
// permalink, unlike the plain URLs in observationSchema.photoUrls below.
const imageSizeSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  bytes: z.number().int().nonnegative(),
});

// Stored original plus derived medium/thumb WebP copies -- see
// photos.variants in packages/db/src/schema.ts.
export const photoVariantsSchema = z.object({
  original: imageSizeSchema.extend({ mime: z.string().min(1) }),
  medium: imageSizeSchema.optional(),
  thumb: imageSizeSchema.optional(),
});
export type PhotoVariants = z.infer<typeof photoVariantsSchema>;

export const photoSchema = z.object({
  photoId: z.string().uuid(),
  observationId: z.string().uuid(),
  // The original, as stored (and as dual-written into observations.photoUrls).
  url: z.string().url(),
  // Ready-to-use src per variant, built server-side (core photoSrc): falls
  // back to `url` when the photo has no derived copies, and carries a ?v=
  // cache buster after an admin replace.
  urls: z.object({
    original: z.string().url(),
    medium: z.string().url(),
    thumb: z.string().url(),
  }),
  // Pixel size of each src above when known, to reserve space before load.
  // Null when the photo has no stored dimensions (legacy / external).
  sizes: z.object({
    original: z.object({ w: z.number(), h: z.number() }).nullable(),
    medium: z.object({ w: z.number(), h: z.number() }).nullable(),
    thumb: z.object({ w: z.number(), h: z.number() }).nullable(),
  }),
  createdAt: z.string().datetime(),
});
export type Photo = z.infer<typeof photoSchema>;

// One row of the admin photo manager (/admin/photos): a photo joined to its
// observation, spot and uploader. Filtering/sorting/grouping happen client
// side over the full list (see apps/web/src/lib/adminPhotoView.ts).
export type AdminPhotoRow = {
  photoId: string;
  observationId: string;
  spotId: number;
  spotName: string;
  uploaderId: string | null;
  uploaderName: string | null;
  createdAt: string;
  replacedAt: string | null;
  storageKey: string | null;
  source: "native" | "external";
  // n/a for external-URL photos, which have no objects of ours.
  variantStatus: "ready" | "missing" | "n/a";
  originalW: number | null;
  originalH: number | null;
  sizeBytes: number | null;
  originalFilename: string | null;
  moderationStatus: string;
  variants: PhotoVariants | null;
  thumbUrl: string;
  mediumUrl: string;
  originalUrl: string;
};

// What POST /api/photos reports about a stored upload. The client echoes it
// back alongside the photo url when saving an observation, because the
// `photos` row is written later by createObservation/updateObservation,
// which only otherwise receive the url. The server re-validates it (own
// storage url, all three objects exist) before trusting it.
export const photoUploadMetaSchema = z.object({
  variants: photoVariantsSchema,
  originalFilename: z.string().max(255).nullable().optional(),
  sizeBytes: z.number().int().positive(),
});
export type PhotoUploadMeta = z.infer<typeof photoUploadMetaSchema>;
// Keyed by photo url.
export const photoMetaMapSchema = z.record(z.string().url(), photoUploadMetaSchema);

// Pointer to a Google Street View frame -- see observations.gsvRef in
// packages/db/src/schema.ts. No imagery is stored, only what's needed to
// rebuild the frame URL.
export const gsvRefSchema = z.object({
  panoId: z.string().min(1),
  captureDate: z.string().regex(/^\d{4}-\d{2}$/), // "YYYY-MM"
  panoLat: z.number(),
  panoLng: z.number(),
  heading: z.number(),
  pitch: z.number(),
  fov: z.number(),
  addedBy: z.string().uuid(),
});
export type GsvRef = z.infer<typeof gsvRefSchema>;

export const observationSchema = z.object({
  observationId: z.string().uuid(),
  spotId: z.number().int().positive(),
  observedAt: z.string(),
  observerName: z.string().nullable(),
  observerId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  // What was growing, and how weedy, at the time of this visit -- distinct
  // from spots.vegetation/weedLevel (the site's current state). Null for
  // observations logged before these columns existed and never backfilled,
  // or any caller that doesn't record them.
  vegetation: vegetationSchema.nullable(),
  weedLevel: weedLevelSchema.nullable(),
  // This visit's own Focus read, independent of spots.focus -- see
  // local/reclassification-plan.md. Replaces `vegetation` once every spot's
  // history is backfilled (local/reclassification-migration.md's
  // Observations section); both are read simultaneously until then.
  focus: focusSchema.nullable(),
  // Per-visit estimated count of species in bloom (0, 1, 2, 3, 4+ are
  // input/display bins, not the stored format -- see local/reclassification-plan.md's
  // Observation section and SPECIES_BLOOMING_BINS, shared by ObservationForm
  // and QuickAddSpotDialog). Record only, doesn't feed the pin.
  speciesBlooming: z.number().int().nonnegative().nullable(),
  // Snapshot of the spot's stewardId as of this observation -- set by
  // createObservation, not user-editable. Null means "unstewarded at the
  // time" or "predates spots.stewardStart, can't tell" -- see schema.ts.
  stewardId: z.string().uuid().nullable(),
  photoUrls: z.array(z.string().url()),
  // Populated only by listObservationsForSpot (a join against the `photos`
  // table) -- gives each photo a stable id for permalinks. Undefined for
  // Observation values built elsewhere (create/update responses etc.).
  photos: z.array(photoSchema).optional(),
  inaturalistObsUrl: z.string().url().nullable(),
  // 'keeper' for a person's own visit, 'gsv' for a Street View frame pointer
  // (gsvRef is non-null exactly when source is 'gsv').
  source: z.enum(["keeper", "gsv"]),
  gsvRef: gsvRefSchema.nullable(),
  createdAt: z.string().datetime(),
});
export type Observation = z.infer<typeof observationSchema>;

export const createObservationSchema = z.object({
  observedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
    .optional(),
  observerName: z.string().optional(),
  notes: z.string().optional(),
  vegetation: vegetationSchema.optional(),
  weedLevel: weedLevelSchema.optional(),
  focus: focusSchema.optional(),
  speciesBlooming: z.number().int().nonnegative().optional(),
  photoUrls: z.array(z.string().url()).default([]),
  photoMeta: photoMetaMapSchema.optional(),
  inaturalistObsUrl: z.string().url().optional(),
  // "Log stewardship activity" at creation time, in one step instead of
  // create-then-claim -- see claimObservationStewardship. Ignored server-side
  // unless the caller is actually a steward; doesn't persist as a field of
  // its own, just picks which stewardId createObservation snapshots.
  claimStewardship: z.boolean().optional(),
});
export type CreateObservationInput = z.infer<typeof createObservationSchema>;

// How long after logging an observation its submitter may still edit it --
// see auth.canEditObservation. Long enough to fix a typo or swap a photo,
// short enough that it isn't a standing right to rewrite history other
// stewards may have already seen.
export const OBSERVATION_EDIT_WINDOW_MS = 30 * 60 * 1000;

// Deliberately omits observerName (tied to the account that logged it, not
// editable after the fact) -- every other field, undefined means "leave
// unchanged" so a caller can patch just one field at a time.
export const updateObservationSchema = z.object({
  observedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date")
    .optional(),
  notes: z.string().optional(),
  vegetation: vegetationSchema.optional(),
  weedLevel: weedLevelSchema.optional(),
  focus: focusSchema.optional(),
  speciesBlooming: z.number().int().nonnegative().optional(),
  photoUrls: z.array(z.string().url()).optional(),
  photoMeta: photoMetaMapSchema.optional(),
  inaturalistObsUrl: z.string().url().optional(),
});
export type UpdateObservationInput = z.infer<typeof updateObservationSchema>;

export const photoMetadataQuerySchema = z.object({
  url: z.string().url(),
});
export type PhotoMetadataQuery = z.infer<typeof photoMetadataQuerySchema>;

export const photoMetadataSchema = z.object({
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type PhotoMetadata = z.infer<typeof photoMetadataSchema>;

export const photoUploadResponseSchema = z.object({
  url: z.string().url(),
  // Absent when the caller asked for a single display copy (see
  // POST /api/photos `variant`): no photos row follows for those uploads.
  meta: photoUploadMetaSchema.optional(),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
});
export type PhotoUploadResponse = z.infer<typeof photoUploadResponseSchema>;

export const gsvResolveRequestSchema = z.object({
  url: z.string().min(1).max(2000),
});

export const GSV_MAX_COMMIT_ITEMS = 20;
export const gsvCommitRequestSchema = z.object({
  items: z
    .array(
      z.object({
        panoId: z.string().min(1).max(200),
        heading: z.number(),
        pitch: z.number(),
        fov: z.number(),
      }),
    )
    .min(1)
    .max(GSV_MAX_COMMIT_ITEMS),
});
export type GsvCommitRequest = z.infer<typeof gsvCommitRequestSchema>;

export type GsvCandidate = {
  panoId: string;
  captureDate: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
  fov: number;
  imageUrl: string;
  alreadyAdded: boolean;
};
