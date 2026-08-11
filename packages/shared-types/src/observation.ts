import { z } from "zod";
import { vegetationSchema, weedLevelSchema } from "./enums";

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
  // Snapshot of the spot's stewardId as of this observation -- set by
  // createObservation, not user-editable. Null means "unstewarded at the
  // time" or "predates spots.stewardStart, can't tell" -- see schema.ts.
  stewardId: z.string().uuid().nullable(),
  photoUrls: z.array(z.string().url()),
  inaturalistObsUrl: z.string().url().nullable(),
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
  photoUrls: z.array(z.string().url()).default([]),
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
  photoUrls: z.array(z.string().url()).optional(),
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
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
});
export type PhotoUploadResponse = z.infer<typeof photoUploadResponseSchema>;
