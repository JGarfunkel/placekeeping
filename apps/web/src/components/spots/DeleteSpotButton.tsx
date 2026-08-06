"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Owner/creator/admin-only destructive action from the spot detail page
// (apps/web/user-stories.md "Spot page" #4). Deleting cascades to the spot's
// observations at the DB level (see deleteSpot in packages/core/src/spots.ts).
export function DeleteSpotButton({
  spotId,
  spotName,
}: {
  spotId: number;
  spotName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/spots/${spotId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to delete spot",
        );
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Delete spot"
        title="Delete spot"
        className="ml-auto text-neutral-400 hover:text-red-600"
      >
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0l.6 9.4A1.5 1.5 0 0 0 7.6 17h4.8a1.5 1.5 0 0 0 1.5-1.6L14.5 6" />
        </svg>
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
          onClick={() => !pending && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-md bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium">Delete {spotName}?</p>
            <p className="mt-1 text-xs text-neutral-500">
              This permanently removes the spot and all of its observations.
              This can&apos;t be undone.
            </p>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete spot"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
