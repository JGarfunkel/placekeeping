import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Placekeeping — Community Stewardship Atlas",
    short_name: "Placekeeping",
    description:
      "Find and steward gardens, preserves, and other cared-for outdoor places near you.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e8",
    theme_color: "#2e7d43",
    icons: [
      { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
