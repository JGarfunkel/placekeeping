import sharp from "sharp";

/** Originals above this long edge are downscaled to it on upload (not rejected). A typical 12 MP phone photo is ~4000x3000 and passes through. */
export const MAX_LONG_EDGE_PX = 4000;
/** Rejected before decoding. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MEDIUM_LONG_EDGE_PX = 800;
export const THUMB_LONG_EDGE_PX = 320;

const ORIGINAL_QUALITY = 92;
const MEDIUM_WEBP_QUALITY = 80;
const THUMB_WEBP_QUALITY = 72;

// jpeg/png/webp only -- matches what browsers can display. HEIC is excluded
// (sharp's prebuilt binaries can't decode it); AVIF is excluded to keep the
// accepted set the same as before.
const SUPPORTED_FORMATS = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
} as const;
type SupportedFormat = keyof typeof SUPPORTED_FORMATS;

export type PhotoProcessingReason = "too_large" | "unsupported_format" | "unreadable";

export class PhotoProcessingError extends Error {
  constructor(
    readonly reason: PhotoProcessingReason,
    message: string,
  ) {
    super(message);
    this.name = "PhotoProcessingError";
  }
}

/**
 * What happens to the original's EXIF (PHOTO_ORIGINAL_EXIF). Originals are
 * served publicly, so the default strips everything, GPS included: location
 * and observed date are read from the raw upload bytes before this runs.
 * "keep" stores unchanged bytes when no resize is needed. sharp can't strip
 * EXIF without re-encoding, so "strip" re-encodes every original.
 */
export type OriginalExifMode = "strip" | "keep";

export function getOriginalExifMode(): OriginalExifMode {
  const value = process.env.PHOTO_ORIGINAL_EXIF ?? "strip";
  if (value === "strip" || value === "keep") return value;
  throw new Error(`PHOTO_ORIGINAL_EXIF must be "strip" or "keep" -- got ${JSON.stringify(value)}`);
}

export type DerivedImage = { buffer: Buffer; w: number; h: number };

export type ProcessedPhoto = {
  original: { buffer: Buffer; mime: string; ext: string; w: number; h: number };
  medium: DerivedImage;
  thumb: DerivedImage;
};

// rotate() applies EXIF orientation to the pixels; sharp drops all metadata
// by default (no withMetadata/keepExif), so derived copies carry no GPS.
async function makeWebp(
  input: Buffer,
  longEdge: number,
  quality: number,
): Promise<DerivedImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: longEdge, height: longEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, w: info.width, h: info.height };
}

/** Medium and thumb WebP copies of an already-stored original. */
export async function makeDerived(
  input: Buffer,
): Promise<{ medium: DerivedImage; thumb: DerivedImage }> {
  const [medium, thumb] = await Promise.all([
    makeWebp(input, MEDIUM_LONG_EDGE_PX, MEDIUM_WEBP_QUALITY),
    makeWebp(input, THUMB_LONG_EDGE_PX, THUMB_WEBP_QUALITY),
  ]);
  return { medium, thumb };
}

/** Pixel dimensions as displayed, i.e. with EXIF orientation applied. */
export async function getOrientedDimensions(
  input: Buffer,
): Promise<{ w: number; h: number }> {
  const meta = await readMetadata(input);
  return orientedDimensions(meta);
}

async function readMetadata(input: Buffer): Promise<sharp.Metadata> {
  try {
    return await sharp(input).metadata();
  } catch {
    throw new PhotoProcessingError("unreadable", "That file couldn't be read as an image.");
  }
}

function orientedDimensions(meta: sharp.Metadata): { w: number; h: number } {
  if (!meta.width || !meta.height) {
    throw new PhotoProcessingError("unreadable", "That file couldn't be read as an image.");
  }
  // EXIF orientations 5-8 are the 90/270 degree rotations.
  return (meta.orientation ?? 1) >= 5
    ? { w: meta.height, h: meta.width }
    : { w: meta.width, h: meta.height };
}

/**
 * Validates an uploaded photo and produces the stored original plus the
 * medium (~800px) and thumb (~320px) WebP copies.
 */
export async function processPhoto(
  input: Buffer,
  exifMode: OriginalExifMode = getOriginalExifMode(),
): Promise<ProcessedPhoto> {
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new PhotoProcessingError("too_large", "File is too large");
  }
  const meta = await readMetadata(input);
  const format = meta.format as SupportedFormat | undefined;
  const spec = format && SUPPORTED_FORMATS[format];
  if (!spec) {
    throw new PhotoProcessingError(
      "unsupported_format",
      "Unsupported file type -- use a JPEG, PNG or WebP image.",
    );
  }

  const oriented = orientedDimensions(meta);
  const needsDownscale = Math.max(oriented.w, oriented.h) > MAX_LONG_EDGE_PX;

  const makeOriginal = async (): Promise<ProcessedPhoto["original"]> => {
    if (exifMode === "keep" && !needsDownscale) {
      return { buffer: input, mime: spec.mime, ext: spec.ext, ...oriented };
    }
    let pipeline = sharp(input).rotate();
    if (needsDownscale) {
      pipeline = pipeline.resize({
        width: MAX_LONG_EDGE_PX,
        height: MAX_LONG_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    if (exifMode === "keep") pipeline = pipeline.keepExif();
    pipeline =
      format === "jpeg"
        ? pipeline.jpeg({ quality: ORIGINAL_QUALITY })
        : format === "png"
          ? pipeline.png()
          : pipeline.webp({ quality: ORIGINAL_QUALITY });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: spec.mime, ext: spec.ext, w: info.width, h: info.height };
  };

  const [original, derived] = await Promise.all([makeOriginal(), makeDerived(input)]);
  return { original, ...derived };
}
