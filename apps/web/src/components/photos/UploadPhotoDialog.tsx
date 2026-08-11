"use client";

import type { SpotOption, SpotSummary } from "@placekeeping/shared-types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MapView } from "@/components/map/MapView";
import { QuickAddSpotDialog } from "@/components/map/QuickAddSpotDialog";

// findNearbySpots takes radiusMi -- 20 meters converted to miles.
const NEARBY_RADIUS_MI = 20 / 1609.344;

type Step =
  | { kind: "select" }
  | { kind: "nearby"; url: string; observedAt: string | null; lat: number; lng: number }
  | { kind: "manual"; url: string; observedAt: string | null }
  | { kind: "create-gps"; url: string; observedAt: string | null; lat: number; lng: number };

export function UploadPhotoDialog({
  observerName,
  onClose,
}: {
  observerName: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "select" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/photos", { method: "POST", body: formData });
      if (res.status === 401) {
        setLoginRequired(true);
        return;
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Failed to upload photo",
        );
      }
      const { url, observedAt, location } = body as {
        url: string;
        observedAt: string | null;
        location: { lat: number; lng: number } | null;
      };
      if (location) {
        setStep({ kind: "nearby", url, observedAt, lat: location.lat, lng: location.lng });
      } else {
        setStep({ kind: "manual", url, observedAt });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function attachToSpot(spotId: number, url: string, observedAt: string | null) {
    const res = await fetch(`/api/spots/${spotId}/observations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photoUrls: [url],
        observedAt: observedAt ?? undefined,
        observerName: observerName ?? undefined,
      }),
    });
    if (res.status === 401) {
      setLoginRequired(true);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        typeof body?.error === "string" ? body.error : "Failed to attach photo",
      );
    }
    router.push(`/spots/${spotId}`);
    router.refresh();
    onClose();
  }

  // Rendered on its own -- QuickAddSpotDialog is itself a full fixed-overlay
  // dialog, so this replaces ours rather than nesting inside it.
  if (step.kind === "create-gps") {
    return (
      <QuickAddSpotDialog
        latitude={step.lat}
        longitude={step.lng}
        initialCoverPhotoUrl={step.url}
        initialCoverPhotoObservedAt={step.observedAt}
        onClose={onClose}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-md bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {loginRequired ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">
              You need to be logged in to upload photos.
            </p>
            <div className="flex gap-2">
              <Link
                href="/login"
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
              >
                Log in
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : step.kind === "select" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium">Upload a photo</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-neutral-500 hover:text-neutral-900"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-neutral-500">
              We&apos;ll check the photo for a location and suggest nearby spots.
            </p>
            <label className="flex h-32 w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-500 hover:bg-neutral-50">
              {uploading ? "Uploading…" : "Choose a photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={handleFileSelected}
              />
            </label>
            {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          </div>
        ) : step.kind === "nearby" ? (
          <NearbySpotsStep
            url={step.url}
            lat={step.lat}
            lng={step.lng}
            onSelect={(spotId) => attachToSpot(spotId, step.url, step.observedAt)}
            onCreateNew={() =>
              setStep({
                kind: "create-gps",
                url: step.url,
                observedAt: step.observedAt,
                lat: step.lat,
                lng: step.lng,
              })
            }
            onCancel={onClose}
          />
        ) : (
          <ManualSpotStep
            onSelect={(spotId) => attachToSpot(spotId, step.url, step.observedAt)}
            onCreateNew={() => {
              const params = new URLSearchParams({ coverPhotoUrl: step.url });
              if (step.observedAt) params.set("coverPhotoObservedAt", step.observedAt);
              router.push(`/spots/new?${params.toString()}`);
              onClose();
            }}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}

function NearbySpotsStep({
  url,
  lat,
  lng,
  onSelect,
  onCreateNew,
  onCancel,
}: {
  url: string;
  lat: number;
  lng: number;
  onSelect: (spotId: number) => Promise<void>;
  onCreateNew: () => void;
  onCancel: () => void;
}) {
  const [spots, setSpots] = useState<SpotSummary[] | null>(null);
  const [pendingSpotId, setPendingSpotId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/spots?lat=${lat}&lng=${lng}&radiusMi=${NEARBY_RADIUS_MI}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setSpots(body.spots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSpots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  async function handleSelect(spotId: number) {
    setError(null);
    setPendingSpotId(spotId);
    try {
      await onSelect(spotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPendingSpotId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <img
        src={url}
        alt="Uploaded photo"
        className="h-40 w-full rounded-md border border-neutral-200 object-cover"
      />
      <MapView spots={spots ?? []} center={{ lat, lng }} zoom={17} compact />
      <p className="text-sm font-medium">Is this one of these spots?</p>
      {spots === null ? (
        <p className="text-xs text-neutral-500">Looking for nearby spots…</p>
      ) : spots.length === 0 ? (
        <p className="text-xs text-neutral-500">No spots found nearby.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-neutral-200">
          {spots.map((spot) => (
            <li key={spot.spotId} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="text-sm font-medium">{spot.name}</p>
                {typeof spot.distanceMeters === "number" && (
                  <p className="text-xs text-neutral-500">
                    {Math.round(spot.distanceMeters)}m away
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={pendingSpotId !== null}
                onClick={() => handleSelect(spot.spotId)}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {pendingSpotId === spot.spotId ? "Adding…" : "This one"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          None of these — create a new spot
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ManualSpotStep({
  onSelect,
  onCreateNew,
  onCancel,
}: {
  onSelect: (spotId: number) => Promise<void>;
  onCreateNew: () => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingSpotId, setPendingSpotId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/spots/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((body) => {
          if (!cancelled) setResults(body.spots ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function handleSelect(spotId: number) {
    setError(null);
    setPendingSpotId(spotId);
    try {
      await onSelect(spotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPendingSpotId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        This photo doesn&apos;t have location info — search for a spot instead.
      </p>
      <input
        autoFocus
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Search spots by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {searching && <p className="text-xs text-neutral-500">Searching…</p>}
      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-neutral-200">
          {results.map((spot) => (
            <li key={spot.spotId} className="flex items-center justify-between gap-2 py-2">
              <p className="text-sm font-medium">{spot.name}</p>
              <button
                type="button"
                disabled={pendingSpotId !== null}
                onClick={() => handleSelect(spot.spotId)}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {pendingSpotId === spot.spotId ? "Adding…" : "This one"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          Create a new spot instead
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
