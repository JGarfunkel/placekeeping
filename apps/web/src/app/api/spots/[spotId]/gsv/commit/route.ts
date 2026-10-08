import { createGsvObservations, getSpotById } from "@placekeeping/core";
import { gsvCommitRequestSchema, type GsvRef } from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { panoById } from "@/lib/gsv";
import { clampView } from "@/lib/gsvUrl";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string }> };

// Capture dates and coordinates are never trusted from the client: each
// pano is re-fetched from Google by ID, and only the view params come from
// the request (clamped).
export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: Params) => {
    const spotId = Number((await params).spotId);
    if (!Number.isInteger(spotId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authContext = await getAuthContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = gsvCommitRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (!(await getSpotById(spotId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const uniqueItems = [
      ...new Map(parsed.data.items.map((i) => [i.panoId, i])).values(),
    ];
    const metas = await Promise.all(uniqueItems.map((i) => panoById(i.panoId)));

    const refs: GsvRef[] = [];
    uniqueItems.forEach((item, idx) => {
      const meta = metas[idx];
      if (!meta) return;
      refs.push({
        panoId: meta.panoId,
        captureDate: meta.captureDate,
        panoLat: meta.lat,
        panoLng: meta.lng,
        ...clampView({ heading: item.heading, pitch: item.pitch, fov: item.fov }),
        addedBy: authContext.userId,
      });
    });

    const added = await createGsvObservations(spotId, refs);
    return NextResponse.json({
      added,
      skipped: parsed.data.items.length - added,
    });
  },
);
