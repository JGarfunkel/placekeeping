"use client";

import type { SpotSummary } from "@placekeeping/shared-types";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { MapView } from "@/components/map/MapView";
import { inBounds, type MapBounds } from "@/lib/mapBounds";
import { DEFAULT_PIN_SVG, renderPin } from "@/lib/pins/renderPin";
import { resolveSpotPin } from "@/lib/pins/resolveSpotPin";

// "YYYY-MM-DD" as a local date -- new Date("YYYY-MM-DD") parses as UTC and
// can display as the previous day.
function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

// The front page's map plus the right-hand column: promoted ("welcome") notes
// on top and an "Updates" list of the loaded spots below, newest activity
// first. On wide screens the column is as tall as the map plus its legend, so
// the list scrolls instead of running past them. Lives in one client
// component because the optional "visible on map" filter needs the map's
// current bounds.
export function HomeMapAndUpdates({
  spots,
  center,
  zoom,
  canAddSpot,
  dbUnavailable,
  legend,
  welcome,
}: {
  spots: SpotSummary[];
  center: { lat: number; lng: number };
  zoom: number;
  canAddSpot: boolean;
  dbUnavailable: boolean;
  legend: ReactNode;
  welcome: ReactNode;
}) {
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [filterToMap, setFilterToMap] = useState(false);

  // Skip no-op updates: the map reports on every settle, even when nothing moved.
  const handleBounds = useCallback((next: MapBounds) => {
    setBounds((prev) =>
      prev &&
      prev.north === next.north &&
      prev.south === next.south &&
      prev.east === next.east &&
      prev.west === next.west
        ? prev
        : next,
    );
  }, []);

  const updates = useMemo(() => {
    const sorted = [...spots].sort(
      (a, b) =>
        (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") ||
        a.name.localeCompare(b.name),
    );
    return filterToMap && bounds
      ? sorted.filter((s) => inBounds(bounds, s.latitude, s.longitude))
      : sorted;
  }, [spots, filterToMap, bounds]);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)]">
      <div className="min-w-0">
        <MapView
          spots={spots}
          center={center}
          zoom={zoom}
          canAddSpot={canAddSpot}
          persistViewState
          onBoundsChange={handleBounds}
        />
        {legend}
      </div>

      {/* The map + legend column sets the row height; on wide screens this
          column is filled into that space (absolute inset-0) so it ends at the
          bottom of the legend without ever making the row taller itself. The
          grid tracks above fix the widths, so neither column can squeeze the
          other. */}
      <div className="md:relative">
        <div className="flex min-h-0 flex-col gap-4 md:absolute md:inset-0">
        {welcome && (
          <div className="shrink-0">{welcome}</div>
        )}

        <section className="flex min-h-0 flex-col md:flex-1">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 pb-2">
            <h2 className="text-lg font-medium">Updates</h2>
            <label className="flex items-center gap-1.5 text-sm text-neutral-600">
              <input
                type="checkbox"
                checked={filterToMap}
                onChange={(e) => setFilterToMap(e.target.checked)}
              />
              Filter to those visible on map
            </label>
          </div>
          <ul className="max-h-96 divide-y divide-neutral-200 overflow-y-auto md:max-h-none md:min-h-0 md:flex-1">
            {updates.map((spot) => {
              const pin = resolveSpotPin(spot);
              const pinSvg = pin ? renderPin(pin) : DEFAULT_PIN_SVG;
              return (
                <li key={spot.spotId} className="flex items-start gap-2 py-3">
                  <div
                    className="h-[38px] w-7 shrink-0"
                    dangerouslySetInnerHTML={{ __html: pinSvg }}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/spots/${spot.spotId}`}
                      className="text-sm font-medium underline"
                    >
                      {spot.name}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {spot.lastActivityAt && formatDay(spot.lastActivityAt)}
                      {spot.stewardId && (
                        <>
                          {spot.lastActivityAt && " · "}
                          <Link
                            href={`/stewards/${spot.stewardId}`}
                            className="underline"
                          >
                            Stewarded
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {updates.length === 0 && (
              <li className="py-6 text-sm text-neutral-500">
                {dbUnavailable
                  ? "Spots couldn't be loaded right now."
                  : filterToMap && spots.length > 0
                    ? "No spots in the current map view."
                    : "No spots found in this area. Try widening the radius."}
              </li>
            )}
          </ul>
        </section>
        </div>
      </div>
    </div>
  );
}
