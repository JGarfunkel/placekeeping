"use client";

import type { SpotPurpose, Vegetation, WeedLevel } from "@placekeeping/shared-types";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { spotPurposeOptions, vegetationOptions } from "@/components/forms/spotOptions";
import { StewardAssociationPicker } from "@/components/forms/StewardAssociationPicker";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";
import {
  type EditState,
  type Field,
  onVegetationChange,
  onWeedLevelChange,
  overtakenPrompt,
  weedLevelWarning,
} from "@/taxonomy/vegetationWeedSync";

type SpotType = Exclude<SpotPurpose, "none">;
type StewardRef = { stewardId: string; name: string };

const spotTypeOptions = spotPurposeOptions.filter(
  (opt): opt is { value: SpotType; label: string } => opt.value !== "none",
);

// 4 slider positions map straight to the 4 WeedLevel values now that the
// taxonomy has exactly that many grades.
const weedSliderLabels = WEED_LEVELS.map((l) => l.label);

export function QuickAddSpotDialog({
  latitude,
  longitude,
  siteId,
  initialCoverPhotoUrl,
  onClose,
}: {
  latitude: number;
  longitude: number;
  siteId?: number;
  initialCoverPhotoUrl?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const geocodingLib = useMapsLibrary("geocoding");

  const [address, setAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState<SpotType>("garden");
  const [vegetation, setVegetation] = useState<Vegetation | "">("");
  const [weedLevel, setWeedLevel] = useState<WeedLevel>("minimal");
  const [touched, setTouched] = useState<Set<Field>>(new Set());
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(initialCoverPhotoUrl ?? "");
  const [selectedSteward, setSelectedSteward] = useState<StewardRef | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!geocodingLib) return;
    let cancelled = false;
    setAddressLoading(true);
    new geocodingLib.Geocoder()
      .geocode({ location: { lat: latitude, lng: longitude } })
      .then((response) => {
        if (!cancelled) setAddress(response.results[0]?.formatted_address ?? null);
      })
      .catch(() => {
        if (!cancelled) setAddress(null);
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [geocodingLib, latitude, longitude]);

  // This dialog is also opened from the Leaflet branch of MapView, which has
  // no APIProvider ancestor -- geocodingLib never resolves there, so without
  // this the "Looking up address..." state would hang forever instead of
  // falling through to manual entry.
  useEffect(() => {
    if (geocodingLib) return;
    const timeout = setTimeout(() => setAddressLoading(false), 2000);
    return () => clearTimeout(timeout);
  }, [geocodingLib]);

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    setPhotoError(null);
    setUploadingPhoto(true);
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
      setCoverPhotoUrl(body.url);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  const weedSlider = WEED_LEVELS.findIndex((l) => l.value === weedLevel);

  function applyEdit(edit: (s: EditState) => EditState) {
    const next = edit({ vegetation, weedLevel, touched: new Set(touched) });
    setVegetation(next.vegetation);
    setWeedLevel(next.weedLevel);
    setTouched(next.touched);
  }

  const editState: EditState = { vegetation, weedLevel, touched };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/spots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          latitude,
          longitude,
          address: address ?? undefined,
          description: description || undefined,
          purpose,
          vegetation: vegetation || undefined,
          weedLevel,
          coverPhotoUrl: coverPhotoUrl || undefined,
          stewardId: selectedSteward?.stewardId ?? undefined,
          siteId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to add spot",
        );
      }
      const { spot } = await res.json();
      router.push(`/spots/${spot.spotId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm font-medium">Add a spot here</p>
          <p className="text-xs text-neutral-500">
            {addressLoading
              ? "Looking up address…"
              : (address ?? "Address not found")}
            <br />
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </p>

          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              required
              autoFocus
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Description
            <textarea
              className="rounded-md border border-neutral-300 px-3 py-2"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <fieldset className="flex flex-col gap-1 text-sm">
            <legend>Type</legend>
            <div className="flex gap-3">
              {spotTypeOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="purpose"
                    checked={purpose === opt.value}
                    onChange={() => setPurpose(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1 text-sm">
            Steward
            <StewardAssociationPicker
              selected={selectedSteward}
              onSelect={setSelectedSteward}
            />
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Vegetation
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={vegetation}
              onChange={(e) =>
                applyEdit((s) =>
                  onVegetationChange(s, e.target.value as Vegetation | ""),
                )
              }
            >
              <option value="">Unspecified</option>
              {vegetationOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1 text-sm">
            Weed level
            <input
              type="range"
              min={0}
              max={3}
              step={1}
              value={weedSlider}
              onChange={(e) =>
                applyEdit((s) =>
                  onWeedLevelChange(s, WEED_LEVELS[Number(e.target.value)].value),
                )
              }
            />
            <div className="flex justify-between text-xs text-neutral-500">
              {weedSliderLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {overtakenPrompt(editState) && (
              <div className="flex flex-col gap-1.5 text-xs text-amber-600">
                <p>{overtakenPrompt(editState)}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      applyEdit((s) => onVegetationChange(s, "herbaceous_weeds"))
                    }
                    className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-50"
                  >
                    Herbaceous weeds
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyEdit((s) => onVegetationChange(s, "vigorous_weeds"))
                    }
                    className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-50"
                  >
                    Vigorous weeds
                  </button>
                </div>
              </div>
            )}
            {weedLevelWarning(editState) && (
              <p className="text-xs text-amber-600">{weedLevelWarning(editState)}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            Cover photo
            {coverPhotoUrl ? (
              <div className="relative h-32 w-full">
                <img
                  src={coverPhotoUrl}
                  alt="Cover photo preview"
                  className="h-32 w-full rounded-md border border-neutral-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setCoverPhotoUrl("")}
                  aria-label="Remove cover photo"
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-xs leading-none text-white hover:bg-neutral-700"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex h-32 w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-500 hover:bg-neutral-50">
                {uploadingPhoto ? "Uploading…" : "Add a photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploadingPhoto}
                  onChange={handlePhotoSelected}
                />
              </label>
            )}
            {photoError && <p className="text-xs text-red-600">{photoError}</p>}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || uploadingPhoto}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add spot"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
