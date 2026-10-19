import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const VA_STATE_CONFIG: StateConfig = {
  code: "va",
  name: "Virginia",
  boundingBox: { minLat: 36.5, maxLat: 39.5, minLng: -83.7, maxLng: -75.2 },
};
