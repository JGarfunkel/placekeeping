import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const AR_STATE_CONFIG: StateConfig = {
  code: "ar",
  name: "Arkansas",
  boundingBox: { minLat: 33.0, maxLat: 36.6, minLng: -94.7, maxLng: -89.6 },
};
