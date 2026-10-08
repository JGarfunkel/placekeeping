import { getSpotById, listGsvPanoIdsForSpot } from "@placekeeping/core";
import {
  gsvResolveRequestSchema,
  type GsvCandidate,
} from "@placekeeping/shared-types";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import {
  expandShortUrl,
  imageUrl,
  listPriorPanos,
  panoById,
  panoNear,
  type PanoMeta,
} from "@/lib/gsv";
import { bearing, clampView, parseStreetViewUrl, type ParsedSvUrl } from "@/lib/gsvUrl";
import { getAuthContext } from "@/lib/session";

type Params = { params: Promise<{ spotId: string }> };

// Writes nothing: resolves a pasted Street View URL to the candidate frames
// the user can tick. See local/gsv-historical-observations-plan.md.
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

    const parsedBody = gsvResolveRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "unrecognized Street View URL" },
        { status: 400 },
      );
    }

    const spot = await getSpotById(spotId);
    if (!spot) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let parsed: ParsedSvUrl;
    try {
      parsed = parseStreetViewUrl(await expandShortUrl(parsedBody.data.url));
    } catch {
      return NextResponse.json(
        { error: "unrecognized Street View URL" },
        { status: 400 },
      );
    }

    const seed: PanoMeta | null = parsed.panoId
      ? await panoById(parsed.panoId)
      : parsed.lat != null && parsed.lng != null
        ? await panoNear(parsed.lat, parsed.lng)
        : null;
    if (!seed) {
      return NextResponse.json({ error: "no imagery found" }, { status: 422 });
    }

    const prior = await listPriorPanos(seed);
    const byId = new Map<string, PanoMeta>();
    for (const p of [seed, ...prior]) byId.set(p.panoId, p);
    const panos = [...byId.values()].sort((a, b) =>
      b.captureDate.localeCompare(a.captureDate),
    );

    const added = await listGsvPanoIdsForSpot(spotId);

    const candidates: GsvCandidate[] = panos.map((p) => {
      // The pasted pano keeps the view in the URL; older panos face the spot.
      const view =
        p.panoId === seed.panoId && parsed.heading != null
          ? clampView({
              heading: parsed.heading,
              pitch: parsed.pitch ?? 0,
              fov: parsed.fov ?? 75,
            })
          : {
              heading: Math.round(
                bearing(p.lat, p.lng, spot.latitude, spot.longitude),
              ),
              pitch: 0,
              fov: 75,
            };
      return {
        panoId: p.panoId,
        captureDate: p.captureDate,
        lat: p.lat,
        lng: p.lng,
        ...view,
        imageUrl: imageUrl({ panoId: p.panoId, ...view }),
        alreadyAdded: added.has(p.panoId),
      };
    });

    return NextResponse.json({ candidates, historyFound: panos.length > 1 });
  },
);
