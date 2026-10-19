import { censusCivilBoundaries } from "./census";
import type { StateConfig } from "./types";

// Civil boundaries from Census TIGERweb (see census.ts), verified live
// 2026-10. No parcels service: Illinois has no free statewide parcel
// FeatureServer (only per-county ones, e.g. Cook).
export const IL_STATE_CONFIG: StateConfig = {
  code: "il",
  name: "Illinois",
  boundingBox: { minLat: 36.9, maxLat: 42.6, minLng: -91.6, maxLng: -87.0 },
  civilBoundaries: censusCivilBoundaries("17", { townships: true }),
};
