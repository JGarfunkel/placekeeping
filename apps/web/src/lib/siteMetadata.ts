import type { Site, SpotSummary } from "@placekeeping/shared-types";
import type { Metadata } from "next";
import { buildOpenGraphMetadata, type OgContent } from "@/lib/ogMetadata";
import { sitePurposeLabels } from "@/lib/siteLabels";

// Sites have no description field of their own -- fall back to an assembled
// sentence, same idea as spotMetadata's assembleDescription.
function assembleDescription(site: Site, spotCount: number): string {
  const kind = site.purpose ? (sitePurposeLabels[site.purpose] ?? site.purpose) : "Site";
  const spots = spotCount > 0 ? ` with ${spotCount} cared-for spot${spotCount === 1 ? "" : "s"}` : "";
  return `${kind}${spots} on Placekeeping.`;
}

// Sites have no cover-image field of their own -- use the first member spot
// that has one (memberSpots is already fetched by the page for its map).
// Reused by both buildSiteMetadata (page <head> tags) and the embed widget's
// JSON API (app/api/embed/card/route.ts).
export function buildSiteOgContent(site: Site, memberSpots: SpotSummary[]): OgContent {
  const coverPhotoUrl = memberSpots.find((s) => s.coverPhotoUrl)?.coverPhotoUrl ?? null;
  return {
    title: site.name,
    description: assembleDescription(site, memberSpots.length),
    imageUrl: coverPhotoUrl,
    path: `/sites/${site.siteId}`,
  };
}

export function buildSiteMetadata(site: Site, memberSpots: SpotSummary[]): Metadata {
  return buildOpenGraphMetadata(buildSiteOgContent(site, memberSpots));
}
