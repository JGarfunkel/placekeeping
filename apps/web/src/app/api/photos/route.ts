import {
  checkPhotoBytes,
  getPhotoLocationFromBytes,
  getPhotoObservedDateFromBytes,
  MAX_UPLOAD_BYTES,
  PhotoProcessingError,
  publicUrlFor,
  storePhotoWithVariants,
  variantKey,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

// jpeg/png/webp only — matches what the form's <img> preview can render in
// every browser (excludes HEIC, which most browsers can't display).
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const authContext = await getAuthContext();
  if (!authContext) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large" }, { status: 413 });
  }
  // "medium" is for single-image uses (profile photo, steward logo) that
  // would otherwise display the multi-megabyte original: the returned `url`
  // points at the ~800px copy and no `meta` is returned, since no `photos`
  // row follows for these.
  const returnMedium = formData?.get("variant") === "medium";

  const bytes = Buffer.from(await file.arrayBuffer());

  // Throws PhotoModerationError on rejection, caught by withApiErrorHandling
  // -> 422. Nothing is stored for content that fails moderation.
  await checkPhotoBytes(bytes, file.name);

  let stored;
  try {
    stored = await storePhotoWithVariants({ input: bytes });
  } catch (err) {
    if (err instanceof PhotoProcessingError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.reason === "too_large" ? 413 : 400 },
      );
    }
    throw err;
  }
  const [observedAt, location] = await Promise.all([
    getPhotoObservedDateFromBytes(bytes),
    getPhotoLocationFromBytes(bytes),
  ]);

  const url = returnMedium
    ? publicUrlFor(variantKey(stored.storageKey, "medium"))
    : stored.url;
  const meta = returnMedium
    ? undefined
    : {
        variants: stored.variants,
        originalFilename: file.name || null,
        sizeBytes: stored.sizeBytes,
      };

  return NextResponse.json({ url, meta, observedAt, location }, { status: 201 });
});
