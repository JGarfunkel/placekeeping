import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const OH_STATE_CONFIG: StateConfig = {
  code: "oh",
  name: "Ohio",
  boundingBox: { minLat: 38.4, maxLat: 42.4, minLng: -84.9, maxLng: -80.5 },
};
