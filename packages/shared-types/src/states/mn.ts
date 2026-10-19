import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const MN_STATE_CONFIG: StateConfig = {
  code: "mn",
  name: "Minnesota",
  boundingBox: { minLat: 43.4, maxLat: 49.4, minLng: -97.3, maxLng: -89.4 },
};
