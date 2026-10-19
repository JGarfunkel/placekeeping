import { censusCivilBoundaries } from "./census";
import type { StateConfig } from "./types";

// Civil boundaries from Census TIGERweb (see census.ts), verified live
// 2026-10. No parcels service: the search-result URL for the Oregon Parcel
// Database (or_cadastral_wm) returned "Invalid URL", and no other working
// statewide tax-lot service was found. Add `parcels` once one is verified.
export const OR_STATE_CONFIG: StateConfig = {
  code: "or",
  name: "Oregon",
  boundingBox: { minLat: 41.9, maxLat: 46.3, minLng: -124.7, maxLng: -116.4 },
  civilBoundaries: censusCivilBoundaries("41"),
};
