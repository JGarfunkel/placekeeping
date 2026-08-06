export type BaseLayerKey = "aerial" | "streets" | "osm" | "google";

interface TileLayerDef {
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export const BASE_LAYERS: Record<"aerial" | "streets" | "osm", TileLayerDef> & {
  google: { label: string };
} = {
  aerial: {
    label: "Aerial",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  streets: {
    label: "Default",
    // CartoDB Voyager: muted like Positron but with light color (water/parks/roads)
    // instead of greyscale, so pins stand out without the map looking flat.
    // Free, no API key required.
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
  // The original raw OSM raster style, kept as an option for users who want
  // full street/POI detail over the muted default.
  osm: {
    label: "Map (detailed)",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  // 'google' has no url/attribution here -- it isn't a Leaflet TileLayer.
  // MapView branches to the existing @vis.gl/react-google-maps tree instead.
  google: {
    label: "Google",
  },
};

export const TILE_LAYER_KEYS: Array<"aerial" | "streets" | "osm"> = ["aerial", "streets", "osm"];

// Must never be 'google' -- that's the whole point of making it non-default.
// CARTO's muted "streets" fill also gives pins (especially the green ones)
// a much easier background than aerial imagery's saturated tree canopy.
export const DEFAULT_BASE_LAYER: BaseLayerKey = "streets";

// Leaflet's MarkerClusterGroup default is 80px. Lowered so pins only merge
// when quite close together, leaving more of them visible individually
// (including when zoomed out, where more ground fits in the same pixel radius).
export const MAP_CLUSTER_RADIUS = 5;
