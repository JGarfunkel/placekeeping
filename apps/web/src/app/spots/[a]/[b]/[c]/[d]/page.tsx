import { debugLog, getSpotById, getSpotBySlug, listObservationsForSpot } from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { SpotDetailView } from "@/components/spots/SpotDetailView";
import { buildPhotoMetadata } from "@/lib/observationMetadata";
import { getAuthContext } from "@/lib/session";
import { buildSpotMetadata } from "@/lib/spotMetadata";
import { photoPath } from "@/lib/spotPath";
import { classifySpotPath } from "@/lib/spotRoute";

type Params = { a: string; b: string; c: string; d: string };

// Shared between generateMetadata and the page body so a lookup only hits
// the DB once per request. Handles both the letter-tree's canonical slug URL
// (/spots/us/<state>/<locality>/<slug>) and, at this same depth, the
// numeric-id tree's photo-permalink fallback for a spot with no slug yet
// (/spots/<spotId>/observations/<observationId>/<photoId> -- see
// spotRoute.ts's spotPhoto kind and spotPath.ts's fallback).
const loadPage = cache(async (a: string, b: string, c: string, d: string) => {
  debugLog("[spots] SpotsDepth4Page params", { a, b, c, d });
  const route = classifySpotPath([a, b, c, d]);

  if (route.kind === "spotPhoto") {
    const spot = await getSpotById(route.id);
    if (!spot) {
      console.warn("[spots] 404: no spot with id for photo permalink", route.id);
      return null;
    }
    const observations = await listObservationsForSpot(spot.spotId);
    const observation = observations.find((o) => o.observationId === route.observationId);
    if (!observation) {
      console.warn("[spots] 404: observation not found on this spot", {
        spotId: spot.spotId,
        observationId: route.observationId,
      });
      return null;
    }
    const photo = (observation.photos ?? []).find((p) => p.photoId === route.photoId);
    if (!photo) {
      console.warn("[spots] 404: photo not found on this observation", {
        observationId: observation.observationId,
        photoId: route.photoId,
      });
      return null;
    }
    return { kind: "spotPhoto" as const, spot, observations, observation, photo };
  }

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
    return null;
  }
  const observations = await listObservationsForSpot(spot.spotId);
  return { kind: "slug" as const, spot, observations };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { a, b, c, d } = await params;
  const loaded = await loadPage(a, b, c, d);
  if (!loaded) return {};
  return loaded.kind === "spotPhoto"
    ? buildPhotoMetadata(loaded.spot, loaded.observation, loaded.photo)
    : buildSpotMetadata(loaded.spot);
}

export default async function SpotsDepth4Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { a, b, c, d } = await params;
  const loaded = await loadPage(a, b, c, d);
  if (!loaded) notFound();

  const authContext = await getAuthContext();

  if (loaded.kind === "spotPhoto") {
    // Once the spot has a slug, prefer that permalink over this numeric-id
    // fallback -- same idea as SpotsDepth1Page's redirect for the plain spot
    // page.
    const canonical = photoPath(loaded.spot, loaded.observation.observationId, loaded.photo.photoId);
    if (canonical !== `/spots/${a}/${b}/${c}/${d}`) {
      redirect(canonical);
    }
    return (
      <SpotDetailView
        spot={loaded.spot}
        observations={loaded.observations}
        authContext={authContext}
        highlightObservationId={loaded.observation.observationId}
        highlightPhotoId={loaded.photo.photoId}
      />
    );
  }

  return (
    <SpotDetailView
      spot={loaded.spot}
      observations={loaded.observations}
      authContext={authContext}
    />
  );
}
