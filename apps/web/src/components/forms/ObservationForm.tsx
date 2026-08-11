"use client";

import type { Observation, Vegetation, WeedLevel } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type EditState,
  type Field,
  onVegetationChange,
  onWeedLevelChange,
  overtakenPrompt,
  weedLevelWarning,
} from "@/taxonomy/vegetationWeedSync";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";
import { vegetationOptions } from "./spotOptions";

// 4 slider positions map straight to the 4 WeedLevel values -- see the same
// convention in QuickAddSpotDialog.
const weedSliderLabels = WEED_LEVELS.map((l) => l.label);

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
  // The spot's own current vegetation/weedLevel -- only used to seed the
  // fields below when this observation doesn't already have its own values
  // (a fresh create, or a legacy row never backfilled). See schema.ts.
  spotVegetation = null,
  spotWeedLevel = "minimal",
  // Only meaningful in create mode (see the "Log Stewardship Activity"
  // toggle below) -- editing an existing observation's steward is handled
  // separately, by ObservationsPanel's own StewardshipActions on the card.
  currentStewardId = null,
  onSuccess,
}: {
  spotId: number;
  observerName: string;
  // When set, the form edits this existing observation (PATCH) instead of
  // creating a new one (POST) -- see EditObservationDialog.
  observation?: Observation;
  spotVegetation?: Vegetation | null;
  spotWeedLevel?: WeedLevel;
  currentStewardId?: string | null;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [observedAt, setObservedAt] = useState(
    observation?.observedAt ?? todayDateString(),
  );
  const [notes, setNotes] = useState(observation?.notes ?? "");
  const [vegetation, setVegetation] = useState<Vegetation | "">(
    observation?.vegetation ?? spotVegetation ?? "",
  );
  const [weedLevel, setWeedLevel] = useState<WeedLevel>(
    observation?.weedLevel ?? spotWeedLevel ?? "minimal",
  );
  const [touched, setTouched] = useState<Set<Field>>(new Set());
  const [photoUrls, setPhotoUrls] = useState<string[]>(
    observation?.photoUrls ?? [],
  );
  const [inaturalistObsUrl, setInaturalistObsUrl] = useState(
    observation?.inaturalistObsUrl ?? "",
  );
  const [claimStewardship, setClaimStewardship] = useState(false);
  const [becomingSteward, setBecomingSteward] = useState(false);
  const [becomeStewardError, setBecomeStewardError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const weedSlider = WEED_LEVELS.findIndex((l) => l.value === weedLevel);

  function applyEdit(edit: (s: EditState) => EditState) {
    const next = edit({ vegetation, weedLevel, touched: new Set(touched) });
    setVegetation(next.vegetation);
    setWeedLevel(next.weedLevel);
    setTouched(next.touched);
  }

  const editState: EditState = { vegetation, weedLevel, touched };

  async function becomeSteward() {
    setBecomeStewardError(null);
    setBecomingSteward(true);
    try {
      const res = await fetch("/api/stewards/me", { method: "POST" });
      if (!res.ok) throw new Error("Failed to sign up as a steward");
      // currentStewardId flows back down as a prop once this resolves --
      // the dialog stays open and its own state (including claimStewardship
      // below) survives the refresh.
      router.refresh();
    } catch (err) {
      setBecomeStewardError(
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setBecomingSteward(false);
    }
  }

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
            vegetation: vegetation || undefined,
            weedLevel,
            photoUrls,
            inaturalistObsUrl: inaturalistObsUrl || undefined,
          }
        : {
            observedAt,
            observerName,
            notes: notes || undefined,
            vegetation: vegetation || undefined,
            weedLevel,
            photoUrls,
            inaturalistObsUrl: inaturalistObsUrl || undefined,
            claimStewardship,
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

      {!observation && (
        <div className="flex flex-wrap items-center gap-2">
          {!currentStewardId && (
            <button
              type="button"
              onClick={becomeSteward}
              disabled={becomingSteward}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50"
            >
              {becomingSteward ? "Signing up…" : "Become a Steward"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setClaimStewardship((prev) => !prev)}
            disabled={!currentStewardId}
            title={!currentStewardId ? "Become a steward first" : undefined}
            aria-pressed={claimStewardship}
            className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
              claimStewardship
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-700 hover:border-neutral-400"
            }`}
          >
            {claimStewardship ? "Logging Stewardship Activity ✓" : "Log Stewardship Activity"}
          </button>
          {becomeStewardError && (
            <p className="w-full text-xs text-red-600">{becomeStewardError}</p>
          )}
        </div>
      )}

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
        Vegetation
        <select
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={vegetation}
          onChange={(e) =>
            applyEdit((s) => onVegetationChange(s, e.target.value as Vegetation | ""))
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
            applyEdit((s) => onWeedLevelChange(s, WEED_LEVELS[Number(e.target.value)].value))
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
                onClick={() => applyEdit((s) => onVegetationChange(s, "herbaceous_weeds"))}
                className="rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-50"
              >
                Herbaceous weeds
              </button>
              <button
                type="button"
                onClick={() => applyEdit((s) => onVegetationChange(s, "vigorous_weeds"))}
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
