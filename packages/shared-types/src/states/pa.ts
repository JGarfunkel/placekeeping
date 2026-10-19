import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const PA_STATE_CONFIG: StateConfig = {
  code: "pa",
  name: "Pennsylvania",
  boundingBox: { minLat: 39.7, maxLat: 42.6, minLng: -80.6, maxLng: -74.6 },
};
