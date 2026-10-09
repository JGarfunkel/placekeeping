import {
  AdminPhotoNotFoundError,
  AdminPhotoNotNativeError,
  PhotoProcessingError,
  regeneratePhoto,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { requireSystemAdminApi } from "@/lib/adminAuth";

type Params = { params: Promise<{ photoId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const denied = await requireSystemAdminApi();
    if (denied) return denied;

    const { photoId } = await params;
    if (!UUID_RE.test(photoId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
      return NextResponse.json({ photo: await regeneratePhoto(photoId) });
    } catch (err) {
      if (err instanceof AdminPhotoNotFoundError) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (err instanceof AdminPhotoNotNativeError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof PhotoProcessingError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  },
);
