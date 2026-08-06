"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Confirmation step for drag-to-move: LeafletMapView/GoogleMapView open this
// once a movable marker's dragend fires, holding the marker at its dropped
// position (see apps/web/user-stories.md "Spot page" #3). Nothing is persisted
// until the user confirms here.
export function MoveSpotDialog({
  spotId,
  spotName,
  from,
  to,
  onClose,
}: {
  spotId: number;
  spotName: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  onClose: (confirmed: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/spots/${spotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: to.lat, longitude: to.lng }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to move spot",
        );
      }
      router.refresh();
      onClose(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
      onClick={() => !pending && onClose(false)}
    >
      <div
        className="w-full max-w-sm rounded-md bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium">Move {spotName} here?</p>
        <p className="mt-1 text-xs text-neutral-500">
          From {from.lat.toFixed(5)}, {from.lng.toFixed(5)}
          <br />
          To {to.lat.toFixed(5)}, {to.lng.toFixed(5)}
        </p>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Moving…" : "Move spot"}
          </button>
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={pending}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
