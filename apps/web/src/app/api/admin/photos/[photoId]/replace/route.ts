import {
  AdminPhotoNotFoundError,
  MAX_UPLOAD_BYTES,
  PhotoProcessingError,
  replacePhoto,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireSystemAdminApi } from "@/lib/adminAuth";

type Params = { params: Promise<{ photoId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const denied = await requireSystemAdminApi();
    if (denied) return denied;

    const { photoId } = await params;
    if (!UUID_RE.test(photoId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File is too large" }, { status: 413 });
    }

    try {
      const photo = await replacePhoto(
        photoId,
        Buffer.from(await file.arrayBuffer()),
        file.name || null,
      );
      return NextResponse.json({ photo });
    } catch (err) {
      if (err instanceof AdminPhotoNotFoundError) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (err instanceof PhotoProcessingError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.reason === "too_large" ? 413 : 400 },
        );
      }
      throw err;
    }
  },
);
