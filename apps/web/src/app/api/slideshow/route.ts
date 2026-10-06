import {
  listSlides,
  parseSlideshowScope,
  SLIDESHOW_PAGE_SIZE,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/lib/apiError";
import { parseSlideshowOptions } from "@/lib/slideshow/options";

// GET /api/slideshow?scope=us/ny/westchester-county&order=newest&offset=0
// `scope` is a territory path or spot/<id>. `seed` keeps order=random
// stable across pages of one shuffle.
export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const scope = parseSlideshowScope((params.get("scope") ?? "").split("/").filter(Boolean));
  if (!scope) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const { order } = parseSlideshowOptions({ order: params.get("order") ?? undefined });
  const offsetParam = params.get("offset");
  const offset = offsetParam && /^\d+$/.test(offsetParam) ? Number(offsetParam) : 0;
  const seed = (params.get("seed") ?? "").slice(0, 64);

  const page = await listSlides(scope, { order, seed, offset, limit: SLIDESHOW_PAGE_SIZE });
  return NextResponse.json(page);
});
