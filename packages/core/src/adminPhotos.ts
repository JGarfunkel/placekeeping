import { randomUUID } from "node:crypto";
import { db, observations, photos, spots, users, type PhotoVariants } from "@placekeeping/db";
import type { AdminPhotoRow } from "@placekeeping/shared-types";
import { desc, eq, sql } from "drizzle-orm";
import { checkPhotoBytes } from "./photoModeration";
import { getOrientedDimensions, makeDerived, processPhoto } from "./photoResize";
import {
  deleteObjects,
  publicUrlFor,
  putDerivedObjects,
  putVariantObjects,
  readObject,
  buildVariants,
} from "./photoStorage";
import { photoSrc } from "./photos";

export class AdminPhotoNotFoundError extends Error {
  constructor(photoId: string) {
    super(`Photo not found: ${photoId}`);
    this.name = "AdminPhotoNotFoundError";
  }
}

/** Raised when an action needs an object of ours but the row is an external URL. */
export class AdminPhotoNotNativeError extends Error {
  constructor() {
    super("This photo is an external URL with no stored file to regenerate. Replace it with an upload instead.");
    this.name = "AdminPhotoNotNativeError";
  }
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function adminPhotoSelect() {
  return db
    .select({
      photo: photos,
      spotId: spots.spotId,
      spotName: spots.name,
      uploaderName: users.username,
    })
    .from(photos)
    .innerJoin(observations, eq(photos.observationId, observations.observationId))
    .innerJoin(spots, eq(observations.spotId, spots.spotId))
    .leftJoin(users, eq(photos.uploadedByUserId, users.userId));
}

type AdminPhotoQueryRow = Awaited<ReturnType<typeof adminPhotoSelect>>[number];

function toAdminPhotoRow({ photo, spotId, spotName, uploaderName }: AdminPhotoQueryRow): AdminPhotoRow {
  const variantStatus: AdminPhotoRow["variantStatus"] = !photo.storageKey
    ? "n/a"
    : photo.variants?.medium && photo.variants.thumb
      ? "ready"
      : "missing";
  return {
    photoId: photo.photoId,
    observationId: photo.observationId,
    spotId,
    spotName,
    uploaderId: photo.uploadedByUserId,
    uploaderName,
    createdAt: photo.createdAt.toISOString(),
    replacedAt: photo.replacedAt?.toISOString() ?? null,
    storageKey: photo.storageKey,
    source: photo.storageKey ? "native" : "external",
    variantStatus,
    originalW: photo.variants?.original.w ?? null,
    originalH: photo.variants?.original.h ?? null,
    sizeBytes: photo.sizeBytes,
    originalFilename: photo.originalFilename,
    moderationStatus: photo.moderationStatus,
    variants: photo.variants,
    thumbUrl: photoSrc(photo, "thumb"),
    mediumUrl: photoSrc(photo, "medium"),
    originalUrl: photoSrc(photo, "original"),
  };
}

/** Every photo in the system, newest first. Fine at this scale (<100); the
 *  client filters/sorts/groups, so there is deliberately no pagination. */
export async function listAdminPhotos(): Promise<AdminPhotoRow[]> {
  const rows = await adminPhotoSelect().orderBy(desc(photos.createdAt));
  return rows.map(toAdminPhotoRow);
}

async function getAdminPhotoRow(photoId: string): Promise<AdminPhotoRow> {
  const [row] = await adminPhotoSelect().where(eq(photos.photoId, photoId)).limit(1);
  if (!row) throw new AdminPhotoNotFoundError(photoId);
  return toAdminPhotoRow(row);
}

function stemOf(storageKey: string): string {
  const dot = storageKey.lastIndexOf(".");
  return dot === -1 ? storageKey : storageKey.slice(0, dot);
}

/**
 * Replaces a photo's stored file with a new upload, keeping its photoId and
 * (when the extension is unchanged) its storage key. Objects are overwritten
 * in place; `replacedAt` goes into the ?v= cache buster so browsers and the
 * CDN fetch the new bytes. An external-URL row becomes a native photo under
 * a fresh key stem.
 *
 * Order: upload objects, update the row, then delete the old original if its
 * key changed. Overwrites aren't atomic across the three objects; a failure
 * partway leaves a mix of old and new bytes and re-running the replace fixes
 * it.
 */
export async function replacePhoto(
  photoId: string,
  input: Buffer,
  originalFilename: string | null,
): Promise<AdminPhotoRow> {
  const [existing] = await db.select().from(photos).where(eq(photos.photoId, photoId)).limit(1);
  if (!existing) throw new AdminPhotoNotFoundError(photoId);

  // No-op while PHOTO_MODERATION=none.
  await checkPhotoBytes(input, originalFilename ?? photoId);
  const processed = await processPhoto(input);

  const oldKey = existing.storageKey;
  const newKey = `${oldKey ? stemOf(oldKey) : randomUUID()}.${processed.original.ext}`;
  // Cleaning up on failure is only safe when nothing existed at these keys.
  await putVariantObjects(newKey, processed, { cleanupOnFailure: !oldKey });

  const newUrl = publicUrlFor(newKey);
  await db
    .update(photos)
    .set({
      storageKey: newKey,
      url: newUrl,
      variants: buildVariants(processed),
      sizeBytes: processed.original.buffer.length,
      originalFilename,
      replacedAt: new Date(),
    })
    .where(eq(photos.photoId, photoId));

  // Dual-write period: observations.photoUrls still carries the url.
  if (newUrl !== existing.url) {
    await db
      .update(observations)
      .set({ photoUrls: sql`array_replace(${observations.photoUrls}, ${existing.url}, ${newUrl})` })
      .where(eq(observations.observationId, existing.observationId));
  }

  if (oldKey && oldKey !== newKey) await deleteObjects([oldKey]);

  return getAdminPhotoRow(photoId);
}

/**
 * Rebuilds the medium and thumb copies from the stored original, without a
 * new upload. Also fills in `variants` for legacy rows that never had any.
 * Same keys are reused; `replacedAt` is bumped so the ?v= cache buster
 * changes.
 */
export async function regeneratePhoto(photoId: string): Promise<AdminPhotoRow> {
  const [existing] = await db.select().from(photos).where(eq(photos.photoId, photoId)).limit(1);
  if (!existing) throw new AdminPhotoNotFoundError(photoId);
  if (!existing.storageKey) throw new AdminPhotoNotNativeError();

  const original = await readObject(existing.storageKey);
  const [dims, derived] = await Promise.all([getOrientedDimensions(original), makeDerived(original)]);
  await putDerivedObjects(existing.storageKey, derived);

  const ext = existing.storageKey.slice(existing.storageKey.lastIndexOf(".") + 1);
  const variants: PhotoVariants = {
    original: {
      w: dims.w,
      h: dims.h,
      bytes: original.length,
      mime: MIME_BY_EXT[ext] ?? "application/octet-stream",
    },
    medium: { w: derived.medium.w, h: derived.medium.h, bytes: derived.medium.buffer.length },
    thumb: { w: derived.thumb.w, h: derived.thumb.h, bytes: derived.thumb.buffer.length },
  };
  await db
    .update(photos)
    .set({
      variants,
      sizeBytes: existing.sizeBytes ?? original.length,
      replacedAt: new Date(),
    })
    .where(eq(photos.photoId, photoId));

  return getAdminPhotoRow(photoId);
}
