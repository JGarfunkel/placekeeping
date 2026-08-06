"use client";

import type { SiteParcelGeometry } from "@placekeeping/core";
import type {
  ParcelCandidate,
  Site,
  Spot,
  SpotSummary,
} from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteMapAndParcels } from "@/components/sites/SiteMapAndParcels";
import { ParcelPicker, type ParcelSelection } from "./ParcelPicker";

// Owner-only "Change parcel" affordance for a spot whose site is already
// linked (local/spot-resolution.md) -- SiteColumn would otherwise render
// SiteMapAndParcels fully read-only once a site exists, so this is the only
// remaining way to correct a wrongly-discovered parcel (e.g. one that
// landed on a public road) after the fact. Owns the same SiteMapAndParcels
// map (via pickerCandidates/pickerSelected) rather than spinning up a
// second one for the picker -- see ParcelPicker's map-less design. The
// "change" button and lookup/picker UI render inside SiteMapAndParcels'
// Parcels section (via onStartChangeParcel/changeSessionOpen/
// changeParcelPanel) rather than in a block of our own, so the affordance
// lives next to the parcel list it acts on.
export function ChangeParcelControl({
  spot,
  site,
  parcelGeometries,
  memberSpots,
  center,
  movableSpotId,
  canEditSite,
}: {
  spot: Spot;
  site: Site;
  parcelGeometries: SiteParcelGeometry[];
  memberSpots: SpotSummary[];
  center: { lat: number; lng: number };
  movableSpotId?: number;
  canEditSite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<ParcelCandidate[] | null>(
    null,
  );
  const [selected, setSelected] = useState<ParcelSelection>("");
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startChange() {
    setOpen(true);
    setFinding(true);
    setError(null);
    setSelected("");
    try {
      const res = await fetch(`/api/spots/${spot.spotId}/parcel/lookup`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to look up nearby parcels");
      const { result } = await res.json();
      if (result.status === "candidates") {
        setCandidates(result.candidates);
      } else {
        // "unparcelled" -- the live search found nothing nearby at all.
        setCandidates([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setFinding(false);
    }
  }

  function cancel() {
    setOpen(false);
    setCandidates(null);
    setSelected("");
    setError(null);
  }

  function onConfirmed() {
    setOpen(false);
    setCandidates(null);
    setSelected("");
    router.refresh();
  }

  return (
    <SiteMapAndParcels
      site={site}
      parcelGeometries={parcelGeometries}
      memberSpots={memberSpots}
      center={center}
      currentSpotId={spot.spotId}
      movableSpotId={movableSpotId}
      pickerCandidates={candidates ?? undefined}
      pickerSelected={selected}
      canEditSite={canEditSite}
      currentSpotParcel={{ status: spot.parcelStatus, sbl: spot.parcelSbl }}
      onStartChangeParcel={startChange}
      changeSessionOpen={open}
      changeParcelPanel={
        open && (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            {finding && (
              <p className="text-sm text-neutral-500">
                Looking up nearby parcels…
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!finding && candidates && candidates.length === 0 && (
              <p className="text-sm text-neutral-500">
                No parcel data found near this pin. You can still mark it as
                having no parcel from a fresh discovery once more data is
                published.
              </p>
            )}
            {!finding && candidates && candidates.length > 0 && (
              <ParcelPicker
                spotId={spot.spotId}
                candidates={candidates}
                selected={selected}
                onSelectedChange={setSelected}
                onConfirmed={onConfirmed}
                onCancel={cancel}
              />
            )}
          </div>
        )
      }
    />
  );
}
