import type { Spot } from "@placekeeping/shared-types";
import type { Metadata } from "next";
import { spotPurposeOptions, vegetationOptions } from "@/components/forms/spotOptions";

const purposeLabels: Record<string, string> = Object.fromEntries(
  spotPurposeOptions.map((opt) => [opt.value, opt.label]),
);
const vegetationLabels: Record<string, string> = Object.fromEntries(
  vegetationOptions.map((opt) => [opt.value, opt.label]),
);

// Falls back to an assembled sentence when a steward hasn't written a
// description yet, so shared links still get a meaningful og:description
// instead of the generic site-wide one.
function assembleDescription(spot: Spot): string {
  const kind =
    spot.purpose && spot.purpose !== "none"
      ? purposeLabels[spot.purpose]
      : "Cared-for outdoor spot";
  const location = [spot.postalCity ?? spot.municipality, spot.state]
    .filter(Boolean)
    .join(", ");
  const vegetation =
    spot.vegetation && spot.vegetation !== "none"
      ? vegetationLabels[spot.vegetation]
      : null;
  const accessibility =
    spot.accessibility === "public"
      ? "Publicly accessible."
      : "Open to designated members & guests.";

  return [
    location ? `${kind} in ${location}.` : `${kind}.`,
    vegetation ? `Vegetation: ${vegetation}.` : null,
    accessibility,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSpotMetadata(spot: Spot): Metadata {
  const description = spot.description || assembleDescription(spot);

  return {
    title: spot.name,
    description,
    openGraph: {
      title: spot.name,
      description,
      images: spot.coverPhotoUrl ? [spot.coverPhotoUrl] : undefined,
    },
  };
}
