import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const AZ_STATE_CONFIG: StateConfig = {
  code: "az",
  name: "Arizona",
  boundingBox: { minLat: 31.3, maxLat: 37.1, minLng: -114.9, maxLng: -109.0 },
};
