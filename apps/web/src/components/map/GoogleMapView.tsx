"use client";

import { MarkerClusterer } from "@googlemaps/markerclusterer";
import type { SpotSummary } from "@placekeeping/shared-types";
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map,
  type MapMouseEvent,
  Polygon,
  useMap,
} from "@vis.gl/react-google-maps";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseLayerKey } from "@/components/map/baseLayers";
import { LayerSwitcher } from "@/components/map/LayerSwitcher";
import { clampBoundsToMaxExtent } from "@/lib/geo/maxExtent";
import { MAP_VIEW_COOKIE_NAME } from "@/lib/mapView";
import { renderPin } from "@/lib/pins/renderPin";
import { resolveSpotPin } from "@/lib/pins/resolveSpotPin";
import { MoveSpotDialog } from "./MoveSpotDialog";
import { QuickAddSpotDialog } from "./QuickAddSpotDialog";

function ViewStatePersister() {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("idle", () => {
      const mapCenter = map.getCenter();
      const zoom = map.getZoom();
      if (!mapCenter || zoom === undefined) return;
      const value = JSON.stringify({
        lat: mapCenter.lat(),
        lng: mapCenter.lng(),
        zoom,
      });
      document.cookie = `${MAP_VIEW_COOKIE_NAME}=${encodeURIComponent(value)}; path=/; samesite=lax`;
    });
    return () => listener.remove();
  }, [map]);

  return null;
}

function ZoomToMaxOffset({
  center,
  offset,
}: {
  center: { lat: number; lng: number };
  offset: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const service = new google.maps.MaxZoomService();
    service.getMaxZoomAtLatLng(center, (result) => {
      if (result.status === google.maps.MaxZoomStatus.OK) {
        map.setZoom(Math.max(0, result.zoom - offset));
      }
    });
  }, [map, center.lat, center.lng, offset]);

  return null;
}

function FitBoundsToPolygons({
  polygons,
  spots,
}: {
  polygons: ParcelPolygon[];
  // Folded into the fit alongside the polygons -- a spot pin sitting off a
  // parcel's own boundary should still be in frame, and including it here
  // (rather than fitting polygons alone) is what "near the pins" means for
  // the clamp below.
  spots: SpotSummary[];
}) {
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
    if (!map || boundsPolygons.length === 0) return;
    const raw = new google.maps.LatLngBounds();
    for (const polygon of boundsPolygons) {
      for (const ring of polygon.paths) {
        for (const point of ring) raw.extend(point);
      }
    }
    for (const spot of spots) raw.extend({ lat: spot.latitude, lng: spot.longitude });
    const ne = raw.getNorthEast();
    const sw = raw.getSouthWest();
    // Never zoom out further than MAX_SITE_EXTENT_METERS square, however
    // sprawling the raw polygon+pin bounds is (see clampBoundsToMaxExtent).
    const clamped = clampBoundsToMaxExtent({
      south: sw.lat(),
      north: ne.lat(),
      west: sw.lng(),
      east: ne.lng(),
    });
    map.fitBounds(
      new google.maps.LatLngBounds(
        { lat: clamped.south, lng: clamped.west },
        { lat: clamped.north, lng: clamped.east },
      ),
      32,
    );
  }, [map, boundsPolygons, spots]);

  return null;
}

function ClusteredMarkers({
  spots,
  onSelect,
  cluster,
  movableSpotId,
  onMoveDragEnd,
}: {
  spots: SpotSummary[];
  onSelect: (spot: SpotSummary) => void;
  // The site column map shows one site's own spots, few enough that we want
  // every pin visible individually rather than collapsed into a cluster.
  cluster: boolean;
  movableSpotId?: number;
  onMoveDragEnd?: (spot: SpotSummary, to: { lat: number; lng: number }) => void;
}) {
  const map = useMap();
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const [markers, setMarkers] = useState<
    Record<string, google.maps.marker.AdvancedMarkerElement>
  >({});

  useEffect(() => {
    if (!map || !cluster) return;
    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map });
    }
  }, [map, cluster]);

  useEffect(() => {
    if (!cluster) return;
    clustererRef.current?.clearMarkers();
    clustererRef.current?.addMarkers(Object.values(markers));
  }, [markers, cluster]);

  const setMarkerRef = useCallback(
    (marker: google.maps.marker.AdvancedMarkerElement | null, key: number) => {
      setMarkers((prev) => {
        if ((marker && prev[key]) || (!marker && !prev[key])) return prev;
        const next = { ...prev };
        if (marker) next[key] = marker;
        else delete next[key];
        return next;
      });
    },
    [],
  );

  // A fresh `ref={marker => ...}` closure every render gives the callback a
  // new identity each time, so React detaches and reattaches every marker on
  // every render — which itself triggers a state update, looping forever.
  // Caching one stable closure per spot id keeps the ref identity constant
  // across re-renders.
  const markerRefCallbacks = useRef<
    Record<
      number,
      (marker: google.maps.marker.AdvancedMarkerElement | null) => void
    >
  >({});
  const getMarkerRef = (key: number) => {
    let callback = markerRefCallbacks.current[key];
    if (!callback) {
      callback = (marker) => setMarkerRef(marker, key);
      markerRefCallbacks.current[key] = callback;
    }
    return callback;
  };

  return (
    <>
      {spots.map((spot) => {
        const pin = resolveSpotPin(spot);
        const isMovable = spot.spotId === movableSpotId;
        return (
          <AdvancedMarker
            key={spot.spotId}
            position={{ lat: spot.latitude, lng: spot.longitude }}
            ref={getMarkerRef(spot.spotId)}
            onClick={() => onSelect(spot)}
            draggable={isMovable}
            onDragEnd={
              isMovable
                ? (e) => {
                    if (!e.latLng) return;
                    onMoveDragEnd?.(spot, {
                      lat: e.latLng.lat(),
                      lng: e.latLng.lng(),
                    });
                  }
                : undefined
            }
          >
            {pin && (
              <div dangerouslySetInnerHTML={{ __html: renderPin(pin) }} />
            )}
          </AdvancedMarker>
        );
      })}
    </>
  );
}

