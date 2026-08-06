"use client";

import type { SpotSummary } from "@placekeeping/shared-types";
import L from "leaflet";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  useMapEvent,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { BASE_LAYERS, MAP_CLUSTER_RADIUS, type BaseLayerKey } from "@/components/map/baseLayers";
import type { ParcelPolygon } from "@/components/map/GoogleMapView";
import { LayerSwitcher } from "@/components/map/LayerSwitcher";
import { MAP_VIEW_COOKIE_NAME } from "@/lib/mapView";
import { DEFAULT_PIN_SVG, PIN_ANCHOR, renderPin } from "@/lib/pins/renderPin";
import { resolveSpotPin } from "@/lib/pins/resolveSpotPin";
import { MoveSpotDialog } from "./MoveSpotDialog";
import { QuickAddSpotDialog } from "./QuickAddSpotDialog";

// resolveSpotPin returns null when there's no glyph to draw (e.g. a
// wild_area spot with no vegetation set yet). Google's AdvancedMarker falls
// back to its own default red pin in that case; this is the Leaflet
// equivalent, reusing the same teardrop outline as every other pin.
const DEFAULT_ICON = L.divIcon({
  html: DEFAULT_PIN_SVG,
  className: "pk-pin",
  iconSize: [28, 38],
  iconAnchor: [PIN_ANCHOR.x, PIN_ANCHOR.y],
});

function iconFor(spot: SpotSummary): L.DivIcon {
  const pin = resolveSpotPin(spot);
  if (!pin) return DEFAULT_ICON;
  return L.divIcon({
    html: renderPin(pin),
    className: "pk-pin",
    iconSize: [28, 38],
    iconAnchor: [PIN_ANCHOR.x, PIN_ANCHOR.y],
  });
}

function SpotMarkers({
  spots,
  cluster,
  movableSpotId,
  onMoveDragEnd,
}: {
  spots: SpotSummary[];
  cluster: boolean;
  movableSpotId?: number;
  onMoveDragEnd?: (spot: SpotSummary, to: { lat: number; lng: number }) => void;
}) {
  const markers = spots.map((spot) => {
    const isMovable = spot.spotId === movableSpotId;
    return (
      <Marker
        key={spot.spotId}
        position={[spot.latitude, spot.longitude]}
        icon={iconFor(spot)}
        draggable={isMovable}
        eventHandlers={
          isMovable
            ? {
                dragend: (e) => {
                  const latlng = e.target.getLatLng();
                  onMoveDragEnd?.(spot, { lat: latlng.lat, lng: latlng.lng });
                },
              }
            : undefined
        }
      >
        <Popup>
            <Link href={`/spots/${spot.spotId}`} className="block w-60 text-blue-600 underline">
            {spot.name}
            </Link>
          <div className="text-sm">
            {spot.coverPhotoUrl && (
              <img
                src={spot.coverPhotoUrl}
                alt=""
                className="mb-1.5 h-[120px] w-60 rounded object-cover"
              />
            )}
          </div>
        </Popup>
      </Marker>
    );
  });

  // The site column map shows one site's own spots, few enough that we want
  // every pin visible individually rather than collapsed into a cluster.
  if (!cluster) return <>{markers}</>;
  return (
    <MarkerClusterGroup chunkedLoading maxClusterRadius={MAP_CLUSTER_RADIUS}>
      {markers}
    </MarkerClusterGroup>
  );
}

function ContextMenuToAdd({
  onAdd,
}: {
  onAdd: (latlng: { lat: number; lng: number }) => void;
}) {
  useMapEvent("contextmenu", (e) => {
    onAdd({ lat: e.latlng.lat, lng: e.latlng.lng });
  });
  return null;
}

function ViewStatePersister() {
  useMapEvent("moveend", (e) => {
    const map = e.target;
    const c = map.getCenter();
    const value = JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    document.cookie = `${MAP_VIEW_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; samesite=lax`;
  });
  return null;
}

