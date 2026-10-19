import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const IN_STATE_CONFIG: StateConfig = {
  code: "in",
  name: "Indiana",
  boundingBox: { minLat: 37.7, maxLat: 41.8, minLng: -88.2, maxLng: -84.8 },
};
