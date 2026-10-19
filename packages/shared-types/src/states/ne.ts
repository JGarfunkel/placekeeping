import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const NE_STATE_CONFIG: StateConfig = {
  code: "ne",
  name: "Nebraska",
  boundingBox: { minLat: 39.9, maxLat: 43.1, minLng: -104.1, maxLng: -95.3 },
};
