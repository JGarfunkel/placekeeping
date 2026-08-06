import {
  checkPhotoBytes,
  getPhotoLocationFromBytes,
  getPhotoObservedDateFromBytes,
  resizePhotoForStorage,
  storePhoto,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB, headroom over a typical phone JPEG
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

  const bytes = Buffer.from(await file.arrayBuffer());

  // Throws PhotoModerationError on rejection, caught by withApiErrorHandling
  // -> 422. Nothing is stored for content that fails moderation.
  await checkPhotoBytes(bytes, file.name);

  const resizedBytes = await resizePhotoForStorage(bytes, file.type);
  const stored = await storePhoto(resizedBytes, file.type);
  const [observedAt, location] = await Promise.all([
    getPhotoObservedDateFromBytes(bytes),
    getPhotoLocationFromBytes(bytes),
  ]);

  return NextResponse.json({ url: stored.url, observedAt, location }, { status: 201 });
});
