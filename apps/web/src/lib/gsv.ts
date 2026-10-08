import "server-only";

import { buildImageUrl, GSV_BASE, type GsvView } from "./gsvUrl";

// Server only. GSV_API_KEY should be restricted by HTTP referrer in the
// Google console and carry a daily quota cap -- it does appear in the image
// URLs handed to the browser (see imageUrl).
function key(): string {
  const k = process.env.GSV_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!k) throw new Error("GSV_API_KEY is not set");
  return k;
}

export type PanoMeta = {
  panoId: string;
  captureDate: string; // "YYYY-MM"
  lat: number;
  lng: number;
};

async function fetchMeta(query: string): Promise<PanoMeta | null> {
  const res = await fetch(`${GSV_BASE}/metadata?${query}&key=${key()}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (j.status !== "OK" || !j.pano_id || !j.date) return null;
  return {
    panoId: j.pano_id,
    captureDate: j.date,
    lat: j.location.lat,
    lng: j.location.lng,
  };
}

export function panoNear(lat: number, lng: number): Promise<PanoMeta | null> {
  return fetchMeta(`location=${lat},${lng}`);
}

export function panoById(panoId: string): Promise<PanoMeta | null> {
  return fetchMeta(`pano=${encodeURIComponent(panoId)}`);
}

export function imageUrl(v: GsvView): string {
  return buildImageUrl(key(), v);
}

const ALLOWED_HOSTS = new Set([
  "www.google.com",
  "google.com",
  "maps.google.com",
  "maps.app.goo.gl",
  "goo.gl",
]);

// Short links redirect to the long form. Followed by hand, host-checked at
// every hop, so the route cannot be pointed at arbitrary URLs. Only the
// goo.gl hosts are ever fetched; a long google.com URL is returned as-is.
export async function expandShortUrl(raw: string): Promise<string> {
  let url = raw.trim();
  for (let i = 0; i < 4; i++) {
    const u = new URL(url);
    if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname)) {
      throw new Error("unsupported host");
    }
    if (!/goo\.gl$/.test(u.hostname)) return url;
    const r = await fetch(url, { redirect: "manual" });
    const next = r.headers.get("location");
    if (!next) throw new Error("no redirect");
    url = new URL(next, url).toString();
  }
  throw new Error("too many redirects");
}

// The one unsupported call: older panos near the seed pano, or [] on any
// failure. Google documents no endpoint for this, so it is isolated here --
// keep the signature stable so nothing else changes, and the feature still
// works as a single-frame add while this returns [].
//
// TODO: port the request from sv-dlp (metadata.timeline) or streetview-dl
// (--historical) and verify against a real New Castle location before
// relying on it. Do not guess at the request format.
export async function listPriorPanos(_seed: PanoMeta): Promise<PanoMeta[]> {
  try {
    return [];
  } catch {
    return [];
  }
}
