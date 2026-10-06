"use client";

import type { Focus, Setting, SpotFunction, WeedLevel } from "@placekeeping/shared-types";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  focusOptions,
  settingOptions,
  spotFunctionOptions,
} from "@/components/forms/spotOptions";
import { FormSection } from "@/components/forms/FormSection";
import { StewardAssociationPicker } from "@/components/forms/StewardAssociationPicker";
import { SPECIES_BLOOMING_BINS } from "@/taxonomy/speciesBloomingBins";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";

type StewardRef = { stewardId: string; name: string };

// 4 slider positions map straight to the 4 WeedLevel values now that the
// taxonomy has exactly that many grades.
const weedSliderLabels = WEED_LEVELS.map((l) => l.label);

export function QuickAddSpotDialog({
  latitude,
  longitude,
  siteId,
  initialCoverPhotoUrl,
  initialCoverPhotoObservedAt,
  onClose,
}: {
  latitude: number;
  longitude: number;
  siteId?: number;
  initialCoverPhotoUrl?: string;
  initialCoverPhotoObservedAt?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const geocodingLib = useMapsLibrary("geocoding");

  const [address, setAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spotFunction, setSpotFunction] = useState<SpotFunction>("cultivated");
  const [focus, setFocus] = useState<Focus | "">("");
  const [setting, setSetting] = useState<Setting | "">("");
  const [weedLevel, setWeedLevel] = useState<WeedLevel>("minimal");
  const [speciesBlooming, setSpeciesBlooming] = useState<number | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(initialCoverPhotoUrl ?? "");
  const [coverPhotoObservedAt, setCoverPhotoObservedAt] = useState(
    initialCoverPhotoObservedAt ?? null,
  );
  const [selectedSteward, setSelectedSteward] = useState<StewardRef | null>(null);
  const [stewardIsOwner, setStewardIsOwner] = useState(false);
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
      setCoverPhotoObservedAt(body.observedAt ?? null);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  const weedSlider = WEED_LEVELS.findIndex((l) => l.value === weedLevel);
  const speciesBloomingSlider = SPECIES_BLOOMING_BINS.findIndex(
    (b) => b.value === speciesBlooming,
  );

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
          purpose: spotFunction,
          focus: focus || undefined,
          setting: setting || undefined,
          weedLevel,
          speciesBlooming: speciesBlooming ?? undefined,
          coverPhotoUrl: coverPhotoUrl || undefined,
          coverPhotoObservedAt: coverPhotoUrl ? (coverPhotoObservedAt ?? undefined) : undefined,
          stewardId: selectedSteward?.stewardId ?? undefined,
          stewardIsOwner,
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
      onClose();
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
          <p className="text-sm font-medium">Add a spot / observation</p>
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
            <legend>Function</legend>
            <div className="grid grid-cols-4 gap-x-3 gap-y-1.5">
              {spotFunctionOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="purpose"
                    checked={spotFunction === opt.value}
                    onChange={() => setSpotFunction(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
          
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Focus
              <select
                className="rounded-md border border-neutral-300 px-3 py-2"
                value={focus}
                onChange={(e) => setFocus(e.target.value as Focus | "")}
              >
                <option value="">Unspecified</option>
                {focusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Setting
              <select
                className="rounded-md border border-neutral-300 px-3 py-2"
                value={setting}
                onChange={(e) => setSetting(e.target.value as Setting | "")}
              >
                <option value="">Unspecified</option>
                {settingOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>



          <div className="flex flex-col gap-1 text-sm">
            Overgrowth
            <input
              type="range"
              min={0}
              max={3}
              step={1}
              value={weedSlider}
              onChange={(e) => setWeedLevel(WEED_LEVELS[Number(e.target.value)].value)}
            />
            <div className="flex justify-between text-xs text-neutral-500">
              {weedSliderLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            Species blooming
            <input
              type="range"
              min={0}
              max={SPECIES_BLOOMING_BINS.length - 1}
              step={1}
              value={speciesBloomingSlider}
              onChange={(e) =>
                setSpeciesBlooming(
                  SPECIES_BLOOMING_BINS[Number(e.target.value)].value,
                )
              }
            />
            <div className="flex justify-between text-xs text-neutral-500">
              {SPECIES_BLOOMING_BINS.map((bin) => (
                <span key={bin.label}>{bin.label}</span>
              ))}
            </div>
          </div>

          <FormSection title="Steward" defaultOpen={false}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stewardIsOwner}
                onChange={(e) => setStewardIsOwner(e.target.checked)}
              />
              Steward Is Owner
            </label>

            <StewardAssociationPicker
              selected={selectedSteward}
              onSelect={setSelectedSteward}
            />
          </FormSection>

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
                  onClick={() => {
                    setCoverPhotoUrl("");
                    setCoverPhotoObservedAt(null);
                  }}
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
