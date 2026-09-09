"use client";

import { useState } from "react";
import { QuickAddSpotDialog } from "@/components/map/QuickAddSpotDialog";

// Companion to the map's right-click "add spot" affordance (see
// LeafletMapView/GoogleMapView's canAddSpot) -- this one lives in the Spots
// list header and defaults the new spot to the site's map center rather than
// a clicked point, for when scrolling to the map isn't convenient.
export function AddSpotButton({
  siteId,
  center,
}: {
  siteId: number;
  center: { lat: number; lng: number };
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-neutral-600 underline hover:text-neutral-900"
      >
        add spot
      </button>
      {open && (
        <QuickAddSpotDialog
          latitude={center.lat}
          longitude={center.lng}
          siteId={siteId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
