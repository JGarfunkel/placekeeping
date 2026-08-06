import { z } from "zod";

// Used for both header names and enum values, so e.g. "Size (Acres)" and
// "Multipurpose" line up with our field keys / DB enum values without
// a manual alias table.
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Slugified spreadsheet header -> our normalized field key.
export const HEADER_MAP: Record<string, string> = {
  state: "state",
  municipality: "municipality",
  name: "name",
  owner: "owner",
  steward: "stewardName",
  address: "address",
  geo: "geo",
  size_acres: "sizeAcres",
  parent: "parentName",
  purpose: "purpose",
  access: "access",
  description: "description",
  needs: "needs",
  plans: "plans",
  gis_open_space: "gisOpenSpace",
  gis_land_use: "gisLandUse",
  website: "website",
  hnp_homegrown_national_park: "hnpMapNumber",
};

export const ACRES_TO_SQFT = 43560;

export const importedPlaceSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  state: z.string().nullable(),
  municipality: z.string().nullable(),
  owner: z.string().nullable(),
  stewardName: z.string().nullable(),
  address: z.string().nullable(),
  sizeSqft: z.number().nullable(),
  parentName: z.string().nullable(),
  purpose: z.string().nullable(),
  access: z.string().nullable(),
  description: z.string().nullable(),
  needs: z.string().nullable(),
  plans: z.string().nullable(),
  gisOpenSpace: z.string().nullable(),
  gisLandUse: z.string().nullable(),
  website: z.string().nullable(),
  hnpMapNumber: z.number().int().nullable(),
});
export type ImportedPlace = z.infer<typeof importedPlaceSchema>;
