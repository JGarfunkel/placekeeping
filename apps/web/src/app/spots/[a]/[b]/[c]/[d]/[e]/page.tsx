import { debugLog, getSpotBySlug, listObservationsForSpot } from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SpotDetailView } from "@/components/spots/SpotDetailView";
import { buildObservationMetadata } from "@/lib/observationMetadata";
import { getAuthContext } from "@/lib/session";
import { classifySpotPath } from "@/lib/spotRoute";

type Params = { a: string; b: string; c: string; d: string; e: string };

// Shared between generateMetadata and the page body so the spot + its
// observations only get fetched once per request. Mirrors loadSpot in
// app/spots/[a]/[b]/[c]/[d]/page.tsx, plus resolving which observation this
// permalink points at (and confirming it actually belongs to this spot).
const loadSpotAndObservation = cache(
  async (a: string, b: string, c: string, d: string, e: string) => {
    debugLog("[spots] SpotsDepth5Page params", { a, b, c, d, e });
    const route = classifySpotPath([a, b, c, d, e]);
    if (route.kind !== "slugObservation") {
      console.warn("[spots] 404: path did not classify as a slugObservation route", {
        a,
        b,
        c,
        d,
        e,
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
    return { spot, observations, observation };
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { a, b, c, d, e } = await params;
  const loaded = await loadSpotAndObservation(a, b, c, d, e);
  return loaded ? buildObservationMetadata(loaded.spot, loaded.observation) : {};
}

export default async function SpotsDepth5Page({
  params,
}: {
  params: Promise<Params>;
}) {
  const { a, b, c, d, e } = await params;
  const loaded = await loadSpotAndObservation(a, b, c, d, e);
  if (!loaded) notFound();
  const { spot, observations, observation } = loaded;

  const authContext = await getAuthContext();

  return (
    <SpotDetailView
      spot={spot}
      observations={observations}
      authContext={authContext}
      highlightObservationId={observation.observationId}
    />
  );
}
