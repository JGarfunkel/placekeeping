import { censusCivilBoundaries } from "./census";
import type { StateConfig } from "./types";

// Civil boundaries from Census TIGERweb (see census.ts), verified live
// 2026-10. No parcels service: Missouri has no free statewide parcel
// FeatureServer (only a state-owned-parcels layer from the Office of
// Administration).
export const MO_STATE_CONFIG: StateConfig = {
  code: "mo",
  name: "Missouri",
  boundingBox: { minLat: 35.9, maxLat: 40.7, minLng: -95.8, maxLng: -89.0 },
  civilBoundaries: censusCivilBoundaries("29", { townships: true }),
};
