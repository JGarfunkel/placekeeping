import type { Metadata } from "next";
import { getAppBaseUrl } from "@/lib/appBaseUrl";

// The plain-data shape each entity's metadata builder (spot, site,
// observation, photo) produces -- reused as-is by the embed widget's JSON
// API (app/api/embed/card/route.ts), and wrapped into a full Next Metadata
// object by buildOpenGraphMetadata below for page <head> tags.
export type OgContent = {
  title: string;
  description?: string;
  imageUrl?: string | null;
  path: string;
  type?: "website" | "article";
};

// Shared shape for every page's Open Graph / Twitter card tags, so each
// metadata builder (spot, site, territory, observation, photo) only has to
// supply the content, not repeat siteName/url/card-type plumbing.
export function buildOpenGraphMetadata({
  title,
  description,
  imageUrl,
  path,
  type = "website",
}: OgContent): Metadata {
  const url = new URL(path, getAppBaseUrl()).toString();
  const images = imageUrl ? [imageUrl] : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Placekeeping",
      type,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images,
    },
  };
}
