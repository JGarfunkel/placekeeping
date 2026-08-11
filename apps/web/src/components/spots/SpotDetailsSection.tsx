"use client";

import type { Spot, SpotPurpose, Vegetation, WeedLevel } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { FormSection } from "@/components/forms/FormSection";
import { spotPurposeOptions, vegetationOptions, weedLevelOptions } from "@/components/forms/spotOptions";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";
import {
  type EditState,
  type Field as SyncField,
  onVegetationChange,
  onWeedLevelChange,
  overtakenPrompt,
  weedLevelWarning,
} from "@/taxonomy/vegetationWeedSync";

const spotPurposeLabels: Record<string, string> = Object.fromEntries(
  spotPurposeOptions.map((opt) => [opt.value, opt.label]),
);
const vegetationLabels: Record<string, string> = Object.fromEntries(
  vegetationOptions.map((opt) => [opt.value, opt.label]),
);
const weedLevelLabels: Record<string, string> = Object.fromEntries(
  weedLevelOptions.map((opt) => [opt.value, opt.label]),
);
const weedSliderLabels = WEED_LEVELS.map((l) => l.label);

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="text-sm">
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="text-neutral-900">{value}</dd>
    </div>
  );
}

export function SpotDetailsSection({
  spot,
  canEdit,
}: {
  spot: Spot;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [purpose, setPurpose] = useState<SpotPurpose>(spot.purpose ?? "none");
  const [vegetation, setVegetation] = useState<Vegetation | "">(spot.vegetation ?? "");
  const [sizeSqft, setSizeSqft] = useState(
    spot.sizeSqft != null ? String(spot.sizeSqft) : "",
  );
  const [weedLevel, setWeedLevel] = useState<WeedLevel>(spot.weedLevel);
  const [touched, setTouched] = useState<Set<SyncField>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setPurpose(spot.purpose ?? "none");
    setVegetation(spot.vegetation ?? "");
    setSizeSqft(spot.sizeSqft != null ? String(spot.sizeSqft) : "");
    setWeedLevel(spot.weedLevel);
    setTouched(new Set());
    setError(null);
    setIsEditing(true);
  }

  function applyEdit(edit: (s: EditState) => EditState) {
    const next = edit({ vegetation, weedLevel, touched: new Set(touched) });
    setVegetation(next.vegetation);
    setWeedLevel(next.weedLevel);
    setTouched(next.touched);
  }

  const editState: EditState = { vegetation, weedLevel, touched };
  const weedSlider = WEED_LEVELS.findIndex((l) => l.value === weedLevel);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/spots/${spot.spotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose,
          vegetation: vegetation || undefined,
          sizeSqft: sizeSqft ? Number(sizeSqft) : undefined,
          weedLevel,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error ? JSON.stringify(body.error) : "Failed to save details",
        );
      }
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  const title = (
    <div className="flex items-center justify-between">
      <span>Details</span>
      {canEdit && !isEditing && (
        <button
          type="button"
          onClick={startEditing}
          aria-label="Edit spot details"
          title="Edit spot details"
          className="text-neutral-500 hover:text-neutral-900"
        >
          ✎
        </button>
      )}
    </div>
  );

  return (
    <FormSection title={title} collapsible={false}>
      {isEditing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Type
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as SpotPurpose)}
            >
              {spotPurposeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

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

          <label className="flex flex-col gap-1 text-sm">
            Size (sq ft)
            <input
              type="number"
              min="1"
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={sizeSqft}
              onChange={(e) => setSizeSqft(e.target.value)}
            />
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={pending}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="flex flex-col gap-3">
          <Field label="Type" value={spot.purpose ? spotPurposeLabels[spot.purpose] : null} />
          <Field
            label="Vegetation"
            value={spot.vegetation ? vegetationLabels[spot.vegetation] : null}
          />
          <Field
            label="Size"
            value={spot.sizeSqft != null ? `${spot.sizeSqft.toLocaleString()} sq ft` : null}
          />
          <Field label="Weed level" value={weedLevelLabels[spot.weedLevel]} />
          {!spot.purpose && !spot.vegetation && spot.sizeSqft == null && (
            <p className="text-sm text-neutral-500">No details added yet.</p>
          )}
        </dl>
      )}
    </FormSection>
  );
}
