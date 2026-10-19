import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const NC_STATE_CONFIG: StateConfig = {
  code: "nc",
  name: "North Carolina",
  boundingBox: { minLat: 33.8, maxLat: 36.7, minLng: -84.4, maxLng: -75.4 },
};
