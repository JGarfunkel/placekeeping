import { debugLog, getSpotById, listObservationsForSpot, resolveCountry } from "@placekeeping/core";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { SpotDetailView } from "@/components/spots/SpotDetailView";
import { TerritoryView } from "@/components/spots/TerritoryView";
import { getAuthContext } from "@/lib/session";
import { buildSpotMetadata } from "@/lib/spotMetadata";
import { classifySpotPath } from "@/lib/spotRoute";
import { buildTerritoryMetadata } from "@/lib/territoryMetadata";

// Shared between generateMetadata and the page body so a spotId lookup only
// hits the DB once per request.
const loadSpotById = cache((id: number) => getSpotById(id));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ a: string }>;
}): Promise<Metadata> {
  const { a } = await params;
  const route = classifySpotPath([a]);
  if (route.kind === "spotId") {
    const spot = await loadSpotById(route.id);
    return spot ? buildSpotMetadata(spot) : {};
  }
  if (route.kind === "country") {
    const resolution = await resolveCountry(route.cc);
    return resolution ? buildTerritoryMetadata(resolution) : {};
  }
  return {};
}

export default async function SpotsDepth1Page({
  params,
}: {
  params: Promise<{ a: string }>;
}) {
  const { a } = await params;
  const route = classifySpotPath([a]);

  if (route.kind === "spotId") {
    const [spot, observations, authContext] = await Promise.all([
      loadSpotById(route.id),
      listObservationsForSpot(route.id),
      getAuthContext(),
    ]);
    if (!spot) {
      console.warn("[spots] 404: no spot with id", route.id);
      notFound();
    }
    // Prefer the friendly territory/slug URL once a spot has one, rather
    // than leaving the numeric-id URL in the address bar -- see
    // SpotsDepth4Page for where that URL is served from.
    if (spot.slugState && spot.slugLocality && spot.slug) {
      const target = `/spots/us/${spot.slugState}/${spot.slugLocality}/${spot.slug}`;
      debugLog("[spots] SpotsDepth1Page redirecting", route.id, "->", target);
      redirect(target);
    }
    return (
      <SpotDetailView spot={spot} observations={observations} authContext={authContext} />
    );
  }

  if (route.kind === "country") {
    const resolution = await resolveCountry(route.cc);
    if (!resolution) {
      console.warn("[spots] 404: country did not resolve", route.cc);
      notFound();
    }
    return <TerritoryView resolution={resolution} />;
  }

  console.warn("[spots] 404: path did not classify", { a, route });
  notFound();
}
