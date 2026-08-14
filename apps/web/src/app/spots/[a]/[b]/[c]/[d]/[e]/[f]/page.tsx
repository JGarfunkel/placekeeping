import { debugLog, getSpotBySlug, listObservationsForSpot } from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SpotDetailView } from "@/components/spots/SpotDetailView";
import { buildPhotoMetadata } from "@/lib/observationMetadata";
import { getAuthContext } from "@/lib/session";
import { classifySpotPath } from "@/lib/spotRoute";

type Params = { a: string; b: string; c: string; d: string; e: string; f: string };

// Mirrors loadSpotAndObservation in the depth-5 (observation) permalink page,
// plus resolving which photo this permalink points at (and confirming it
// actually belongs to that observation).
const loadSpotObservationPhoto = cache(
  async (a: string, b: string, c: string, d: string, e: string, f: string) => {
    debugLog("[spots] SpotsDepth6Page params", { a, b, c, d, e, f });
    const route = classifySpotPath([a, b, c, d, e, f]);
    if (route.kind !== "slugPhoto") {
      console.warn("[spots] 404: path did not classify as a slugPhoto route", {
        a,
        b,
        c,
        d,
        e,
        f,
        route,
      });
      return null;
    }
    const spot = await getSpotBySlug(route.sc, route.mc, route.slug);
    if (!spot) {
      console.warn("[spots] 404: no spot matches slug", route);
      return null;
    }
    const observations = await listObservationsForSpot(spot.spotId);
    const observation = observations.find(
      (o) => o.observationId === route.observationId,
    );
    if (!observation) {
      console.warn("[spots] 404: observation not found on this spot", {
        spotId: spot.spotId,
        observationId: route.observationId,
      });
      return null;
    }
    const photo = (observation.photos ?? []).find(
      (p) => p.photoId === route.photoId,
    );
    if (!photo) {
      console.warn("[spots] 404: photo not found on this observation", {
        observationId: observation.observationId,
        photoId: route.photoId,
      });
      return null;
    }
    return { spot, observations, observation, photo };
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { a, b, c, d, e, f } = await params;
  const loaded = await loadSpotObservationPhoto(a, b, c, d, e, f);
  return loaded ? buildPhotoMetadata(loaded.spot, loaded.observation, loaded.photo) : {};
}

export default async function SpotsDepth6Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { a, b, c, d, e, f } = await params;
  const loaded = await loadSpotObservationPhoto(a, b, c, d, e, f);
  if (!loaded) notFound();
  const { spot, observations, observation, photo } = loaded;

  const authContext = await getAuthContext();

  return (
    <SpotDetailView
      spot={spot}
      observations={observations}
      authContext={authContext}
      highlightObservationId={observation.observationId}
      highlightPhotoId={photo.photoId}
    />
  );
}
