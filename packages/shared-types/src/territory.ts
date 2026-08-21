import { z } from "zod";

export const subdivisionSearchQuerySchema = z.object({
  q: z.string().min(1),
  // Set to skip the fast DB-only search and hit the live ArcGIS fallback
  // instead -- see searchSubdivisionsLive in @placekeeping/core. Only meant
  // to be sent after a first, non-live search comes back empty.
  live: z.coerce.boolean().optional(),
});
export type SubdivisionSearchQuery = z.infer<typeof subdivisionSearchQuerySchema>;
