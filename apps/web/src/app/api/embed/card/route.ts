import {
  getSiteById,
  getSpotById,
  getSpotBySlug,
  listObservationsForSpot,
  listSpotsBySite,
} from "@placekeeping/core";
import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/appBaseUrl";
import { buildObservationOgContent, buildPhotoOgContent } from "@/lib/observationMetadata";
import { buildSiteOgContent } from "@/lib/siteMetadata";
import { buildSpotOgContent } from "@/lib/spotMetadata";
import { classifySpotPath } from "@/lib/spotRoute";

// Public, unauthenticated, cross-origin: this is what embed.js's <pk-card>
// fetches from whatever third-party page it's embedded on (see
// public/embed.js), so it needs CORS opened up rather than the app's normal
// same-origin assumption. There's no middleware.ts gating /api/* today.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function resolveCard(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const [root, ...rest] = segments;

  if (root === "sites" && /^\d+$/.test(rest[0] ?? "")) {
    const siteId = Number(rest[0]);
    const site = await getSiteById(siteId);
    if (!site) return null;
    const memberSpots = await listSpotsBySite(siteId);
    return buildSiteOgContent(site, memberSpots);
  }

  if (root !== "spots") return null;

  const route = classifySpotPath(rest);
  switch (route.kind) {
    case "spotId": {
      const spot = await getSpotById(route.id);
      return spot ? buildSpotOgContent(spot) : null;
    }
    case "slug": {
      const spot = await getSpotBySlug(route.sc, route.mc, route.slug);
      return spot ? buildSpotOgContent(spot) : null;
    }
    case "spotObservation": {
      const spot = await getSpotById(route.id);
      if (!spot) return null;
      const observations = await listObservationsForSpot(spot.spotId);
      const observation = observations.find(
        (o) => o.observationId === route.observationId,
      );
      return observation ? buildObservationOgContent(spot, observation) : null;
    }
    case "spotPhoto": {
      const spot = await getSpotById(route.id);
      if (!spot) return null;
      const observations = await listObservationsForSpot(spot.spotId);
      const observation = observations.find(
        (o) => o.observationId === route.observationId,
      );
      if (!observation) return null;
      const photo = (observation.photos ?? []).find(
        (p) => p.photoId === route.photoId,
      );
      return photo ? buildPhotoOgContent(spot, observation, photo) : null;
    }
    case "slugObservation": {
      const spot = await getSpotBySlug(route.sc, route.mc, route.slug);
      if (!spot) return null;
      const observations = await listObservationsForSpot(spot.spotId);
      const observation = observations.find(
        (o) => o.observationId === route.observationId,
      );
      return observation ? buildObservationOgContent(spot, observation) : null;
    }
    case "slugPhoto": {
      const spot = await getSpotBySlug(route.sc, route.mc, route.slug);
      if (!spot) return null;
      const observations = await listObservationsForSpot(spot.spotId);
      const observation = observations.find(
        (o) => o.observationId === route.observationId,
      );
      if (!observation) return null;
      const photo = (observation.photos ?? []).find(
        (p) => p.photoId === route.photoId,
      );
      return photo ? buildPhotoOgContent(spot, observation, photo) : null;
    }
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json(
      { error: "Missing url query parameter" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let pathname: string;
  try {
    pathname = new URL(rawUrl, getAppBaseUrl()).pathname;
  } catch {
    return NextResponse.json(
      { error: "Invalid url" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const content = await resolveCard(pathname);
  if (!content) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(
    {
      title: content.title,
      description: content.description ?? null,
      image: content.imageUrl ?? null,
      url: new URL(content.path, getAppBaseUrl()).toString(),
    },
    { headers: CORS_HEADERS },
  );
}
