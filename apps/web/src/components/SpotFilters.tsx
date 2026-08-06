"use client";

import type { Vegetation } from "@placekeeping/shared-types";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

const vegetationOptions: { value: Vegetation; label: string }[] = [
  { value: "vegetable_herb", label: "Vegetable / herb" },
  { value: "ornamental", label: "Ornamental" },
  { value: "pollinator", label: "Pollinator" },
  { value: "wetland", label: "Wetland" },
  { value: "woodland", label: "Woodland" },
  { value: "grassland", label: "Grassland" },
  { value: "mowed_lawn", label: "Mowed lawn" },
  { value: "herbaceous_weeds", label: "Herbaceous weeds" },
  { value: "vigorous_weeds", label: "Vigorous weeds" },
  { value: "none", label: "None" },
];

const radiusOptions = [5, 10, 15, 25, 50, 150];

export function SpotFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [locating, setLocating] = useState(false);
  const [, startTransition] = useTransition();

  function updateParam(name: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") {
      params.delete(name);
    } else {
      params.set(name, value);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", position.coords.latitude.toString());
        params.set("lng", position.coords.longitude.toString());
        startTransition(() => {
          router.push(`${pathname}?${params.toString()}`);
        });
      },
      () => setLocating(false),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50 disabled:opacity-50"
      >
        {locating ? "Locating…" : "Use my location"}
      </button>

      <label className="flex items-center gap-1.5">
        Radius
        <select
          className="rounded-md border border-neutral-300 px-2 py-1"
          value={searchParams.get("radiusMi") ?? "15"}
          onChange={(e) => updateParam("radiusMi", e.target.value)}
        >
          {radiusOptions.map((mi) => (
            <option key={mi} value={mi}>
              {mi} mi
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        Vegetation
        <select
          className="rounded-md border border-neutral-300 px-2 py-1"
          value={searchParams.get("vegetation") ?? ""}
          onChange={(e) => updateParam("vegetation", e.target.value || null)}
        >
          <option value="">Any</option>
          {vegetationOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={searchParams.get("unstewarded") === "true"}
          onChange={(e) =>
            updateParam("unstewarded", e.target.checked ? "true" : null)
          }
        />
        Unstewarded only
      </label>

      {searchParams.get("stewardId") && (
        <button
          type="button"
          onClick={() => updateParam("stewardId", null)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-50"
        >
          Clear steward filter
        </button>
      )}
    </div>
  );
}
