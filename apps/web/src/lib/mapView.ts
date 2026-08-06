export const MAP_VIEW_COOKIE_NAME = "pk-map-view";

export type MapViewState = {
  lat: number;
  lng: number;
  zoom: number;
};

export function parseMapViewCookie(
  value: string | undefined | null,
): MapViewState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (
      typeof parsed?.lat === "number" &&
      typeof parsed?.lng === "number" &&
      typeof parsed?.zoom === "number" &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng) &&
      Number.isFinite(parsed.zoom)
    ) {
      return { lat: parsed.lat, lng: parsed.lng, zoom: parsed.zoom };
    }
  } catch {
    // Malformed or tampered cookie value — fall back to defaults.
  }
  return null;
}
