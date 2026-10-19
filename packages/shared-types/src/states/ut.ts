import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const UT_STATE_CONFIG: StateConfig = {
  code: "ut",
  name: "Utah",
  boundingBox: { minLat: 36.9, maxLat: 42.1, minLng: -114.1, maxLng: -109.0 },
};
