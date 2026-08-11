"use client";

import {
  formatPropertyClass,
  type ParcelCandidate,
  type ParcelLookupResult,
} from "@placekeeping/shared-types";
import { useState } from "react";
import type { ParcelPolygon } from "@/components/map/MapView";
import { multiPolygonToPolygonPaths } from "@/lib/geo/parcelGeometry";

const buttonClass =
  "self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50";

export const NO_PARCEL = "no-parcel" as const;
export type ParcelSelection = string | typeof NO_PARCEL | "";

// Candidate-then-confirm picker for a discovered set of nearby parcels
// (local/spot-resolution.md §4) -- shared by SiteDiscoveryPanel's initial
// "Discover parcel" flow and SiteMapAndParcels's post-link "Change parcel"
// flow. Never auto-picks: acreage/class/containment/address are shown so a
// mis-placed pin (e.g. one that landed in a public road) is visibly wrong
// before it gets linked, rather than silently trusting the first hit.
//
// Deliberately map-less and controlled (selection lives in the caller):
// both callers already render a map above this list, and the selection
// needs to drive that *same* map's highlighting rather than a second one
// living inside this component.
export function ParcelPicker({
  spotId,
  candidates,
  selected,
  onSelectedChange,
  onConfirmed,
  onCancel,
}: {
  spotId: number;
  candidates: ParcelCandidate[];
  selected: ParcelSelection;
  onSelectedChange: (value: ParcelSelection) => void;
  onConfirmed: (result: ParcelLookupResult) => void;
  onCancel?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (selected === "") return;
    setSaving(true);
    setError(null);
    try {
      const body =
        selected === NO_PARCEL
          ? { noParcel: true as const }
          : {
              swisSblId: selected,
              rollYr:
                candidates.find((c) => c.swisSblId === selected)?.rollYr ??
                null,
            };
      const res = await fetch(`/api/spots/${spotId}/parcel/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(
          errBody?.error
            ? JSON.stringify(errBody.error)
            : "Failed to save the parcel choice",
        );
      }
      const { result } = (await res.json()) as { result: ParcelLookupResult };
      onConfirmed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-neutral-500">
        Which parcel is this? (selecting highlights it on the map above)
      </p>

      <div className="flex flex-col gap-1">
        {candidates.map((c) => {
          // Prefer the street address as the headline -- printKey/SBL only
          // step in when no address is on file -- and never repeat
          // whichever one became the headline down in the detail line.
          const primaryLabel = c.address ?? c.printKey ?? c.swisSblId;
          const detailParts = [
            c.address && c.printKey ? c.printKey : null,
            formatPropertyClass(c.propClass),
            c.calcAcres != null ? `${c.calcAcres} ac` : null,
            [c.countyName, c.muniName].filter(Boolean).join(" / ") || null,
          ].filter(Boolean);

          return (
            <label
              key={c.swisSblId}
              className="flex items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name={`parcel-choice-${spotId}`}
                className="mt-1"
                checked={selected === c.swisSblId}
                onChange={() => onSelectedChange(c.swisSblId)}
              />
              <span className="flex flex-col">
                <span className="font-medium">
                  {primaryLabel}
                  {c.containsPin && (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-800">
                      covers this pin
                    </span>
                  )}
                </span>
                <span className="text-neutral-500">
                  {detailParts.length > 0 ? detailParts.join(" · ") : "—"}
                </span>
              </span>
            </label>
          );
        })}

        <label className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm">
          <input
            type="radio"
            name={`parcel-choice-${spotId}`}
            checked={selected === NO_PARCEL}
            onChange={() => onSelectedChange(NO_PARCEL)}
          />
          No parcel here (e.g. this spot is in the street)
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={selected === "" || saving}
          className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={buttonClass}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// Shared by both map-owning callers to turn a candidate list + the current
// radio selection into map polygons -- dimmed by default, blue once picked.
// Kept here (next to ParcelPicker) so the highlight semantics live with the
// selection state they're derived from.
export function parcelPolygonsForCandidates(
  candidates: ParcelCandidate[],
  selected: ParcelSelection,
): ParcelPolygon[] {
  return candidates.flatMap((c) =>
    multiPolygonToPolygonPaths(c.geometry).map((paths, i) => ({
      key: `candidate-${c.swisSblId}-${i}`,
      paths,
      highlighted: c.swisSblId === selected,
    })),
  );
}
