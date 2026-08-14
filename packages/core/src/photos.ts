import { db, photos } from "@placekeeping/db";
import type { Photo } from "@placekeeping/shared-types";
import { asc, eq, inArray } from "drizzle-orm";

function toPhotoDto(row: typeof photos.$inferSelect): Photo {
  return {
    photoId: row.photoId,
    observationId: row.observationId,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
  };
}

// For resolving a photo permalink (/spots/.../<observationId>/<photoId>) --
// the caller cross-checks the returned observationId against the observation
// resolved from the URL to confirm the photo actually belongs to it.
export async function getPhotoById(photoId: string): Promise<Photo | null> {
  const [row] = await db
    .select()
    .from(photos)
    .where(eq(photos.photoId, photoId))
    .limit(1);
  return row ? toPhotoDto(row) : null;
}

export async function listPhotosForObservation(
  observationId: string,
): Promise<Photo[]> {
  const rows = await db
    .select()
    .from(photos)
    .where(eq(photos.observationId, observationId))
    .orderBy(asc(photos.createdAt));
  return rows.map(toPhotoDto);
}

// Batched version of listPhotosForObservation for a spot's full observation
// list -- one query instead of one per observation. Order within each
// observation's array follows insertion order (createdAt).
export async function listPhotosForObservations(
  observationIds: string[],
): Promise<Map<string, Photo[]>> {
  const byObservation = new Map<string, Photo[]>();
  if (observationIds.length === 0) return byObservation;

  const rows = await db
    .select()
    .from(photos)
    .where(inArray(photos.observationId, observationIds))
    .orderBy(asc(photos.createdAt));

  for (const row of rows) {
    const dto = toPhotoDto(row);
    const existing = byObservation.get(dto.observationId);
    if (existing) {
      existing.push(dto);
    } else {
      byObservation.set(dto.observationId, [dto]);
    }
  }
  return byObservation;
}
