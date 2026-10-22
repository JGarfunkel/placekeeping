import {
  canEditObservation,
  getObservationById,
  getPhotoById,
  movePhotoToNewObservation,
  PhotoMoveError,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ photoId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const movePhotoSchema = z.object({
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date"),
});

// Moves a photo into a new observation on the same spot with the given date.
// Gated on editing the photo's current observation, like the edit route.
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

    const parsed = movePhotoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    try {
      const created = await movePhotoToNewObservation(
        photoId,
        parsed.data.observedAt,
        authContext.userId,
      );
      return NextResponse.json({ observation: created });
    } catch (err) {
      if (err instanceof PhotoMoveError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  },
);
