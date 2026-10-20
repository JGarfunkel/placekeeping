import { z } from "zod";

// Species identification -- see local/species-id.md.

// A rectangle on a photo as fractions (0..1) of its width/height, so it stays
// valid at any display size. Absent/null means "the whole photo".
export const cropRectSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  .refine((c) => c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001, {
    message: "Rectangle must lie inside the photo",
  });
export type CropRect = z.infer<typeof cropRectSchema>;

// Pl@ntNet's organ labels. "auto" lets it guess from the image.
export const PLANT_ORGANS = ["auto", "flower", "leaf", "fruit", "bark", "habit"] as const;
export const plantOrganSchema = z.enum(PLANT_ORGANS);
export type PlantOrgan = z.infer<typeof plantOrganSchema>;

export const identifyRequestSchema = z.object({
  photoId: z.string().uuid(),
  crop: cropRectSchema.nullish(),
  organ: plantOrganSchema.default("auto"),
});
export type IdentifyRequest = z.infer<typeof identifyRequestSchema>;

export const manualSpeciesRequestSchema = z.object({
  photoId: z.string().uuid(),
  crop: cropRectSchema.nullish(),
  scientificName: z.string().trim().min(2).max(200),
  commonName: z.string().trim().max(200).optional(),
});
export type ManualSpeciesRequest = z.infer<typeof manualSpeciesRequestSchema>;

// Body of the confirm and reject routes.
export const plantDecisionRequestSchema = z.object({
  observationPlantId: z.string().uuid(),
});
export type PlantDecisionRequest = z.infer<typeof plantDecisionRequestSchema>;

export type PlantStatus = "suggested" | "verified" | "rejected";
export type PlantSource = "plantnet" | "keeper";

export type Taxon = {
  taxonId: string;
  scientificName: string;
  commonName: string | null;
  family: string | null;
};

export type ObservationPlant = {
  observationPlantId: string;
  taxon: Taxon;
  source: PlantSource;
  score: number | null;
  status: PlantStatus;
};

export type Identification = {
  identificationId: string;
  observationId: string;
  photoId: string;
  crop: CropRect | null;
  createdAt: string;
  plants: ObservationPlant[];
};

// What the observation card needs to pick its button (Find / Review / Show
// Species List). Rejected rows don't count.
export type SpeciesCounts = { verified: number; suggested: number };

export type IdentifyResult = {
  identification: Identification;
  // True when Pl@ntNet answered but nothing cleared the score threshold; the
  // UI offers manual entry.
  noMatch: boolean;
  // Remaining Pl@ntNet requests today when it reported them.
  remainingRequests: number | null;
};
