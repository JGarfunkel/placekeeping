import {
  canEditObservation,
  deleteGsvObservation,
  getObservationById,
  updateObservation,
} from "@placekeeping/core";
import { updateObservationSchema } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string; observationId: string }> };

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const { spotId, observationId } = await params;
    if (!Number.isInteger(Number(spotId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await getObservationById(observationId);
    if (!existing || existing.spotId !== Number(spotId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!canEditObservation(authContext, existing)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateObservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const observation = await updateObservation(
      observationId,
      parsed.data,
      authContext.userId,
    );
    return NextResponse.json({ observation });
  },
);

// Admin-only, and only for Street View pointer rows -- a keeper's own
// observation can't be deleted here.
export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: Params) => {
    const { spotId, observationId } = await params;
    if (!Number.isInteger(Number(spotId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!authContext.isSystemAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deleted = await deleteGsvObservation(
      Number(spotId),
      observationId,
      authContext.userId,
    );
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  },
);
