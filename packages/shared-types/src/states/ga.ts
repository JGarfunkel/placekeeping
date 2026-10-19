import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const GA_STATE_CONFIG: StateConfig = {
  code: "ga",
  name: "Georgia",
  boundingBox: { minLat: 30.3, maxLat: 35.1, minLng: -85.7, maxLng: -80.8 },
};
