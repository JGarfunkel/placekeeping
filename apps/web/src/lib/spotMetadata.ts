import type { Spot } from "@placekeeping/shared-types";
import type { Metadata } from "next";
import { focusOptions, spotFunctionOptions } from "@/components/forms/spotOptions";
import { buildOpenGraphMetadata, type OgContent } from "@/lib/ogMetadata";
import { spotPath } from "@/lib/spotPath";

const functionLabels: Record<string, string> = Object.fromEntries(
  spotFunctionOptions.map((opt) => [opt.value, opt.label]),
);
const focusLabels: Record<string, string> = Object.fromEntries(
  focusOptions.map((opt) => [opt.value, opt.label]),
);

// Falls back to an assembled sentence when a steward hasn't written a
// description yet, so shared links still get a meaningful og:description
// instead of the generic site-wide one.
function assembleDescription(spot: Spot): string {
  const kind = spot.purpose ? functionLabels[spot.purpose] : "Cared-for outdoor spot";
  const location = [spot.postalCity ?? spot.municipality, spot.state]
    .filter(Boolean)
    .join(", ");
  const focus =
    spot.focus && spot.focus !== "none" ? focusLabels[spot.focus] : null;
  const accessibility =
    spot.accessibility === "public"
      ? "Publicly accessible."
      : "Open to designated members & guests.";

  return [
    location ? `${kind} in ${location}.` : `${kind}.`,
    focus ? `Focus: ${focus}.` : null,
    accessibility,
  ]
    .filter(Boolean)
    .join(" ");
}

// Reused by both buildSpotMetadata (page <head> tags) and the embed widget's
// JSON API (app/api/embed/card/route.ts).
export function buildSpotOgContent(spot: Spot): OgContent {
  return {
    title: spot.name,
    description: spot.description || assembleDescription(spot),
    imageUrl: spot.coverPhotoUrl,
    path: spotPath(spot),
  };
}

export function buildSpotMetadata(spot: Spot): Metadata {
  return buildOpenGraphMetadata(buildSpotOgContent(spot));
}
