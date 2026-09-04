"use client";

import type {
  Focus,
  Setting,
  Spot,
  SpotFunction,
  WeedLevel,
} from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { BloomMonthsInput, formatBloomMonths } from "@/components/forms/BloomMonthsField";
import { FormSection } from "@/components/forms/FormSection";
import {
  focusOptions,
  settingOptions,
  spotFunctionOptions,
  weedLevelOptions,
} from "@/components/forms/spotOptions";
import { WEED_LEVELS } from "@/taxonomy/weedLevels";

const spotFunctionLabels: Record<string, string> = Object.fromEntries(
  spotFunctionOptions.map((opt) => [opt.value, opt.label]),
);
const focusLabels: Record<string, string> = Object.fromEntries(
  focusOptions.map((opt) => [opt.value, opt.label]),
);
const settingLabels: Record<string, string> = Object.fromEntries(
  settingOptions.map((opt) => [opt.value, opt.label]),
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
  const [spotFunction, setSpotFunction] = useState<SpotFunction | "">(spot.purpose ?? "");
  const [focus, setFocus] = useState<Focus | "">(spot.focus ?? "");
  const [setting, setSetting] = useState<Setting | "">(spot.setting ?? "");
  const [sizeSqft, setSizeSqft] = useState(
    spot.sizeSqft != null ? String(spot.sizeSqft) : "",
  );
  const [weedLevel, setWeedLevel] = useState<WeedLevel>(spot.weedLevel);
  const [bloomMonths, setBloomMonths] = useState<number[]>(spot.bloomMonths);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setSpotFunction(spot.purpose ?? "");
    setFocus(spot.focus ?? "");
    setSetting(spot.setting ?? "");
    setSizeSqft(spot.sizeSqft != null ? String(spot.sizeSqft) : "");
    setWeedLevel(spot.weedLevel);
    setBloomMonths(spot.bloomMonths);
    setError(null);
    setIsEditing(true);
  }

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
          purpose: spotFunction || undefined,
          focus: focus || undefined,
          setting: setting || undefined,
          sizeSqft: sizeSqft ? Number(sizeSqft) : undefined,
          weedLevel,
          bloomMonths,
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
            Function
            <select
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={spotFunction}
              onChange={(e) => setSpotFunction(e.target.value as SpotFunction | "")}
            >
              <option value="">Unspecified</option>
              {spotFunctionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

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

          <fieldset className="flex flex-col gap-1 text-sm">
            <legend>Bloom months</legend>
            <BloomMonthsInput value={bloomMonths} onChange={setBloomMonths} />
            <span className="text-xs text-neutral-500">
              Which months this spot is known to bloom in. Tap or drag across cells.
            </span>
          </fieldset>

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
          <Field
            label="Function"
            value={spot.purpose ? spotFunctionLabels[spot.purpose] : null}
          />
          <Field label="Focus" value={spot.focus ? focusLabels[spot.focus] : null} />
          <Field label="Setting" value={spot.setting ? settingLabels[spot.setting] : null} />
          <Field
            label="Size"
            value={spot.sizeSqft != null ? `${spot.sizeSqft.toLocaleString()} sq ft` : null}
          />
          <Field label="Overgrowth" value={weedLevelLabels[spot.weedLevel]} />
          <Field label="Bloom months" value={formatBloomMonths(spot.bloomMonths)} />
          {!spot.purpose && !spot.focus && !spot.setting && spot.sizeSqft == null && (
            <p className="text-sm text-neutral-500">No details added yet.</p>
          )}
        </dl>
      )}
    </FormSection>
  );
}
