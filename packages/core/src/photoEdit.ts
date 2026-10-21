import { db, photos } from "@placekeeping/db";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { AdminPhotoNotFoundError, AdminPhotoNotNativeError } from "./adminPhotos";
import { getOriginalExifMode, makeDerived, PhotoProcessingError } from "./photoResize";
import { buildVariants, putVariantObjects, readObject } from "./photoStorage";

/** "rotate" turns the photo 90 degrees clockwise; "square" centre-crops it to its short edge. */
export type PhotoEditOp = "rotate" | "square";

const ORIGINAL_QUALITY = 92;

const FORMAT_BY_EXT = {
  jpg: { format: "jpeg", mime: "image/jpeg" },
  png: { format: "png", mime: "image/png" },
  webp: { format: "webp", mime: "image/webp" },
} as const;

/**
 * Applies a rotate or square crop to a native photo's stored original and
 * rebuilds the medium and thumb copies from the result. Destructive: the
 * original's bytes are rewritten under the same key (so photoId, url and the
 * dual-written observations.photoUrls are untouched) and `replacedAt` is
 * bumped for the ?v= cache buster. Authorisation is the caller's job.
 */
export async function editPhoto(photoId: string, op: PhotoEditOp): Promise<void> {
  const [existing] = await db.select().from(photos).where(eq(photos.photoId, photoId)).limit(1);
  if (!existing) throw new AdminPhotoNotFoundError(photoId);
  if (!existing.storageKey) throw new AdminPhotoNotNativeError();

  const ext = existing.storageKey.slice(existing.storageKey.lastIndexOf(".") + 1);
  const spec = FORMAT_BY_EXT[ext as keyof typeof FORMAT_BY_EXT];
  if (!spec) {
    throw new PhotoProcessingError("unsupported_format", "Unsupported file type for editing.");
  }

  const source = await readObject(existing.storageKey);

  // rotate() with no argument bakes in EXIF orientation first, so "portrait"
  // below means as displayed. A second rotate(90) would be applied against the
  // pre-orientation pixels, hence the buffer round trip between steps.
  const oriented = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
  let pipeline = sharp(oriented.data);
  if (op === "rotate") {
    pipeline = pipeline.rotate(90);
  } else {
    const edge = Math.min(oriented.info.width, oriented.info.height);
    pipeline = pipeline.extract({
      left: Math.floor((oriented.info.width - edge) / 2),
      top: Math.floor((oriented.info.height - edge) / 2),
      width: edge,
      height: edge,
    });
  }
  if (getOriginalExifMode() === "keep") pipeline = pipeline.keepExif();
  pipeline =
    spec.format === "jpeg"
      ? pipeline.jpeg({ quality: ORIGINAL_QUALITY })
      : spec.format === "png"
        ? pipeline.png()
        : pipeline.webp({ quality: ORIGINAL_QUALITY });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  const derived = await makeDerived(data);
  const processed = {
    original: { buffer: data, mime: spec.mime, ext, w: info.width, h: info.height },
    ...derived,
  };
  // Overwriting a good photo: don't delete the previous copy if a write fails.
  await putVariantObjects(existing.storageKey, processed, { cleanupOnFailure: false });

  await db
    .update(photos)
    .set({
      variants: buildVariants(processed),
      sizeBytes: data.length,
      replacedAt: new Date(),
    })
    .where(eq(photos.photoId, photoId));
}
