import { AK_STATE_CONFIG } from "./ak";
import { AL_STATE_CONFIG } from "./al";
import { AR_STATE_CONFIG } from "./ar";
import { AZ_STATE_CONFIG } from "./az";
import { CA_STATE_CONFIG } from "./ca";
import { CO_STATE_CONFIG } from "./co";
import { CT_STATE_CONFIG } from "./ct";
import { DE_STATE_CONFIG } from "./de";
import { FL_STATE_CONFIG } from "./fl";
import { GA_STATE_CONFIG } from "./ga";
import { HI_STATE_CONFIG } from "./hi";
import { IA_STATE_CONFIG } from "./ia";
import { ID_STATE_CONFIG } from "./id";
import { IL_STATE_CONFIG } from "./il";
import { IN_STATE_CONFIG } from "./in";
import { KS_STATE_CONFIG } from "./ks";
import { KY_STATE_CONFIG } from "./ky";
import { LA_STATE_CONFIG } from "./la";
import { MA_STATE_CONFIG } from "./ma";
import { MD_STATE_CONFIG } from "./md";
import { ME_STATE_CONFIG } from "./me";
import { MI_STATE_CONFIG } from "./mi";
import { MN_STATE_CONFIG } from "./mn";
import { MO_STATE_CONFIG } from "./mo";
import { MS_STATE_CONFIG } from "./ms";
import { MT_STATE_CONFIG } from "./mt";
import { NC_STATE_CONFIG } from "./nc";
import { ND_STATE_CONFIG } from "./nd";
import { NE_STATE_CONFIG } from "./ne";
import { NH_STATE_CONFIG } from "./nh";
import { NJ_STATE_CONFIG } from "./nj";
import { NM_STATE_CONFIG } from "./nm";
import { NV_STATE_CONFIG } from "./nv";
import { NY_STATE_CONFIG } from "./ny";
import { OH_STATE_CONFIG } from "./oh";
import { OK_STATE_CONFIG } from "./ok";
import { OR_STATE_CONFIG } from "./or";
import { PA_STATE_CONFIG } from "./pa";
import { RI_STATE_CONFIG } from "./ri";
import { SC_STATE_CONFIG } from "./sc";
import { SD_STATE_CONFIG } from "./sd";
import { TN_STATE_CONFIG } from "./tn";
import { TX_STATE_CONFIG } from "./tx";
import type { StateConfig } from "./types";
import { UT_STATE_CONFIG } from "./ut";
import { VA_STATE_CONFIG } from "./va";
import { VT_STATE_CONFIG } from "./vt";
import { WA_STATE_CONFIG } from "./wa";
import { WI_STATE_CONFIG } from "./wi";
import { WV_STATE_CONFIG } from "./wv";
import { WY_STATE_CONFIG } from "./wy";

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
  il: IL_STATE_CONFIG,
  mo: MO_STATE_CONFIG,
  or: OR_STATE_CONFIG,
  wa: WA_STATE_CONFIG,
  al: AL_STATE_CONFIG,
  ak: AK_STATE_CONFIG,
  az: AZ_STATE_CONFIG,
  ar: AR_STATE_CONFIG,
  ca: CA_STATE_CONFIG,
  co: CO_STATE_CONFIG,
  de: DE_STATE_CONFIG,
  fl: FL_STATE_CONFIG,
  ga: GA_STATE_CONFIG,
  hi: HI_STATE_CONFIG,
  id: ID_STATE_CONFIG,
  in: IN_STATE_CONFIG,
  ia: IA_STATE_CONFIG,
  ks: KS_STATE_CONFIG,
  ky: KY_STATE_CONFIG,
  la: LA_STATE_CONFIG,
  md: MD_STATE_CONFIG,
  mi: MI_STATE_CONFIG,
  mn: MN_STATE_CONFIG,
  ms: MS_STATE_CONFIG,
  mt: MT_STATE_CONFIG,
  ne: NE_STATE_CONFIG,
  nv: NV_STATE_CONFIG,
  nm: NM_STATE_CONFIG,
  nc: NC_STATE_CONFIG,
  nd: ND_STATE_CONFIG,
  oh: OH_STATE_CONFIG,
  ok: OK_STATE_CONFIG,
  pa: PA_STATE_CONFIG,
  sc: SC_STATE_CONFIG,
  sd: SD_STATE_CONFIG,
  tn: TN_STATE_CONFIG,
  tx: TX_STATE_CONFIG,
  ut: UT_STATE_CONFIG,
  va: VA_STATE_CONFIG,
  wv: WV_STATE_CONFIG,
  wi: WI_STATE_CONFIG,
  wy: WY_STATE_CONFIG,
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
