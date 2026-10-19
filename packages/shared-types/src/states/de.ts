import type { StateConfig } from "./types";

// Bounding-box-only stub -- no civilBoundaries or parcels service confirmed
// yet. Add those once a real, verified statewide GIS service is found (see
// ny.ts for the shape once one is, or census.ts for a Census TIGERweb-backed
// civilBoundaries).
export const DE_STATE_CONFIG: StateConfig = {
  code: "de",
  name: "Delaware",
  boundingBox: { minLat: 38.4, maxLat: 39.9, minLng: -75.8, maxLng: -75.0 },
};
