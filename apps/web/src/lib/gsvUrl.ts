// Pure Street View URL helpers -- no env, no network, safe to import from
// client components and tests. The server-only fetching half is in gsv.ts.

export const GSV_BASE = "https://maps.googleapis.com/maps/api/streetview";

export type GsvView = {
  panoId: string;
  heading: number;
  pitch: number;
  fov: number;
};

export type ParsedSvUrl = {
  panoId?: string;
  lat?: number;
  lng?: number;
  heading?: number;
  pitch?: number;
  fov?: number;
};

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function clampView<T extends Omit<GsvView, "panoId">>(v: T): T {
  return {
    ...v,
    heading: clamp(v.heading, 0, 360),
    pitch: clamp(v.pitch, -90, 90),
    fov: clamp(v.fov, 10, 100),
  };
}

export function bearing(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(r(toLng - fromLng)) * Math.cos(r(toLat));
  const x =
    Math.cos(r(fromLat)) * Math.sin(r(toLat)) -
    Math.sin(r(fromLat)) * Math.cos(r(toLat)) * Math.cos(r(toLng - fromLng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function buildImageUrl(key: string, v: GsvView, size = "640x400"): string {
  return (
    `${GSV_BASE}?size=${size}&pano=${encodeURIComponent(v.panoId)}` +
    `&heading=${v.heading}&pitch=${v.pitch}&fov=${v.fov}&key=${key}`
  );
}

// Client-side: rebuild a server-issued image URL with new view params, so the
// API key never has to be exposed as its own client-side value.
export function retargetImageUrl(
  imageUrl: string,
  v: Omit<GsvView, "panoId">,
): string {
  const u = new URL(imageUrl);
  u.searchParams.set("heading", String(v.heading));
  u.searchParams.set("pitch", String(v.pitch));
  u.searchParams.set("fov", String(v.fov));
  return u.toString();
}

const num = (s: string | null): number | undefined => {
  if (s == null || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export function parseStreetViewUrl(raw: string): ParsedSvUrl {
  const u = new URL(raw);
  const out: ParsedSvUrl = {};
  const path = decodeURIComponent(u.pathname);

  // Maps URLs API form: ?map_action=pano&pano=ID&heading=..&pitch=..&fov=..
  const qPano = u.searchParams.get("pano");
  if (qPano) {
    out.panoId = qPano;
    out.heading = num(u.searchParams.get("heading"));
    out.pitch = num(u.searchParams.get("pitch"));
    out.fov = num(u.searchParams.get("fov"));
    return out;
  }

  // Browser form: /maps/@lat,lng,3a,75y,270.5h,90t/data=...!1sPANOID!2e0...
  const at = path.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    out.lat = Number(at[1]);
    out.lng = Number(at[2]);
  }

  const cam = path.match(/,(\d+(?:\.\d+)?)y,(\d+(?:\.\d+)?)h,(\d+(?:\.\d+)?)t/);
  if (cam) {
    out.fov = Number(cam[1]);
    out.heading = Number(cam[2]);
    out.pitch = Number(cam[3]) - 90; // URL t is 90 at the horizon; confirmed empirically that t below 90 means looking down in the Static API
  }

  const pano = path.match(/!1s([^!]+)!2e0/); // 2e0 marks official imagery
  if (pano) out.panoId = pano[1];

  if (!out.panoId && out.lat == null) {
    throw new Error("no pano or location in URL");
  }
  return out;
}
