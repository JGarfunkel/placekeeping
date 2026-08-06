import sharp from "sharp";

/** Longer-edge cap for stored photos. ~75% smaller than typical phone JPEGs at negligible visible quality loss for web display. */
const MAX_DIMENSION_PX = 1350;

const CONTENT_TYPE_TO_SHARP_FORMAT: Record<string, keyof sharp.FormatEnum> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Downscales an uploaded photo so its longer edge is at most
 * MAX_DIMENSION_PX, re-encoding in its original format. Never upscales
 * images already smaller than the cap. Applies EXIF orientation before
 * stripping metadata (sharp drops EXIF by default), so portrait photos stay
 * upright despite the original orientation tag being discarded — this also
 * has the side effect of stripping GPS EXIF from the stored copy, which is
 * fine since location is read from the original bytes before this runs.
 */
export async function resizePhotoForStorage(
  bytes: Buffer,
  contentType: string,
): Promise<Buffer> {
  const format = CONTENT_TYPE_TO_SHARP_FORMAT[contentType];
  if (!format) return bytes;

  return sharp(bytes)
    .rotate()
    .resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toFormat(format)
    .toBuffer();
}
