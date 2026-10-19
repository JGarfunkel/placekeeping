import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const WY_STATE_CONFIG: StateConfig = {
  code: "wy",
  name: "Wyoming",
  boundingBox: { minLat: 40.9, maxLat: 45.1, minLng: -111.1, maxLng: -104.0 },
};
