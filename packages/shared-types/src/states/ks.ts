import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const KS_STATE_CONFIG: StateConfig = {
  code: "ks",
  name: "Kansas",
  boundingBox: { minLat: 36.9, maxLat: 40.1, minLng: -102.1, maxLng: -94.6 },
};
