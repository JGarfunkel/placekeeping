import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const WV_STATE_CONFIG: StateConfig = {
  code: "wv",
  name: "West Virginia",
  boundingBox: { minLat: 37.1, maxLat: 40.7, minLng: -82.7, maxLng: -77.7 },
};
