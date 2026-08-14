import type { Observation, Photo, Spot } from "@placekeeping/shared-types";
import type { Metadata } from "next";
import { buildOpenGraphMetadata, type OgContent } from "@/lib/ogMetadata";
import { observationPath, photoPath } from "@/lib/spotPath";

function describeObservation(spot: Spot, obs: Observation): string {
  const who = obs.observerName ? ` by ${obs.observerName}` : "";
  const notes = obs.notes ? ` — ${obs.notes}` : "";
  return `Observed ${obs.observedAt}${who} at ${spot.name}.${notes}`;
}

// Reused by both buildObservationMetadata (page <head> tags) and the embed
// widget's JSON API (app/api/embed/card/route.ts).
export function buildObservationOgContent(spot: Spot, obs: Observation): OgContent {
  return {
    title: `${spot.name} — ${obs.observedAt}`,
    description: describeObservation(spot, obs),
    imageUrl: obs.photos?.[0]?.url ?? obs.photoUrls[0] ?? spot.coverPhotoUrl,
    path: observationPath(spot, obs.observationId),
    type: "article",
  };
}

export function buildPhotoOgContent(
  spot: Spot,
  obs: Observation,
  photo: Photo,
): OgContent {
  return {
    title: `${spot.name} — ${obs.observedAt}`,
    description: describeObservation(spot, obs),
    imageUrl: photo.url,
    path: photoPath(spot, obs.observationId, photo.photoId),
    type: "article",
  };
}

export function buildObservationMetadata(spot: Spot, obs: Observation): Metadata {
  return buildOpenGraphMetadata(buildObservationOgContent(spot, obs));
}

export function buildPhotoMetadata(spot: Spot, obs: Observation, photo: Photo): Metadata {
  return buildOpenGraphMetadata(buildPhotoOgContent(spot, obs, photo));
}
