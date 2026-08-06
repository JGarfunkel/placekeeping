"use client";

import type { Observation } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ObservationForm({
  spotId,
  observerName,
  observation,
  onSuccess,
}: {
  spotId: number;
  observerName: string;
  // When set, the form edits this existing observation (PATCH) instead of
  // creating a new one (POST) -- see EditObservationDialog.
  observation?: Observation;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [observedAt, setObservedAt] = useState(
    observation?.observedAt ?? todayDateString(),
  );
  const [notes, setNotes] = useState(observation?.notes ?? "");
  const [photoUrls, setPhotoUrls] = useState<string[]>(
    observation?.photoUrls ?? [],
  );
  const [inaturalistObsUrl, setInaturalistObsUrl] = useState(
    observation?.inaturalistObsUrl ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function removePhoto(index: number) {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  }

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
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string" ? body.error : "Failed to upload photo",
        );
      }
      setPhotoUrls((prev) => [...prev, body.url]);
      if (body.observedAt) setObservedAt(body.observedAt);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const url = observation
        ? `/api/spots/${spotId}/observations/${observation.observationId}`
        : `/api/spots/${spotId}/observations`;
      const body = observation
        ? {
            observedAt,
            notes,
            photoUrls,
            inaturalistObsUrl: inaturalistObsUrl || undefined,
          }
        : {
            observedAt,
            observerName,
            notes: notes || undefined,
            photoUrls,
            inaturalistObsUrl: inaturalistObsUrl || undefined,
          };
      const res = await fetch(url, {
        method: observation ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : body?.error
              ? JSON.stringify(body.error)
              : "Failed to save observation",
        );
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/spots/${spotId}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 text-sm">
        Observer
        <span className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-700">
          {observerName}
        </span>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        Photos
        {photoUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photoUrls.map((url, index) => (
              <div key={url} className="relative h-24 w-24">
                <img
                  src={url}
                  alt="Uploaded photo preview"
                  className="h-24 w-24 rounded-md border border-neutral-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  aria-label="Remove photo"
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs leading-none text-white hover:bg-neutral-700"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="self-start text-sm text-neutral-600 hover:text-neutral-900 cursor-pointer">
          {uploading ? "Uploading…" : "Upload a photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelected}
            disabled={uploading}
          />
        </label>
        {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Date observed
        <input
          type="date"
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={observedAt}
          onChange={(e) => setObservedAt(e.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Notes
        <textarea
          className="rounded-md border border-neutral-300 px-3 py-2"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What's blooming, what was planted or removed, condition, work done…"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        iNaturalist observation URL (optional)
        <input
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={inaturalistObsUrl}
          onChange={(e) => setInaturalistObsUrl(e.target.value)}
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : observation ? "Save changes" : "Save observation"}
      </button>
    </form>
  );
}
