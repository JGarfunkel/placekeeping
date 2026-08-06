"use client";

import { useState } from "react";

// Shared by StewardProfileForm (logo) and ProfilePhotoForm (profile photo) --
// both are a single moderated image, uploaded via the same POST /api/photos
// path as spot cover photos/observations, or pasted as an external URL
// (moderated on save instead, see checkPhotoUrls in updateSteward /
// updateUserProfile).
export function PhotoUploadField({
  value,
  onChange,
  label,
  rounded = false,
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  rounded?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState(value);

  function selectPhoto(url: string) {
    onChange(url);
    setLoadError(false);
    setUrlDraft(url);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setError(null);
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
      selectPhoto(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  }

  const shapeClass = rounded ? "rounded-full" : "rounded-md";

  return (
    <div className="flex flex-col gap-2 text-sm">
      {label}
      <div className="flex items-center gap-4">
        {value.trim() && !loadError ? (
          <div className="relative h-24 w-24 shrink-0">
            <img
              src={value.trim()}
              alt={`${label} preview`}
              className={`h-24 w-24 border border-neutral-200 object-cover ${shapeClass}`}
              onError={() => setLoadError(true)}
            />
            <button
              type="button"
              onClick={() => selectPhoto("")}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs leading-none text-white hover:bg-neutral-700"
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            className={`flex h-24 w-24 shrink-0 items-center justify-center border border-dashed border-neutral-300 text-center text-xs text-neutral-500 ${shapeClass}`}
          >
            {value.trim() && loadError ? "Couldn't load" : "No photo"}
          </div>
        )}

        <div className="flex flex-col items-start gap-1">
          <label className="cursor-pointer text-sm font-medium text-neutral-600 underline hover:text-neutral-900">
            {uploading ? "Uploading…" : value.trim() ? "Change photo" : "Upload photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={handleFileSelected}
            />
          </label>
          <button
            type="button"
            onClick={() => setUrlInputOpen((open) => !open)}
            className="text-xs text-neutral-500 underline hover:text-neutral-900"
          >
            {urlInputOpen ? "Cancel" : "Or paste an image URL"}
          </button>
        </div>
      </div>

      {urlInputOpen && (
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://…"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              selectPhoto(urlDraft.trim());
              setUrlInputOpen(false);
            }}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Use
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