export interface ParcelPolygon {
  key: string;
  paths: google.maps.LatLngLiteral[][];
  // Left undefined by every caller except the parcel-choice picker
  // (local/spot-resolution.md §4) -- when unset on every polygon in the
  // list, styling is unchanged from before (the default blue below). Only
  // once a picker starts marking polygons true/false does the dimmed style
  // kick in, so a not-yet-chosen candidate (or the parcel being replaced)
  // reads as "not the current selection" instead of implying a pick.
  highlighted?: boolean;
}

function ParcelPolygons({ polygons }: { polygons: ParcelPolygon[] }) {
  return (
    <>
      {polygons.map((polygon) => {
        const dimmed = polygon.highlighted === false;
        return (
          <Polygon
            key={polygon.key}
            paths={polygon.paths}
            strokeColor={dimmed ? "#9ca3af" : "#2563eb"}
            strokeOpacity={dimmed ? 0.6 : 0.8}
            strokeWeight={2}
            fillColor={dimmed ? "#9ca3af" : "#2563eb"}
            fillOpacity={dimmed ? 0.05 : 0.12}
          />
        );
      })}
    </>
  );
}

export function GoogleMapView({
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
  layer: BaseLayerKey;
  onLayerChange: (layer: BaseLayerKey) => void;
  movableSpotId?: number;
}) {
  const [selected, setSelected] = useState<SpotSummary | null>(null);
  const [pendingLocation, setPendingLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    spot: SpotSummary;
    to: { lat: number; lng: number };
  } | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

  if (!apiKey) {
    return (
      <div
        className={`relative flex w-full items-center justify-center rounded-md border border-dashed border-neutral-300 text-sm text-neutral-500 ${
          compact ? "h-[300px]" : "h-[600px]"
        }`}
      >
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map.
        <LayerSwitcher layer={layer} onChange={onLayerChange} />
      </div>
    );
  }

  function handleMapContextMenu(e: MapMouseEvent) {
    if (!canAddSpot || !e.detail.latLng) return;
    e.domEvent?.preventDefault();
    setSelected(null);
    setPendingLocation(e.detail.latLng);
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div
        className={`relative w-full overflow-hidden rounded-md ${
          compact ? "h-[300px]" : "h-[600px]"
        }`}
      >
        <Map
          mapId={mapId ?? "placekeeping-map"}
          defaultCenter={center}
          defaultZoom={zoom}
          mapTypeId={compact ? "satellite" : undefined}
          gestureHandling="greedy"
          zoomControl={!compact}
          mapTypeControl={!compact}
          streetViewControl={!compact}
          rotateControl={!compact}
          scaleControl={!compact}
          fullscreenControl
          onContextmenu={handleMapContextMenu}
        >
          {parcelPolygons && <ParcelPolygons polygons={parcelPolygons} />}
          <ClusteredMarkers
            spots={spots}
            onSelect={setSelected}
            cluster={!compact}
            movableSpotId={movableSpotId}
            onMoveDragEnd={(spot, to) => setPendingMove({ spot, to })}
          />
          {parcelPolygons && parcelPolygons.length > 0 ? (
            <FitBoundsToPolygons polygons={parcelPolygons} spots={spots} />
          ) : (
            compact && <ZoomToMaxOffset center={center} offset={3} />
          )}
          {persistViewState && <ViewStatePersister />}
          {selected && (
            <InfoWindow
              position={{ lat: selected.latitude, lng: selected.longitude }}
              onCloseClick={() => setSelected(null)}
            >
                <Link
                  href={`/spots/${selected.spotId}`}
                  className="block w-60 text-blue-600 underline"
                >
                {selected.name}
                </Link>
              <div className="text-sm">
                {selected.coverPhotoUrl && (
                  <img
                    src={selected.coverPhotoUrl}
                    alt=""
                    className="mb-1.5 h-[120px] w-60 rounded object-cover"
                  />
                )}
              </div>
            </InfoWindow>
          )}
        </Map>
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
    </APIProvider>
  );
}
