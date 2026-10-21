import {
  AdminPhotoNotFoundError,
  AdminPhotoNotNativeError,
  canEditObservation,
  editPhoto,
  getObservationById,
  getPhotoById,
  PhotoProcessingError,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ photoId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const editPhotoSchema = z.object({ op: z.enum(["rotate", "square"]) });

// Rotate / square-crop a photo in place. Gated on editing the owning
// observation (same rule as the observation PATCH route), not on being an admin.
export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const { photoId } = await params;
    if (!UUID_RE.test(photoId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const photo = await getPhotoById(photoId);
    const observation = photo && (await getObservationById(photo.observationId));
    if (!photo || !observation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canEditObservation(authContext, observation)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = editPhotoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    try {
      await editPhoto(photoId, parsed.data.op);
      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof AdminPhotoNotFoundError) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (err instanceof AdminPhotoNotNativeError || err instanceof PhotoProcessingError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  },
);
