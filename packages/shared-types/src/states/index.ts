import { CT_STATE_CONFIG } from "./ct";
import { MA_STATE_CONFIG } from "./ma";
import { ME_STATE_CONFIG } from "./me";
import { NH_STATE_CONFIG } from "./nh";
import { NJ_STATE_CONFIG } from "./nj";
import { NY_STATE_CONFIG } from "./ny";
import { RI_STATE_CONFIG } from "./ri";
import type { StateConfig } from "./types";
import { VT_STATE_CONFIG } from "./vt";

export * from "./types";

export const STATE_CONFIGS: Record<string, StateConfig> = {
  ny: NY_STATE_CONFIG,
  nj: NJ_STATE_CONFIG,
  ma: MA_STATE_CONFIG,
  ct: CT_STATE_CONFIG,
  ri: RI_STATE_CONFIG,
  nh: NH_STATE_CONFIG,
  vt: VT_STATE_CONFIG,
  me: ME_STATE_CONFIG,
};

// The one state guaranteed to have a config -- used as a fallback when a
// caller has no better signal for which state's data to use (e.g. no spot
// state on record yet, or a point outside every configured bounding box).
export const DEFAULT_STATE_CODE = "ny";

export function getStateConfig(stateCode: string): StateConfig | undefined {
  return STATE_CONFIGS[stateCode.toLowerCase()];
}

// Every configured state whose bounding box contains the point, roughest
// possible pre-filter for "which state's GIS services should I query for
// this location" -- not a precise border check, just cheap enough to avoid
// querying every configured state's service for every point.
export function statesForPoint(lat: number, lng: number): StateConfig[] {
  return Object.values(STATE_CONFIGS).filter(
    (state) =>
      lat >= state.boundingBox.minLat &&
      lat <= state.boundingBox.maxLat &&
      lng >= state.boundingBox.minLng &&
      lng <= state.boundingBox.maxLng,
  );
}

// Looks up the human-readable description for a state's PROP_CLASS-style
// code, e.g. NY "210" -> "One family year-round residence". Falls back to
// the hundreds-series label (e.g. "Residential") for codes not individually
// listed. No per-parcel state is tracked yet (see packages/db/src/schema.ts's
// `parcels` table), so this always reads the default configured state's
// table -- fine while that's the only state with parcel data.
export function describePropertyClass(
  propClass: string | null | undefined,
  stateCode: string = DEFAULT_STATE_CODE,
): string | null {
  if (!propClass) return null;
  const code = propClass.trim();
  if (!code) return null;
  const parcelConfig = getStateConfig(stateCode)?.parcels;
  if (!parcelConfig) return null;
  const exact = parcelConfig.classDescriptions?.[code];
  if (exact) return exact;
  return parcelConfig.classSeriesLabels?.[code.charAt(0)] ?? null;
}

// Combines the raw code with its description for compact display, e.g.
// "210 – One family year-round residence". Falls back to just the code
// when no description is found.
export function formatPropertyClass(
  propClass: string | null | undefined,
  stateCode: string = DEFAULT_STATE_CODE,
): string | null {
  if (!propClass) return null;
  const description = describePropertyClass(propClass, stateCode);
  return description ? `${propClass} – ${description}` : propClass;
}