function FitBoundsToPolygons({ polygons }: { polygons: ParcelPolygon[] }) {
  const map = useMap();
  // While a candidate picker is toggling `highlighted` on/off (see
  // ParcelPicker), fit to just the highlighted one so it fills the box
  // instead of staying zoomed out to fit every candidate at once. Falls
  // back to fitting everything when nothing is highlighted -- the initial
  // "here are your choices" view, and every non-picker caller (which never
  // sets `highlighted` at all).
  const highlighted = polygons.filter((p) => p.highlighted);
  const boundsPolygons = highlighted.length > 0 ? highlighted : polygons;

  useEffect(() => {
    if (boundsPolygons.length === 0) return;
    const bounds = L.latLngBounds(
      boundsPolygons.flatMap((polygon) => polygon.paths.flatMap((ring) => ring.map((p) => [p.lat, p.lng] as [number, number]))),
    );
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [map, boundsPolygons]);

  return null;
}

// Leaflet has no per-coordinate "actual max zoom" service like Google's
// MaxZoomService. Approximated with a fixed value (layer max minus an
// offset) rather than a dynamic lookup -- see design.md "Max zoom: fixed
// value, not dynamic".
function ZoomToFixedOffset({ zoom }: { zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setZoom(zoom);
    // Only on mount, matching the Google branch's one-shot zoom-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

function ParcelPolygons({ polygons }: { polygons: ParcelPolygon[] }) {
  return (
    <>
      {polygons.map((polygon) => {
        const dimmed = polygon.highlighted === false;
        return (
          <Polygon
            key={polygon.key}
            positions={polygon.paths.map((ring) => ring.map((p) => [p.lat, p.lng] as [number, number]))}
            pathOptions={{
              color: dimmed ? "#9ca3af" : "#2563eb",
              opacity: dimmed ? 0.6 : 0.8,
              weight: 2,
              fillColor: dimmed ? "#9ca3af" : "#2563eb",
              fillOpacity: dimmed ? 0.05 : 0.12,
            }}
          />
        );
      })}
    </>
  );
}

export function LeafletMapView({
  spots,
  center,
  zoom = 11,
  canAddSpot = false,
  siteId,
  compact = false,
  persistViewState = false,
  parcelPolygons,
  layer,
  onLayerChange,
  movableSpotId,
}: {
  spots: SpotSummary[];
  center: { lat: number; lng: number };
  zoom?: number;
  canAddSpot?: boolean;
  siteId?: number;
  compact?: boolean;
  persistViewState?: boolean;
  parcelPolygons?: ParcelPolygon[];
  layer: Exclude<BaseLayerKey, "google">;
  onLayerChange: (layer: BaseLayerKey) => void;
  movableSpotId?: number;
}) {
  const [pendingLocation, setPendingLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    spot: SpotSummary;
    to: { lat: number; lng: number };
  } | null>(null);
  const hasPolygons = !!parcelPolygons && parcelPolygons.length > 0;

  return (
    <>
      <div
        className={`relative w-full overflow-hidden rounded-md ${
          compact ? "h-[300px]" : "h-[600px]"
        }`}
      >
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          maxZoom={BASE_LAYERS[layer].maxZoom}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            key={layer}
            url={BASE_LAYERS[layer].url}
            attribution={BASE_LAYERS[layer].attribution}
            maxZoom={BASE_LAYERS[layer].maxZoom}
          />

          {parcelPolygons && <ParcelPolygons polygons={parcelPolygons} />}
          <SpotMarkers
            spots={spots}
            cluster={!compact}
            movableSpotId={movableSpotId}
            onMoveDragEnd={(spot, to) => setPendingMove({ spot, to })}
          />

          {hasPolygons ? (
            <FitBoundsToPolygons polygons={parcelPolygons!} />
          ) : (
            compact && <ZoomToFixedOffset zoom={BASE_LAYERS[layer].maxZoom - 3} />
          )}

          {persistViewState && <ViewStatePersister />}
          {canAddSpot && (
            <ContextMenuToAdd onAdd={setPendingLocation} />
          )}
        </MapContainer>
        <LayerSwitcher layer={layer} onChange={onLayerChange} />
      </div>
      {pendingLocation && (
        <QuickAddSpotDialog
          latitude={pendingLocation.lat}
          longitude={pendingLocation.lng}
          siteId={siteId}
          onClose={() => setPendingLocation(null)}
        />
      )}
      {pendingMove && (
        <MoveSpotDialog
          spotId={pendingMove.spot.spotId}
          spotName={pendingMove.spot.name}
          from={{ lat: pendingMove.spot.latitude, lng: pendingMove.spot.longitude }}
          to={pendingMove.to}
          onClose={() => setPendingMove(null)}
        />
      )}
    </>
  );
}
