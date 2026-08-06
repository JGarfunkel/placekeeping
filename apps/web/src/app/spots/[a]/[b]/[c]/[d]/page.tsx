import { debugLog, getSpotBySlug, listObservationsForSpot } from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SpotDetailView } from "@/components/spots/SpotDetailView";
import { getAuthContext } from "@/lib/session";
import { buildSpotMetadata } from "@/lib/spotMetadata";
import { classifySpotPath } from "@/lib/spotRoute";

type Params = { a: string; b: string; c: string; d: string };

// Shared between generateMetadata and the page body so the slug lookup only
// hits the DB once per request.
const loadSpot = cache(async (a: string, b: string, c: string, d: string) => {
  debugLog("[spots] SpotsDepth4Page params", { a, b, c, d });
  const route = classifySpotPath([a, b, c, d]);
  if (route.kind !== "slug") {
    console.warn("[spots] 404: path did not classify as a slug route", { a, b, c, d, route });
    return null;
  }
  debugLog("[spots] SpotsDepth4Page calling getSpotBySlug", {
    slugState: route.sc,
    slugLocality: route.mc,
    slug: route.slug,
  });
  const spot = await getSpotBySlug(route.sc, route.mc, route.slug);
  debugLog("[spots] SpotsDepth4Page getSpotBySlug returned", spot ? `spotId=${spot.spotId}` : "null");
  if (!spot) {
    console.warn("[spots] 404: no spot matches slug", {
      slugState: route.sc,
      slugLocality: route.mc,
      slug: route.slug,
    });
  }
  return spot;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { a, b, c, d } = await params;
  const spot = await loadSpot(a, b, c, d);
  return spot ? buildSpotMetadata(spot) : {};
}

export default async function SpotsDepth4Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { a, b, c, d } = await params;
  const spot = await loadSpot(a, b, c, d);
  if (!spot) notFound();

  const [observations, authContext] = await Promise.all([
    listObservationsForSpot(spot.spotId),
    getAuthContext(),
  ]);

  return (
    <SpotDetailView spot={spot} observations={observations} authContext={authContext} />
  );
}
