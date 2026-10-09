import { db, photos } from "@placekeeping/db";
import type { Photo, PhotoUploadMeta } from "@placekeeping/shared-types";
import { asc, eq, inArray } from "drizzle-orm";
import {
  allVariantObjectsExist,
  ownStorageKey,
  publicUrlFor,
  variantKey,
  type PhotoVariant,
} from "./photoStorage";

type PhotoRow = typeof photos.$inferSelect;

/**
 * The src to render for one variant of a photo. Falls back to the stored
 * `url` for external URLs and for native rows that have no derived copies
 * yet. Objects are overwritten in place on replace/regenerate, so
 * `replacedAt` goes on as a ?v= cache buster.
 */
export function photoSrc(
  photo: Pick<PhotoRow, "url" | "storageKey" | "variants" | "replacedAt">,
  variant: PhotoVariant,
): string {
  if (!photo.storageKey || !photo.variants?.[variant]) return photo.url;
  // Variants live beside the original, so derive the origin from the stored
  // url rather than the current env: correct for rows written under another
  // base URL (an old host, or a DB copied between environments).
  const key = variantKey(photo.storageKey, variant);
  const originalUrl = photo.url.split("?")[0];
  const base = originalUrl.endsWith(photo.storageKey)
    ? `${originalUrl.slice(0, originalUrl.length - photo.storageKey.length)}${key}`
    : publicUrlFor(key);
  return photo.replacedAt ? `${base}?v=${photo.replacedAt.getTime()}` : base;
}

/** Pixel size of what photoSrc returns for `variant`, or null if unknown. */
export function photoSize(
  photo: Pick<PhotoRow, "storageKey" | "variants">,
  variant: PhotoVariant,
): { w: number; h: number } | null {
  const size = photo.storageKey ? photo.variants?.[variant] : photo.variants?.original;
  return size ? { w: size.w, h: size.h } : null;
}

function toPhotoDto(row: PhotoRow): Photo {
  const size = (variant: PhotoVariant) => photoSize(row, variant);
  return {
    photoId: row.photoId,
    observationId: row.observationId,
    url: row.url,
    urls: {
      original: photoSrc(row, "original"),
      medium: photoSrc(row, "medium"),
      thumb: photoSrc(row, "thumb"),
    },
    sizes: { original: size("original"), medium: size("medium"), thumb: size("thumb") },
    createdAt: row.createdAt.toISOString(),
  };
}

type PhotoStorageFields = Pick<
  typeof photos.$inferInsert,
  "storageKey" | "variants" | "originalFilename" | "sizeBytes"
>;

/**
 * Storage columns for a new `photos` row from the url the client saved plus
 * the metadata POST /api/photos returned for it. The metadata comes from the
 * client, so it is only used if the url is in our own storage and all three
 * objects really exist; dimensions themselves are layout hints only. Anything
 * that doesn't check out is stored without variants (readers fall back to
 * `url`, and an admin regenerate can fill them in later).
 */
export async function photoStorageFields(
  url: string,
  meta: PhotoUploadMeta | undefined,
): Promise<PhotoStorageFields> {
  const storageKey = ownStorageKey(url);
  if (!storageKey || !meta?.variants.medium || !meta.variants.thumb) {
    return { storageKey, variants: null, originalFilename: null, sizeBytes: null };
  }
  if (!(await allVariantObjectsExist(storageKey))) {
    console.warn("[photos] ignoring variant metadata, objects missing for", storageKey);
    return { storageKey, variants: null, originalFilename: null, sizeBytes: null };
  }
  return {
    storageKey,
    variants: meta.variants,
    originalFilename: meta.originalFilename ?? null,
    sizeBytes: meta.sizeBytes,
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
