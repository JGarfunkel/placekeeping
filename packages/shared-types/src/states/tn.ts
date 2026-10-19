import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const TN_STATE_CONFIG: StateConfig = {
  code: "tn",
  name: "Tennessee",
  boundingBox: { minLat: 34.9, maxLat: 36.7, minLng: -90.4, maxLng: -81.6 },
};
