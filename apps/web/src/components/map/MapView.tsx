"use client";

import type { SpotSummary } from "@placekeeping/shared-types";
import dynamic from "next/dynamic";
import { GoogleMapView, type ParcelPolygon } from "@/components/map/GoogleMapView";
import { useBaseLayer } from "@/hooks/useBaseLayer";

export type { ParcelPolygon };

// Leaflet reads `window` at import time, which crashes during Next's server
// prerender of client components -- `ssr: false` skips the import on the
// server entirely. Two variants (rather than one dynamic component plus a
// prop) so the loading placeholder can reserve the right height and avoid a
// layout shift once the chunk loads; both point at the same module/chunk.
const LeafletMapViewFull = dynamic(
  () => import("@/components/map/LeafletMapView").then((m) => m.LeafletMapView),
  { ssr: false, loading: () => <div className="h-[600px] w-full rounded-md bg-neutral-100" /> },
);
const LeafletMapViewCompact = dynamic(
  () => import("@/components/map/LeafletMapView").then((m) => m.LeafletMapView),
  { ssr: false, loading: () => <div className="h-[300px] w-full rounded-md bg-neutral-100" /> },
);

export function MapView(props: {
  spots: SpotSummary[];
  center: { lat: number; lng: number };
  zoom?: number;
  canAddSpot?: boolean;
  siteId?: number;
  compact?: boolean;
  persistViewState?: boolean;
  parcelPolygons?: ParcelPolygon[];
  movableSpotId?: number;
}) {
  const [layer, setLayer] = useBaseLayer();

  if (layer === "google") {
    return <GoogleMapView {...props} layer={layer} onLayerChange={setLayer} />;
  }

  const LeafletMapView = props.compact ? LeafletMapViewCompact : LeafletMapViewFull;
  return <LeafletMapView {...props} layer={layer} onLayerChange={setLayer} />;
}
